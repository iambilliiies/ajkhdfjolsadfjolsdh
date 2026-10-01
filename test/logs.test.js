const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Collection,AuditLogEvent,ChannelType,PermissionFlagsBits:P}=require('discord.js');
function setup(){
 const root=path.join(__dirname,'..'),cache=new Map(),guilds={},sent=[],forms=[],confirmations=[],created=[];
 const store={get:id=>guilds[id]||{},mutate:(id,fn)=>{guilds[id]||={};fn(guilds[id]);}};
 const guild={id:'guild',ownerId:'owner'},channels=new Collection();
 function channel(id){const c={id,name:id,type:ChannelType.GuildText,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async payload=>{sent.push({id,payload});}};channels.set(id,c);return c;}
 const source=channel('source');channel('logs');
 guild.channels={fetch:async id=>channels.get(id)||null,create:async spec=>{created.push(spec);return channel('new'+created.length);}};guild.members={me:{},fetch:async()=>({permissions:{has:()=>true}})};
 const message={guild,channel:source,author:{id:'owner'},member:{id:'owner',guild,user:{id:'owner',tag:'Owner'}}};
 const raid={logEnabled:false,logChannelId:null};
 function load(relative){const file=path.resolve(root,relative);if(cache.has(file))return cache.get(file);const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,__dirname:path.dirname(file),console,require:name=>{
 if(name==='./serverConfigStore')return store;
 if(name==='./general')return{embed:(title,description)=>({title,description}),reply:async(m,e)=>sent.push(e)};
 if(name==='./managementTools')return{guard:m=>{if(m.author.id!=='owner')throw new Error('Accès refusé');},authorize:()=>()=>true,channel:async(m,q)=>channels.get(q||'source')};
 if(name==='./ownerUI')return{form:async(m,t,f,a)=>forms.push(a),confirm:async(m,t,a)=>confirmations.push(a)};
 if(name==='./antiraidStore')return{get:()=>raid,save:(id,v)=>Object.assign(raid,v)};
 if(name==='./serverConfigRuntime')return{template:(text,m,g)=>text.replace('{member}',m.id).replace('{server}',g.id)};
 if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.js'));return require(name);
 }},{filename:file});cache.set(file,module.exports);return module.exports;}
 return{logs:load('utils/logs.js'),commands:load('utils/logCommands.js'),store,guild,message,sent,forms,confirmations,created,raid,client:{user:{id:'bot'}}};
}
test('activer, désactiver et exclure les logs de messages sans boucles',async()=>{
 const s=setup();await s.commands('messagelog').execute(s.message,['on','logs'],s.client);
 const message={guild:s.guild,id:'message',channelId:'source',content:'Texte',author:{id:'user',tag:'User'},attachments:new Collection()};
 await s.logs.messageDelete(message);assert.equal(s.sent.filter(x=>x.id==='logs').length,1);
 await s.commands('nolog').execute(s.message,['add','source'],s.client);await s.logs.messageDelete(message);assert.equal(s.sent.filter(x=>x.id==='logs').length,1);
 await s.commands('nolog').execute(s.message,['del','source'],s.client);await s.logs.messageDelete({...message,channelId:'logs'});assert.equal(s.sent.filter(x=>x.id==='logs').length,1);
 await s.commands('messagelog').execute(s.message,['off'],s.client);await s.logs.messageDelete(message);assert.equal(s.sent.filter(x=>x.id==='logs').length,1);
});
test('les filtres de modération utilisent l’événement d’audit sans inventer un auteur',async()=>{
 const s=setup();s.logs.mutate('guild',c=>{c.channels.mod='logs';});
 await s.logs.audit({action:AuditLogEvent.MemberUpdate,changes:[{key:'nick'}]},s.guild);assert.equal(s.sent.length,0);
 await s.logs.audit({id:'audit',action:AuditLogEvent.MemberBanAdd,targetId:'target',executor:null,reason:null},s.guild);assert.match(s.sent[0].payload.embeds[0].description,/Utilisateur inconnu/);
 await s.commands('set').execute(s.message,['modlogs'],s.client);await s.forms[0]({bans:'off',kicks:'on',timeouts:'on',messages:'on'});
 await s.logs.audit({action:AuditLogEvent.MemberBanAdd},s.guild);assert.equal(s.sent.length,1);
});
test('logs vocaux ignorent les salons exclus et les événements sans changement',async()=>{
 const s=setup();s.logs.mutate('guild',c=>{c.channels.voice='logs';c.excluded=['private'];});
 const before={guild:s.guild,channelId:'source',member:{user:{id:'user'}}};
 await s.logs.voice(before,{...before,channelId:'private'});await s.logs.voice(before,before);assert.equal(s.sent.length,0);
 await s.logs.voice(before,{...before,channelId:null});assert.equal(s.sent.length,1);
});
test('autoconfiglog attend confirmation et crée des salons privés sans doublons',async()=>{
 const s=setup();await s.commands('autoconfiglog').execute(s.message,[],s.client);assert.equal(s.created.length,0);await s.confirmations[0]();assert.equal(s.created.length,6);assert.ok(s.created.every(c=>c.permissionOverwrites.some(o=>o.id==='guild'&&o.deny.includes(P.ViewChannel))));assert.equal(s.raid.logEnabled,true);
 await s.commands('autoconfiglog').execute(s.message,[],s.client);await s.confirmations[1]();assert.equal(s.created.length,6);
});
test('boostembed test utilise le salon configuré et refuse les utilisateurs non autorisés',async()=>{
 const s=setup();s.logs.mutate('guild',c=>{c.channels.boost='logs';});await s.commands('boostembed').execute(s.message,['test'],s.client);assert.equal(s.sent[0].id,'logs');assert.match(s.sent[0].payload.embeds[0].description,/owner/);
 await assert.rejects(s.commands('boostlog').execute({...s.message,author:{id:'visitor'}},['on','logs'],s.client),/Accès/);
 assert.equal(s.logs.get('other').channels.boost,undefined);
});

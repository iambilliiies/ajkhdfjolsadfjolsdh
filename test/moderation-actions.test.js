const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Collection,PermissionsBitField,PermissionFlagsBits:P}=require('discord.js');
function setup(){
 const root=path.join(__dirname,'..'),files=new Map(),cache=new Map(),results=[],confirmations=[],actions=[];
 const fakeFs={existsSync:f=>files.has(f),readFileSync:f=>files.get(f),writeFileSync:(f,v)=>files.set(f,v),mkdirSync(){},renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
 const id='100000000000000002',guild={id:'guild',ownerId:'owner',client:{user:{id:'bot'}}};
 const member={id,guild,user:{id,tag:'User'},manageable:true,moderatable:true,kickable:true,bannable:true,roles:{cache:new Collection(),highest:{position:1},add:async()=>actions.push('role-add'),remove:async()=>actions.push('role-remove')},ban:async()=>actions.push('ban'),kick:async()=>actions.push('kick'),timeout:async v=>{actions.push(['timeout',v]);member.communicationDisabledUntilTimestamp=v?Date.now()+v:null;}};
 const overwrites=new Collection();
 const channel={id:'channel',guild,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),permissionOverwrites:{cache:overwrites,edit:async(target,values)=>{const current=overwrites.get(target)||{allow:new PermissionsBitField(),deny:new PermissionsBitField()};for(const [key,value]of Object.entries(values)){current.allow.remove(P[key]);current.deny.remove(P[key]);if(value===true)current.allow.add(P[key]);if(value===false)current.deny.add(P[key]);}overwrites.set(target,current);}}};
 guild.members={fetch:async q=>q?member:new Collection([[id,member]]),unban:async target=>actions.push(['unban',target])};guild.channels={fetch:async()=>channel};guild.bans={fetch:async()=>({user:member.user})};
 const message={id:'command',guild,channel,author:{id:'owner'},member:{roles:{highest:{comparePositionTo:()=>1}}}};
 function load(relative){const file=path.resolve(root,relative);if(cache.has(file))return cache.get(file);const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,__dirname:path.dirname(file),Date,setInterval,clearInterval,console,require:name=>{
 if(name==='node:fs')return fakeFs;if(name.endsWith('config.json'))return{owners:['root'],defaultPrefix:'+'};
 if(name==='./settings')return{isOwner:id=>id==='root',blacklisted:()=>false};
 if(name==='./general')return{id:v=>String(v).replace(/[<@!&>]/g,''),date:String,embed:(t,d)=>({title:t,description:d}),reply:async(m,e)=>results.push(e),list:async(m,t,l)=>results.push(l),member:async(m,args)=>[id,`<@${id}>`,'User'].includes(args.join(' '))?member:null};
 if(name==='./managementTools')return{guard:m=>{if(m.author.id!=='owner')throw new Error('Administrateur requis');},authorize:()=>()=>true,parts:args=>args.join(' ').split(',,').flatMap(s=>s.trim().match(/<@!?\d+>|<@&\d+>/g)||[s.trim()]).filter(Boolean),channel:async()=>channel};
 if(name==='./ownerUI')return{confirm:async(m,t,a)=>confirmations.push(a)};
 if(name==='./logs')return{send:async()=>{}};
 if(name==='./serverConfigInteractions')return{safeRole:()=>true};
 if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.js'));return require(name);
 }},{filename:file});cache.set(file,module.exports);return module.exports;}
 return{load,store:load('utils/moderationActionsStore.js'),engine:load('utils/moderationActions.js'),commands:load('utils/moderationActionCommands.js'),member,message,guild,channel,results,actions,confirmations,client:{guilds:{cache:new Collection([['guild',guild]])},user:{id:'bot'}}};
}
test('warn enregistré, del sanction confirmé et historique indépendant des sanctions actives',async()=>{
 const s=setup();await s.commands('warn').execute(s.message,[s.member.id,'raison'],s.client);assert.equal(s.store.get('guild').sanctions[s.member.id][0].reason,'raison');
 await s.commands('del').execute(s.message,['sanction',s.member.id,'1'],s.client);assert.equal(s.store.get('guild').sanctions[s.member.id].length,1);await s.confirmations[0]();assert.equal(s.store.get('guild').sanctions[s.member.id].length,0);
 s.store.mutate('guild',v=>{v.tasks.ban={kind:'ban',userId:s.member.id,expiresAt:Date.now()+1000};});await s.commands('clear').execute(s.message,['all','sanctions'],s.client);await s.confirmations[1]();assert.ok(s.store.get('guild').tasks.ban);
});
test('tempban enregistré avant action, débanni à échéance et échec sans tâche orpheline',async()=>{
 const s=setup();await s.commands('tempban').execute(s.message,[s.member.id,'1s','test'],s.client);assert.ok(s.store.get('guild').tasks['ban:'+s.member.id]);s.store.mutate('guild',v=>{v.tasks['ban:'+s.member.id].expiresAt=Date.now()-1;});await s.engine.tick(s.client);await s.engine.tick(s.client);assert.equal(s.actions.filter(a=>Array.isArray(a)&&a[0]==='unban').length,1);
 s.member.ban=async()=>{throw new Error('Ban refusé');};await s.commands('tempban').execute(s.message,[s.member.id,'1s'],s.client);assert.equal(s.store.get('guild').tasks['ban:'+s.member.id],undefined);
});
test('tempcmute restaure les anciennes permissions après expiration',async()=>{
 const s=setup();s.channel.permissionOverwrites.cache.set(s.member.id,{allow:new PermissionsBitField(P.SendMessages),deny:new PermissionsBitField(P.AddReactions)});
 await s.commands('tempcmute').execute(s.message,[s.member.id,'1s'],s.client);assert.ok(s.channel.permissionOverwrites.cache.get(s.member.id).deny.has(P.SendMessages));s.store.mutate('guild',v=>{v.tasks[`cmute:channel:${s.member.id}`].expiresAt=Date.now()-1;});await s.engine.tick(s.client);const current=s.channel.permissionOverwrites.cache.get(s.member.id);assert.ok(current.allow.has(P.SendMessages));assert.ok(current.deny.has(P.AddReactions));assert.equal(Object.keys(s.store.get('guild').tasks).length,0);
});
test('lock et hide se restaurent séparément sans effacer une modification externe',async()=>{
 const s=setup();await s.engine.overwrite(s.channel,'guild','lock',true);await s.engine.overwrite(s.channel,'guild','hide',true);await s.engine.overwrite(s.channel,'guild','lock',false);assert.ok(s.channel.permissionOverwrites.cache.get('guild').deny.has(P.ViewChannel));await s.channel.permissionOverwrites.edit('guild',{ViewChannel:true});await s.engine.overwrite(s.channel,'guild','hide',false);assert.ok(s.channel.permissionOverwrites.cache.get('guild').allow.has(P.ViewChannel));
});
test('clear filtré par membre conserve les autres auteurs et respecte la limite',async()=>{
 const s=setup();s.channel.messages={fetch:async()=>new Collection([['a',{id:'a',author:{id:s.member.id},createdTimestamp:Date.now()}],['b',{id:'b',author:{id:'other'},createdTimestamp:Date.now()}]])};let deleted=[];s.channel.bulkDelete=async c=>{deleted=[...c.keys()];return c;};await s.commands('clear').execute(s.message,['2',s.member.id],s.client);assert.deepEqual(deleted,['a']);await assert.rejects(s.commands('clear').execute(s.message,['101'],s.client),/100/);
});
test('membres protégés et configuration réservée aux administrateurs',async()=>{
 const s=setup();assert.throws(()=>s.engine.assertTarget(s.message,{...s.member,id:'owner'}),/protégé/);assert.throws(()=>s.engine.assertTarget(s.message,{...s.member,manageable:false}),/supérieur/);await assert.rejects(s.commands('kick').execute({...s.message,author:{id:'visitor'}},[s.member.id],s.client),/Administrateur/);assert.equal(Object.keys(s.store.get('other').sanctions).length,0);
});
test('verrouillage complet ferme les overwrites explicites et conserve l’accès du bot',async()=>{
 const s=setup();s.guild.members.me={permissions:{has:()=>false}};s.channel.permissionOverwrites.cache.set('staff',{allow:new PermissionsBitField(P.SendMessages),deny:new PermissionsBitField()});
 await s.engine.channelPermissions(s.channel,'lock',true,'bot');assert.ok(s.channel.permissionOverwrites.cache.get('staff').deny.has(P.SendMessages));assert.ok(s.channel.permissionOverwrites.cache.get('bot').allow.has(P.SendMessages));
 await s.engine.channelPermissions(s.channel,'lock',false,'bot');assert.ok(s.channel.permissionOverwrites.cache.get('staff').allow.has(P.SendMessages));assert.equal(s.channel.permissionOverwrites.cache.get('bot').allow.has(P.SendMessages),false);
});

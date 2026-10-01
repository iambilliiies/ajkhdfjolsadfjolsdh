const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Collection,PermissionsBitField}=require('discord.js');
function setup(){
 const root=path.join(__dirname,'..'),cache=new Map(),data={},management={},actions=[],confirms=[];
 const store={get:id=>data[id]||{},mutate:(id,fn)=>{data[id]||={};fn(data[id]);}};
 const role={id:'mute',name:'Muet',managed:false,editable:true,permissions:new PermissionsBitField(0n)};
 const member={id:'user',user:{id:'user'},joinedTimestamp:Date.now()-86400000,permissions:{has:()=>false},roles:{cache:new Collection(),add:async id=>actions.push(['role',id]),remove:async ids=>actions.push(['remove',ids])},moderatable:true,manageable:true,kickable:true,bannable:true,timeout:async time=>actions.push(['timeout',time]),kick:async()=>actions.push(['kick']),ban:async()=>actions.push(['ban'])};
 const channel={id:'channel',name:'channel',isTextBased:()=>true,permissionOverwrites:{edit:async()=>{}},permissionsFor:()=>({has:()=>true})};
 const guild={id:'guild',ownerId:'owner',roles:{fetch:async id=>id?role:new Collection([['mute',role]]),create:async()=>role},channels:{fetch:async id=>id?channel:new Collection([['channel',channel]])},members:{me:{}}};member.guild=guild;
 const message={guild,channel,author:{id:'user',bot:false},member,content:'bonjour',attachments:new Collection(),delete:async()=>actions.push(['delete'])};
 function load(relative){const file=path.resolve(root,relative);if(cache.has(file))return cache.get(file);const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,__dirname:path.dirname(file),console,Date,require:name=>{
 if(name==='./serverConfigStore')return store;
 if(name==='./moderationActionsStore')return{record(){}};
 if(name==='./settings')return{isOwner:()=>false,read:()=>({permissions:{}})};
 if(name==='./logs')return{send:async(...args)=>actions.push(['log',...args])};
 if(name==='./managementStore')return{get:id=>({tempRoles:{},...management[id]}),mutate:(id,fn)=>{management[id]||={tempRoles:{}};fn(management[id]);}};
 if(name==='./serverConfigInteractions')return{safeRole:r=>Boolean(r&&!r.managed&&r.editable&&r.id!==guild.id&&r.permissions.bitfield===0n)};
 if(name==='./general')return{embed:(t,d)=>({title:t,description:d}),reply:async(m,e)=>actions.push(['reply',e]),list:async(m,t,l)=>actions.push(['list',l]),role:async()=>role};
 if(name==='./managementTools')return{guard:m=>{if(m.author.id!=='owner')throw new Error('Administrateur requis');},authorize:()=>()=>true,channel:async()=>channel,role:async()=>role};
 if(name==='./ownerUI')return{confirm:async(m,t,a)=>confirms.push(a)};
 if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.js'));return require(name);
 }},{filename:file});cache.set(file,module.exports);return module.exports;}
 return{load,store:load('utils/moderationStore.js'),runtime:load('utils/moderation.js'),commands:load('utils/moderationCommands.js'),guild,message,member,role,channel,actions,confirms,management,admin:{...message,author:{id:'owner'}}};
}
test('antispam déclenche au seuil et les exceptions allow/deny/reset suivent le serveur',async()=>{
 const s=setup();await s.commands('antispam').execute(s.admin,['on']);await s.commands('antispam').execute(s.admin,['3/5s']);
 const config=s.store.get('guild');assert.equal(s.runtime.violations(s.message,config,1000).length,0);assert.equal(s.runtime.violations(s.message,config,1001).length,0);assert.ok(s.runtime.violations(s.message,config,1002).includes('antispam'));
 await s.commands('spam').execute(s.admin,['allow']);assert.equal(s.runtime.violations(s.message,s.store.get('guild'),1003).length,0);
 await s.commands('spam').execute(s.admin,['reset']);assert.equal(s.store.enabled(false,s.store.get('guild').spamChannels,'channel'),false);
 await s.commands('link').execute(s.admin,['deny']);s.message.content='discord.gg/test';assert.ok(s.runtime.violations(s.message,s.store.get('guild')).includes('antilink'));
});
test('liens, mentions, mots interdits littéraux et pièces jointes photo sont détectés',()=>{
 const s=setup(),c=s.store.get('guild');Object.assign(c,{antilink:true,linkMode:'invite',antimassmention:true,mentionLimit:2,badwordsEnabled:true,words:['a.b'],picChannels:['channel']});
 s.message.content='https://example.com <@123> <@&456> a.b';let found=s.runtime.violations(s.message,c);assert.ok(!found.includes('antilink'));assert.ok(found.includes('antimassmention'));assert.ok(found.includes('badwords'));assert.ok(found.includes('piconly'));
 c.linkMode='all';assert.ok(s.runtime.violations(s.message,c).includes('antilink'));
 s.message.content='';s.message.attachments.set('image',{contentType:'image/png'});assert.ok(!s.runtime.violations(s.message,c).includes('piconly'));s.message.attachments.set('pdf',{contentType:'application/pdf'});assert.ok(s.runtime.violations(s.message,c).includes('piconly'));
});
test('strikes ancien/nouveau, sanctions sans doublons et rôles protégés',async()=>{
 const s=setup();s.store.mutate('guild',c=>{c.badwordsEnabled=true;c.words=['interdit'];c.punishments=[{id:'rule',count:4,window:60000,action:'mute',duration:600000}];});s.message.content='interdit';
 await s.runtime.message(s.message);assert.equal(s.actions.filter(a=>a[0]==='timeout').length,0);await s.runtime.message(s.message);await s.runtime.message(s.message);assert.equal(s.actions.filter(a=>a[0]==='timeout').length,1);assert.equal(s.store.get('guild').history.user[0].points,2);
 s.member.roles.cache.set('keep',{id:'keep',managed:false,editable:true});s.member.roles.cache.set('remove',{id:'remove',managed:false,editable:true});
 await s.runtime.sanction(s.member,{action:'derank'},{noderank:['keep']},'test');assert.deepEqual(Array.from(s.actions.find(a=>a[0]==='remove')[1]),['remove']);
});
test('timeouts limités à 28j, expiration du rôle muet persistante et absence de raccourcissement',async()=>{
 const s=setup();await assert.rejects(s.commands('punish').execute(s.admin,['add','3','10m','mute','29j']),/28j/);
 s.member.communicationDisabledUntilTimestamp=Date.now()+3600000;await s.runtime.sanction(s.member,{action:'mute',duration:600000},{timeout:true},'test');assert.ok(s.actions.find(a=>a[0]==='timeout')[1]>3500000);
 await s.runtime.sanction(s.member,{action:'mute',duration:600000},{timeout:false,muteRoleId:'mute'},'test');assert.ok(s.management.guild.tempRoles['user:mute'].expiresAt>Date.now());
 s.member.roles.cache.set('mute',s.role);delete s.management.guild.tempRoles['user:mute'];await assert.rejects(s.runtime.sanction(s.member,{action:'mute',duration:600000},{timeout:false,muteRoleId:'mute'},'test'),/permanent/);
});
test('public off bloque les commandes custom et publiques mais conserve les accès administratifs',async()=>{
 const s=setup();await s.commands('public').execute(s.admin,['off']);assert.equal(s.runtime.publicAllowed(s.message,{name:'ping',defaultPermission:'everyone'}),false);assert.equal(s.runtime.publicAllowed(s.message),false);assert.equal(s.runtime.publicAllowed(s.message,{name:'admin',lockedPermission:true}),true);
 await s.commands('public').execute(s.admin,['allow']);assert.equal(s.runtime.publicAllowed(s.message),true);await s.commands('public').execute(s.admin,['reset']);assert.equal(s.runtime.publicAllowed(s.message),false);
});
test('clear badwords attend confirmation, limites validées et configuration non publique',async()=>{
 const s=setup();await s.commands('badwords').execute(s.admin,['add','mot,,phrase interdite']);await s.commands('clear').execute(s.admin,['badwords']);assert.equal(s.store.get('guild').words.length,2);await s.confirms[0]();assert.equal(s.store.get('guild').words.length,0);
 await s.commands('clear').execute(s.admin,['limit','250']);assert.equal(s.store.get('guild').clearLimit,250);await assert.rejects(s.commands('clear').execute(s.admin,['limit','1001']),/1000/);await assert.rejects(s.commands('timeout').execute(s.message,['off']),/Administrateur/);assert.equal(s.store.get('other').clearLimit,100);
});
test('clear supprime par lots et conserve les messages épinglés ou de plus de 14 jours',async()=>{
 const s=setup();s.admin.id='command';let removed=[];s.channel.messages={fetch:async options=>{assert.equal(options.before,'command');return new Collection([['recent',{id:'recent',createdTimestamp:Date.now()-1000,pinned:false}],['pinned',{id:'pinned',createdTimestamp:Date.now()-1000,pinned:true}],['old',{id:'old',createdTimestamp:Date.now()-15*86400000,pinned:false}]]);}};
 s.channel.bulkDelete=async collection=>{removed=[...collection.keys()];return collection;};
 await s.commands('clear').execute(s.admin,['3']);assert.deepEqual(removed,['recent']);assert.match(s.actions.find(a=>a[0]==='reply')[1].description,/1 message.*2 message/s);
 await assert.rejects(s.commands('clear').execute(s.admin,['101']),/100/);
});
test('muterole configure les permissions et affiche les salons en échec',async()=>{
 const s=setup();s.store.mutate('guild',c=>{c.muteRoleId='mute';});s.channel.permissionOverwrites.edit=async()=>{throw new Error('ManageChannels manquant');};
 await s.commands('muterole').execute(s.admin,[]);const lines=s.actions.find(a=>a[0]==='list')[1];assert.ok(lines.some(line=>line.includes('ManageChannels manquant')));assert.equal(s.store.get('guild').muteRoleId,'mute');
});

const { PermissionFlagsBits: P } = require('discord.js');
const { randomUUID } = require('node:crypto');
const store = require('./moderationStore'), g = require('./general'), tools = require('./managementTools'), ui = require('./ownerUI');
const { duration, limit } = require('./antiraidStore');
const definitions = {
 settings:[['settings','Affiche les paramètres du bot sur le serveur']],
 timeout:[['timeout <on/off>','Utilise les timeouts Discord ou le rôle muet (maximum timeout : 28 jours)']],
 clear:[['clear limit <nombre>','Définit le maximum de messages supprimés par clear'],['clear badwords','Vide la liste des mots interdits']],
 muterole:[['muterole','Crée ou met à jour le rôle muet et affiche les erreurs de permissions']],
 set:[['set muterole <rôle>','Définit un rôle muet existant']],
 antispam:[['antispam <on/off>','Active ou désactive l’antispam'],['antispam <nombre>/<durée>','Configure le seuil de messages dans une durée']],
 antilink:[['antilink <on/off>','Active ou désactive l’antilink'],['antilink invite/all','Bloque seulement les invitations Discord ou tous les liens']],
 antimassmention:[['antimassmention <on/off>','Active ou désactive la protection contre les mentions'],['antimassmention <nombre>','Définit le seuil de mentions dans un message']],
 badwords:[['badwords <on/off>','Active ou désactive les mots interdits'],['badwords <add/del> <mot>','Ajoute ou retire un mot interdit'],['badwords list','Affiche la liste des mots interdits']],
 spam:[['spam <allow/deny/reset> [salon]','Autorise le spam, le bloque ou suit le réglage du serveur']],
 link:[['link <allow/deny/reset> [salon]','Autorise les liens, les bloque ou suit le réglage du serveur']],
 strikes:[['strikes','Affiche les strikes par déclencheur et ancienneté'],['strikes <déclencheur> <nombre> [ancien/nouveau]','Modifie les strikes attribués pour une action']],
 ancien:[['ancien <durée>','Définit l’ancienneté d’un membre sur le serveur']],
 punish:[['punish','Affiche les sanctions par nombre de strikes'],['punish add <nombre> <durée> <sanction> [durée]','Ajoute une sanction dans une fenêtre de temps'],['punish del <nombre>','Supprime une sanction par son numéro'],['punish setup','Rétablit les sanctions par défaut']],
 noderank:[['noderank <add/del> <rôle>','Préserve des rôles lors des deranks']],
 piconly:[['piconly <add/del> [salon]','Autorise uniquement les pièces jointes photo dans un salon']],
 join:[['join settings','Configure les actions à l’arrivée des membres']],leave:[['leave settings','Configure les actions au départ des membres']],
 public:[['public <on/off>','Active ou désactive les commandes publiques'],['public <allow/deny/reset> [salon]','Autorise, interdit ou synchronise les commandes publiques par salon']]
};
const boolean = v => { if (!['on','off'].includes(v)) throw new Error('Indique on ou off.'); return v === 'on'; };
const number = (v,max=10000,min=1) => { if (!/^\d+$/.test(v || '') || Number(v)<min || Number(v)>max) throw new Error(`Nombre entier attendu entre ${min} et ${max}.`); return Number(v); };
async function configureMuteRole(message) {
 const guild=message.guild,config=store.get(guild.id),roles=await guild.roles.fetch();
 let role=config.muteRoleId?roles.get(config.muteRoleId):null;
 if (!role && !config.muteRoleId) { const matches=roles.filter(r=>r.name.toLowerCase()==='muet'); if(matches.size===1)role=matches.first(); }
 if (!role && config.muteRoleId) throw new Error('Le rôle muet configuré a disparu : utilise set muterole avec un rôle valide.');
 if (!role) role=await guild.roles.create({name:'Muet',permissions:[],reason:'Configuration du rôle muet'});
 if(!require('./serverConfigInteractions').safeRole(role,guild))throw new Error('Rôle muet dangereux, géré ou supérieur au bot.');
 store.mutate(guild.id,s=>{s.muteRoleId=role.id;});
 const channels=await guild.channels.fetch(),errors=[];
 for(const channel of channels.values())if(channel?.permissionOverwrites){try {await channel.permissionOverwrites.edit(role.id,{SendMessages:false,SendMessagesInThreads:false,AddReactions:false,Speak:false,Stream:false,CreatePublicThreads:false,CreatePrivateThreads:false}, {reason:'Configuration du rôle muet'});}catch(error){errors.push(`<#${channel.id}> : ${error.message}`);}}
 return g.list(message,'Rôle muet', [`Rôle : <@&${role.id}>`,...errors.length?errors:['Permissions configurées dans tous les salons.']]);
}
async function clearMessages(message, count) {
 const config=store.get(message.guild.id); number(String(count),config.clearLimit);
 if(!message.channel.bulkDelete)throw new Error('Salon incompatible.');
 let before=message.id, deleted=0, skipped=0, remaining=count;
 while(remaining>0){const batch=await message.channel.messages.fetch({limit:Math.min(100,remaining),before});if(!batch.size)break;remaining-=batch.size;before=batch.last().id;
 const recent=batch.filter(m=>!m.pinned && Date.now()-m.createdTimestamp<14*86400000-5000);skipped+=batch.size-recent.size;
 if(recent.size)deleted+=(await message.channel.bulkDelete(recent,true)).size;
 if(batch.size<Math.min(100,remaining+batch.size))break;
 }
 return g.reply(message,g.embed('Clear',`${deleted} message(s) supprimé(s). ${skipped} message(s) conservé(s) car épinglé(s) ou trop ancien(s).`));
}
async function execute(name,message,args,client){
 tools.guard(message);const guild=message.guild,config=store.get(guild.id),send=text=>g.reply(message,g.embed('Paramètres de modération',text)),change=fn=>store.mutate(guild.id,fn),confirm=(text,fn)=>ui.confirm(message,text,fn,tools.authorize(message));
 if(['join','leave'].includes(name))return require('./serverConfigCommands')(name).execute(message,args,client);
 if(name==='settings')return require('./logCommands')('settings').execute(message,args,client);
 if(name==='timeout'){const enabled=boolean(args[0]);if(enabled&&config.punishments.some(r=>r.action==='mute'&&r.duration>28*86400000))throw new Error('Une sanction mute dépasse 28 jours ; modifie-la avant d’activer les timeouts.');change(s=>{s.timeout=enabled;});return send(enabled?'Timeout Discord activé.':'Rôle muet activé. Configure-le avec muterole.');}
 if(name==='clear'){
  if(/^\d+$/.test(args[0]))return clearMessages(message,Number(args[0]));
  if(args[0]==='limit'){const value=number(args[1],1000);change(s=>{s.clearLimit=value;});return send(`Limite clear : ${value}.`);}
  if(args[0]==='badwords')return confirm('Supprimer tous les mots interdits ?',()=>change(s=>{s.words=[];}));
 }
 if(name==='muterole')return configureMuteRole(message);
 if(name==='set'){const role=await tools.role(message,args.slice(1).join(' '));if(!require('./serverConfigInteractions').safeRole(role,guild))throw new Error('Rôle muet dangereux ou non attribuable.');change(s=>{s.muteRoleId=role.id;});return send(`Rôle muet : <@&${role.id}>. Utilise muterole pour régler ses permissions.`);}
 if(name==='antispam'){if(['on','off'].includes(args[0]))change(s=>{s.antispam=boolean(args[0]);});else{const value=limit(args[0]);if(value.count>1000)throw new Error('Maximum 1000 messages par fenêtre.');change(s=>{s.spamLimit=value;});}return send('Antispam mis à jour.');}
 if(name==='antilink'){if(['on','off'].includes(args[0]))change(s=>{s.antilink=boolean(args[0]);});else if(['invite','all'].includes(args[0]))change(s=>{s.linkMode=args[0];});else throw new Error('Utilise on/off/invite/all.');return send('Antilink mis à jour.');}
 if(name==='antimassmention'){if(['on','off'].includes(args[0]))change(s=>{s.antimassmention=boolean(args[0]);});else{const value=number(args[0],1000);change(s=>{s.mentionLimit=value;});}return send('Seuil de mentions mis à jour.');}
 if(name==='badwords'){
  if(args[0]==='list')return g.list(message,'Mots interdits',config.words);
  if(['on','off'].includes(args[0]))change(s=>{s.badwordsEnabled=boolean(args[0]);});
  else if(['add','del'].includes(args[0])){const words=args.slice(1).join(' ').split(',,').map(v=>require('./moderation').normalize(v.trim())).filter(Boolean);if(!words.length||words.some(v=>v.length>100))throw new Error('Mot requis, maximum 100 caractères.');change(s=>{const next=args[0]==='add'?[...new Set([...s.words,...words])]:s.words.filter(w=>!words.includes(w));if(next.length>500)throw new Error('Maximum 500 mots interdits.');s.words=next;});}
  else throw new Error('Utilise on/off/add/del/list.');return send('Mots interdits mis à jour.');
 }
 if(['spam','link','public'].includes(name)){
  if(name==='public'&&['on','off'].includes(args[0])){change(s=>{s.publicEnabled=boolean(args[0]);});return send('Commandes publiques mises à jour.');}
  if(!['allow','deny','reset'].includes(args[0]))throw new Error('Utilise allow/deny/reset [salon].');
  const key={spam:'spamChannels',link:'linkChannels',public:'publicChannels'}[name],ids=[];
  for(const query of(args.slice(1).join(' ')||message.channel.id).split(',,').map(v=>v.trim()).filter(Boolean))ids.push((await tools.channel(message,query)).id);
  change(s=>{for(const id of ids)if(args[0]==='reset')delete s[key][id];else s[key][id]=name==='public'?args[0]==='allow':args[0]==='deny';});return send('Exceptions de salons mises à jour.');
 }
 if(name==='ancien'){const age=duration(args[0]);change(s=>{s.ancientAge=age;});return send(`Membre ancien après ${age/1000} secondes sur le serveur.`);}
 if(name==='strikes'){
  if(!args.length)return g.list(message,'Strikes par déclencheur',store.triggers.map(k=>`**${k}** : ancien ${config.strikes[k].ancien}, nouveau ${config.strikes[k].nouveau}`));
  const key=args[0];if(!store.triggers.includes(key))throw new Error(`Déclencheurs : ${store.triggers.join(', ')}.`);const points=number(args[1],100,0),groups=args[2]?[args[2]]:['ancien','nouveau'];if(groups.some(k=>!['ancien','nouveau'].includes(k)))throw new Error('Utilise ancien ou nouveau.');change(s=>{for(const kind of groups)s.strikes[key][kind]=points;});return send('Strikes mis à jour.');
 }
 if(name==='punish'){
  if(!args.length)return g.list(message,'Sanctions par strikes',config.punishments.map((r,i)=>`**${i+1}** : ${r.count} strikes / ${r.window/1000}s → ${r.action}${r.duration?' '+r.duration/1000+'s':''}`));
  if(args[0]==='setup')return confirm('Rétablir les sanctions par défaut ?',()=>change(s=>{s.punishments=store.defaultPunishments();s.applied={};}));
  if(args[0]==='del'){const index=number(args[1],config.punishments.length)-1;change(s=>{s.punishments.splice(index,1);});return send('Sanction supprimée.');}
  if(args[0]==='add'){const count=number(args[1]),window=duration(args[2]),action=args[3],time=action==='mute'?duration(args[4]):0;if(!window||!['mute','derank','kick','ban'].includes(action)||action==='mute'&&(!time||config.timeout&&time>28*86400000))throw new Error('Sanction : mute (durée requise, max 28j en timeout), derank, kick ou ban ; fenêtre positive requise.');if(args[4]&&action!=='mute')throw new Error('La durée finale concerne uniquement mute. Les bans sont permanents.');if(config.punishments.length>=30)throw new Error('Maximum 30 sanctions.');change(s=>{s.punishments.push({id:randomUUID(),count,window,action,duration:time});});return send('Sanction ajoutée.');}
 }
 if(['noderank','piconly'].includes(name)){
  if(!['add','del'].includes(args[0]))throw new Error('Utilise add/del.');const ids=[];
  for(const query of(args.slice(1).join(' ')||(name==='piconly'?message.channel.id:'')).split(',,').map(v=>v.trim()).filter(Boolean)){
   if(name==='noderank'){const role=await g.role(message,[query]);if(!role)throw new Error('Rôle introuvable.');ids.push(role.id);}else{const channel=await tools.channel(message,query);if(!channel.isTextBased())throw new Error('Salon textuel requis.');ids.push(channel.id);}
  }
  if(!ids.length)throw new Error('Rôle ou salon requis.');const key=name==='noderank'?'noderank':'picChannels';change(s=>{s[key]=args[0]==='add'?[...new Set([...s[key],...ids])]:s[key].filter(id=>!ids.includes(id));});return send('Liste mise à jour.');
 }
 throw new Error('Sous-commande invalide.');
}
const matches={settings:()=>true,set:a=>a[0]==='muterole',clear:a=>['limit','badwords'].includes(a[0])||/^\d+$/.test(a[0]),join:a=>a[0]==='settings',leave:a=>a[0]==='settings'};
module.exports=name=>({name,category:'Paramètres de modération',defaultPermission:'Administrator',lockedPermission:true,usage:definitions[name][0][0],description:definitions[name][0][1],helpEntries:definitions[name].map(([usage,description])=>({usage,description})),matches:matches[name],execute:(m,a,c)=>execute(name,m,a,c)});
module.exports.names=Object.keys(definitions);

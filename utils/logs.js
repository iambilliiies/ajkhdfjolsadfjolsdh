const { AuditLogEvent: A, PermissionFlagsBits: P } = require('discord.js');
const store = require('./serverConfigStore');
const g = require('./general');
const defaults = () => ({ channels: {}, excluded: [], moderation: { bans: true, kicks: true, timeouts: true, messages: true }, boostEmbed: { enabled: false, channelId: null, title: 'Merci pour le boost !', description: '{member} vient de booster {server} !' } });
function get(id) { const base=defaults(), saved=store.get(id).logs || {}; return { ...base, ...saved, moderation:{...base.moderation,...saved.moderation},boostEmbed:{...base.boostEmbed,...saved.boostEmbed} }; }
function mutate(id, action) { store.mutate(id, state => { const logs=get(id);action(logs);state.logs=logs; }); }
async function send(guild,type,title,text,sourceId) {
 const config=get(guild.id),id=config.channels[type];
 if(!id || sourceId && ['message','voice'].includes(type) && config.excluded.includes(sourceId) || sourceId && Object.values(config.channels).includes(sourceId)) return;
 try { const channel=await guild.channels.fetch(id);if(channel?.isTextBased())await channel.send({embeds:[g.embed(title,text)],allowedMentions:{parse:[]}}); }
 catch(error){console.error(`Logs ${type} :`,error.message);}
}
const user=value=>value?`${value.tag || value.username || value.id} (${value.id})`:'Utilisateur inconnu';
async function messageDelete(message) {
 if(!message.guild) return;
 await send(message.guild,'message','Message supprimé',`**Auteur :** ${user(message.author)}\n**Salon :** <#${message.channelId || message.channel.id}>\n**ID :** ${message.id}\n\n${message.content || '[Contenu non disponible en cache]'}${message.attachments?.size?'\nPièces jointes : '+message.attachments.map(a=>a.url).join('\n'):''}`,message.channelId || message.channel.id);
}
async function messageUpdate(before,after) {
 if(!after.guild || before.content===after.content) return;
 await send(after.guild,'message','Message modifié',`**Auteur :** ${user(after.author)}\n[Voir le message](${after.url})\n**Avant :**\n${(before.content || '[Non disponible en cache]').slice(0,1600)}\n**Après :**\n${(after.content || '[Sans texte]').slice(0,1600)}`,after.channelId || after.channel.id);
}
async function voice(before,after) {
 if(before.channelId===after.channelId && before.selfMute===after.selfMute && before.selfDeaf===after.selfDeaf && before.serverMute===after.serverMute && before.serverDeaf===after.serverDeaf && before.streaming===after.streaming) return;
 const config=get(after.guild.id);if(config.excluded.includes(before.channelId)||config.excluded.includes(after.channelId))return;
 const changes=[];
 if(before.channelId!==after.channelId)changes.push(`Salon : ${before.channelId?`<#${before.channelId}>`:'hors vocal'} → ${after.channelId?`<#${after.channelId}>`:'hors vocal'}`);
 for(const [key,label]of [['selfMute','Micro coupé'],['selfDeaf','Son coupé'],['serverMute','Mute serveur'],['serverDeaf','Deafen serveur'],['streaming','Stream']])if(before[key]!==after[key])changes.push(`${label} : ${after[key]?'oui':'non'}`);
 await send(after.guild,'voice','Activité vocale',`**Membre :** ${user(after.member?.user)}\n${changes.join('\n')}`,after.channelId||before.channelId);
}
async function boostEmbed(member,force=false) {
 const config=get(member.guild.id),embed=config.boostEmbed;
 if(!force&&!embed.enabled)return;
 const id=embed.channelId||config.channels.boost;if(!id)throw new Error('Configure un salon avec boostlog on ou set boostembed.');
 const channel=await member.guild.channels.fetch(id);
 const template=text=>require('./serverConfigRuntime').template(text,member,member.guild);
 await channel.send({embeds:[g.embed(template(embed.title),template(embed.description))],allowedMentions:{parse:[]}});
}
async function memberUpdate(before,after) {
 const oldRoles=before.roles.cache,newRoles=after.roles.cache;
 const added=newRoles.filter(r=>!oldRoles.has(r.id)),removed=oldRoles.filter(r=>!newRoles.has(r.id));
 if(added.size||removed.size)await send(after.guild,'role','Rôles d’un membre modifiés',`**Membre :** ${user(after.user)}\nAjoutés : ${added.map(r=>`<@&${r.id}>`).join(', ')||'aucun'}\nRetirés : ${removed.map(r=>`<@&${r.id}>`).join(', ')||'aucun'}`);
 if(Boolean(before.premiumSince)!==Boolean(after.premiumSince)) {
  await send(after.guild,'boost',after.premiumSince?'Nouveau boost':'Fin de boost',`**Membre :** ${user(after.user)}\n**Boosts du serveur :** ${after.guild.premiumSubscriptionCount || 0}`);
  if(after.premiumSince)await boostEmbed(after).catch(e=>console.error('Embed boost :',e.message));
 }
}
async function role(type,before,after) {
 const value=after||before;
 if(type==='modifié'&&before.name===after.name&&before.color===after.color&&before.permissions.bitfield===after.permissions.bitfield&&before.hoist===after.hoist&&before.mentionable===after.mentionable&&before.position===after.position)return;
 await send(value.guild,'role',`Rôle ${type}`,`**Nom :** ${value.name}\n**ID :** ${value.id}${after&&before?`\nAncien nom : ${before.name}\nPermissions : ${before.permissions.bitfield} → ${after.permissions.bitfield}`:''}`);
}
const moderationTypes=new Map([[A.MemberBanAdd,'bans'],[A.MemberBanRemove,'bans'],[A.MemberKick,'kicks'],[A.MemberUpdate,'timeouts'],[A.MessageDelete,'messages'],[A.MessageBulkDelete,'messages']]);
async function audit(entry,guild) {
 const kind=moderationTypes.get(entry.action);if(!kind||!get(guild.id).moderation[kind])return;
 if(kind==='timeouts'&&!entry.changes.some(c=>c.key==='communication_disabled_until'))return;
 if(kind==='messages'&&get(guild.id).excluded.includes(entry.extra?.channel?.id))return;
 await send(guild,'mod','Action de modération',`**Action :** ${A[entry.action] || entry.action}\n**Responsable :** ${user(entry.executor)}\n**Cible :** ${entry.targetId || entry.target?.id || 'inconnue'}\n**Raison :** ${entry.reason || 'Aucune'}\n**Audit :** ${entry.id}`);
}
module.exports={get,mutate,send,messageDelete,messageUpdate,voice,memberUpdate,boostEmbed,role,audit,defaults};

const {PermissionFlagsBits:P}=require('discord.js');
const store=require('./moderationActionsStore'),settings=require('./settings');
const queues=new Map();
function assertTarget(message,member){
 if([message.guild.ownerId,message.guild.client.user.id,message.author.id].includes(member.id)||settings.isOwner(member.id))throw new Error('Ce membre est protégé.');
 if(!member.manageable)throw new Error('Membre supérieur ou égal au bot.');
 if(!settings.isOwner(message.author.id)&&message.author.id!==message.guild.ownerId&&message.member.roles.highest.comparePositionTo(member.roles.highest)<=0)throw new Error('Le membre doit être sous ton rôle le plus haut.');
}
async function serial(key,fn){const previous=queues.get(key)||Promise.resolve(),work=previous.catch(()=>{}).then(fn);queues.set(key,work);try{return await work;}finally{if(queues.get(key)===work)queues.delete(key);}}
const fields={lock:['SendMessages','SendMessagesInThreads','CreatePublicThreads','CreatePrivateThreads','Connect','Speak'],hide:['ViewChannel'],cmute:['SendMessages','SendMessagesInThreads','AddReactions']};
function bitValue(overwrite,field){return overwrite?.allow.has(P[field])?true:overwrite?.deny.has(P[field])?false:null;}
async function overwrite(channel,targetId,kind,enable){return serial(`${channel.guild.id}:${channel.id}:${targetId}:${kind}`,async()=>{
 const key=`${channel.id}:${targetId}:${kind}`,existing=store.get(channel.guild.id).overwrites[key],current=channel.permissionOverwrites.cache.get(targetId);
 if(enable){if(existing)return;const values=Object.fromEntries(fields[kind].map(field=>[field,bitValue(current,field)]));
 store.mutate(channel.guild.id,s=>{s.overwrites[key]={channelId:channel.id,targetId,kind,values};});
 try{await channel.permissionOverwrites.edit(targetId,Object.fromEntries(fields[kind].map(f=>[f,false])));}catch(error){store.mutate(channel.guild.id,s=>{delete s.overwrites[key];});throw error;}
 }else{
 const values=existing?.values||Object.fromEntries(fields[kind].map(f=>[f,null]));
 const restore=Object.fromEntries(Object.entries(values).filter(([field])=>!existing||bitValue(current,field)===false));
 if(Object.keys(restore).length)await channel.permissionOverwrites.edit(targetId,restore);
 store.mutate(channel.guild.id,s=>{delete s.overwrites[key];delete s.tasks[`cmute:${channel.id}:${targetId}`];});
 }
});}
async function unmute(member){
 await member.timeout(null,'Fin du mute').catch(error=>{if(member.communicationDisabledUntilTimestamp>Date.now())throw error;});
 const config=require('./moderationStore').get(member.guild.id),state=store.get(member.guild.id),roleId=state.mutes[member.id]?.roleId||config.muteRoleId;
 if(roleId&&member.roles.cache.has(roleId))await member.roles.remove(roleId,'Fin du mute');
 if(roleId)require('./managementStore').mutate(member.guild.id,s=>{delete s.tempRoles[`${member.id}:${roleId}`];});
 store.mutate(member.guild.id,s=>{delete s.mutes[member.id];delete s.tasks[`mute:${member.id}`];});
}
async function channelPermissions(channel,kind,enable,botId){
 return serial(`${channel.guild.id}:channel:${channel.id}:${kind}`,async()=>{
  const state=store.get(channel.guild.id),botKey=`${channel.id}:${botId}:${kind}:bot`;
  if(enable){
   if(!channel.guild.members.me?.permissions.has(P.Administrator)&&!state.overwrites[botKey]){
    const current=channel.permissionOverwrites.cache.get(botId),values=Object.fromEntries(fields[kind].map(f=>[f,bitValue(current,f)]));
    store.mutate(channel.guild.id,s=>{s.overwrites[botKey]={channelId:channel.id,targetId:botId,kind:`${kind}-bot`,values};});
    try{await channel.permissionOverwrites.edit(botId,Object.fromEntries(fields[kind].map(f=>[f,true])));}catch(error){store.mutate(channel.guild.id,s=>{delete s.overwrites[botKey];});throw error;}
   }
   const targets=[...new Set([channel.guild.id,...channel.permissionOverwrites.cache.keys()])].filter(id=>id!==botId);
   for(const id of targets)await overwrite(channel,id,kind,true);
  }else{
   const records=Object.values(state.overwrites).filter(r=>r.channelId===channel.id&&r.kind===kind);
   for(const id of new Set([channel.guild.id,...records.map(r=>r.targetId)]))await overwrite(channel,id,kind,false);
   const bot=state.overwrites[botKey];if(bot){const current=channel.permissionOverwrites.cache.get(botId),restore=Object.fromEntries(Object.entries(bot.values).filter(([field])=>bitValue(current,field)===true));if(Object.keys(restore).length)await channel.permissionOverwrites.edit(botId,restore);store.mutate(channel.guild.id,s=>{delete s.overwrites[botKey];});}
  }
 });
}
async function mute(member,time,reason='Mute de modération'){
 const config=require('./moderationStore').get(member.guild.id),expiresAt=time?Date.now()+time:0;
 if(config.timeout){if(!member.moderatable)throw new Error('Timeout impossible.');if(time>28*86400000)throw new Error('Timeout limité à 28 jours.');await member.timeout(time||28*86400000,reason);store.mutate(member.guild.id,s=>{s.mutes[member.id]={timeout:true,expiresAt:Date.now()+(time||28*86400000)};});}
 else{
 const role=config.muteRoleId&&await member.guild.roles.fetch(config.muteRoleId);if(!require('./serverConfigInteractions').safeRole(role,member.guild))throw new Error('Configure un rôle muet valide avec muterole.');
 const management=require('./managementStore'),key=`${member.id}:${role.id}`,previous=management.get(member.guild.id).tempRoles[key];
 if(time&&member.roles.cache.has(role.id)&&!store.get(member.guild.id).mutes[member.id]?.expiresAt&&!previous)throw new Error('Le rôle muet est déjà permanent.');
 management.mutate(member.guild.id,s=>{delete s.tempRoles[key];if(time)s.tempRoles[key]={userId:member.id,roleId:role.id,expiresAt};});
 try{await member.roles.add(role.id,reason);}catch(error){management.mutate(member.guild.id,s=>{if(previous)s.tempRoles[key]=previous;else delete s.tempRoles[key];});throw error;}
 store.mutate(member.guild.id,s=>{s.mutes[member.id]={roleId:role.id,timeout:false,expiresAt};});
 }
}
let busy=false;
async function tick(client){if(busy)return;busy=true;try{for(const [guildId,s]of Object.entries(store.read())){const guild=client.guilds.cache.get(guildId);if(!guild)continue;
 for(const [key,task]of Object.entries(s.tasks||{}))if(task.expiresAt<=Date.now()&&(!task.retryAt||task.retryAt<=Date.now()))await serial(`${guildId}:user:${task.userId}`,async()=>{const current=store.get(guildId).tasks[key];if(!current||current.expiresAt>Date.now())return;
 try{if(task.kind==='ban'){if(settings.blacklisted(task.userId))throw new Error('Membre encore dans la blacklist du bot.');const ban=await guild.bans.fetch(task.userId).catch(e=>{if(e.code===10026)return null;throw e;});if(ban)await guild.members.unban(task.userId,'Expiration du ban temporaire');}
 if(task.kind==='cmute'){const channel=await guild.channels.fetch(task.channelId).catch(e=>{if(e.code===10003)return null;throw e;});if(channel)await overwrite(channel,task.userId,'cmute',false);}
 store.mutate(guildId,state=>{delete state.tasks[key];});
 }catch(error){console.error('Expiration modération :',error.message);store.mutate(guildId,state=>{if(state.tasks[key])state.tasks[key].retryAt=Date.now()+60000;});}
 });
 for(const [id,mute]of Object.entries(s.mutes||{}))if(mute.expiresAt&&mute.expiresAt<=Date.now())store.mutate(guildId,state=>{delete state.mutes[id];});
 }}finally{busy=false;}}
function start(client){if(client.moderationActionsTimer)clearInterval(client.moderationActionsTimer);client.moderationActionsTimer=setInterval(()=>tick(client).catch(e=>console.error(e.message)),15000);client.moderationActionsTimer.unref();return tick(client);}
module.exports={assertTarget,serial,overwrite,channelPermissions,mute,unmute,tick,start,bitValue};

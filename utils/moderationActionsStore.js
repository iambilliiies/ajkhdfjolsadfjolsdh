const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../data/moderation-actions.json');
const defaults=()=>({sanctions:{},tasks:{},mutes:{},overwrites:{}});
function read(){if(!fs.existsSync(file))return{};const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Historique de modération invalide.');return data;}
const get=id=>({...defaults(),...read()[id]});
function mutate(id,fn){const data=read(),state={...defaults(),...data[id]};fn(state);data[id]=state;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);return state;}
function record(guildId,userId,action,actorId,reason,duration=0){const {randomUUID}=require('node:crypto');const entry={id:randomUUID(),action,actorId,reason:reason||'Aucune raison',duration,at:Date.now()};mutate(guildId,s=>{s.sanctions[userId]||=[];s.sanctions[userId].push(entry);});return entry;}
module.exports={read,get,mutate,record};

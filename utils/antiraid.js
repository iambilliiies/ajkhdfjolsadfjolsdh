const { AuditLogEvent: A, PermissionFlagsBits: P, PermissionsBitField } = require('discord.js');
const store = require('./antiraidStore');
const settings = require('./settings');
const { embed } = require('./general');
const windows = new Map(), seen = new Map(), sanctions = new Map(), snapshots = new Map(), queues = new Map();
const dangerous = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageWebhooks, P.BanMembers, P.KickMembers, P.MentionEveryone, P.ModerateMembers];
const danger = permissions => new PermissionsBitField(permissions).any(dangerous, false);
function exempt(guild, id, mode, config = store.get(guild.id)) {
    if (!id) return true; // Ne jamais deviner l’auteur d’une action.
    if (id === guild.client.user.id || id === guild.ownerId || settings.isOwner(id)) return true;
    return mode !== 'max' && config.whitelist.includes(id);
}
function count(key, duration, amount = 1, now = Date.now()) {
    // Nettoie les compteurs inactifs et évite une croissance sans borne.
    for (const [id, window] of windows) if (now - window.updated > 3600000) windows.delete(id);
    const entries = (windows.get(key)?.entries || []).filter(entry => now - entry.time < duration);
    entries.push({ time: now, amount });
    windows.set(key, { entries, updated: now });
    if (windows.size > 10000) windows.delete(windows.keys().next().value);
    return entries.reduce((total, entry) => total + entry.amount, 0);
}
async function log(guild, feature, text, ping = true) {
    console.log(`[Antiraid ${guild.id}] ${feature} : ${text}`);
    const config = store.get(guild.id);
    if (!config.logEnabled || !config.logChannelId) return;
    try {
        const channel = await guild.channels.fetch(config.logChannelId);
        if (!channel?.isTextBased()) return;
        await channel.send({ content: ping && config.pingRoleIds.length ? config.pingRoleIds.map(id => `<@&${id}>`).join(' ') : undefined, embeds: [embed(`🛡 Antiraid • ${feature}`, text)], allowedMentions: { parse: [], roles: ping ? config.pingRoleIds : [] } });
    } catch (error) { console.error('Logs antiraid :', error.message); }
}
async function punish(guild, id, feature, mode, config = store.get(guild.id)) {
    if (exempt(guild, id, mode, config)) return 'Exempté';
    const key = `${guild.id}:${feature}:${id}`, now = Date.now();
    for (const [key, time] of sanctions) if (now - time > 10000) sanctions.delete(key);
    if (sanctions.has(key)) return 'Sanction déjà traitée récemment';
    sanctions.set(key, now);
    const reason = `Antiraid : ${feature}`;
    try {
        const member = await guild.members.fetch(id);
        const action = config.punishments[feature] || 'derank';
        if (action === 'ban') {
            if (!member.bannable) throw new Error('Bannissement impossible (permission ou hiérarchie).');
            await member.ban({ reason });
        } else if (action === 'kick') {
            if (!member.kickable) throw new Error('Expulsion impossible (permission ou hiérarchie).');
            await member.kick(reason);
        } else {
            if (!guild.members.me?.permissions.has(P.ManageRoles)) throw new Error('ManageRoles manquant.');
            const protectedRoles = require('./moderationStore').get(guild.id).noderank;
            const removable = member.roles.cache.filter(role => role.id !== guild.id && !role.managed && role.editable && !protectedRoles.includes(role.id));
            if (!removable.size) throw new Error('Aucun rôle retirable (hiérarchie ou rôle géré).');
            await member.roles.remove([...removable.keys()], reason);
        }
        require('./moderationActionsStore').record(guild.id,id,action,guild.client?.user.id||'antiraid',reason);
        return `${action} effectué`;
    } catch (error) { return `Sanction impossible : ${error.message}`; }
}
async function stripRank(member, config = store.get(member.guild.id)) {
    const mode = config.modes.blrank;
    if (mode === 'off' || !config.rankBlacklist.includes(member.id) || exempt(member.guild, member.id, mode, config)) return;
    const roles = member.roles.cache.filter(role => role.id !== member.guild.id && (config.rankScope === 'all' || danger(role.permissions)));
    if (!roles.size) return;
    const editable = roles.filter(role => !role.managed && role.editable);
    let text = `Blacklist rank de <@${member.id}> : `;
    try {
        if (editable.size) await member.roles.remove([...editable.keys()], 'Antiraid : blacklist rank');
        text += `${editable.size} rôle(s) retiré(s), ${roles.size - editable.size} rôle(s) non retirable(s).`;
    } catch (error) { text += `échec : ${error.message}`; }
    if (config.punishments.blrank !== 'derank') text += ` ${await punish(member.guild, member.id, 'blrank', mode, config)}.`;
    await log(member.guild, 'blrank', text);
}
async function rejectJoin(member, config, reason) {
    if (config.punishments.antitoken === 'ban') {
        if (!member.bannable) throw new Error('Ban impossible (permission ou hiérarchie).');
        await member.ban({ reason }); return 'Membre banni';
    }
    if (config.punishments.antitoken === 'derank' && member.guild.members.me?.permissions.has(P.ManageRoles)) {
        const roles = member.roles.cache.filter(role => role.id !== member.guild.id && !role.managed && role.editable);
        if (roles.size) await member.roles.remove([...roles.keys()], reason);
    }
    if (!member.kickable) throw new Error('Kick impossible (permission ou hiérarchie).');
    await member.kick(reason); return 'Membre expulsé';
}
async function join(member) {
    const guild = member.guild, config = store.get(guild.id), mode = config.modes.antitoken;
    if (exempt(guild, member.id, mode, config)) return;
    const young = config.creationAge > 0 && Date.now() - member.user.createdTimestamp < config.creationAge;
    if (config.joinLock || config.blockedUntil > Date.now() || young) {
        let result;
        try { result = await rejectJoin(member, config, young ? 'Antiraid : compte trop récent' : 'Antitoken : arrivées verrouillées'); }
        catch (error) { result = error.message; }
        await log(guild, 'antitoken', `<@${member.id}> • ${young ? 'Compte trop récent' : 'Arrivées verrouillées'} • ${result}`);
        return;
    }
    if (mode === 'off') return;
    const limit = config.limits.antitoken;
    if (count(`${guild.id}:joins`, limit.duration) >= limit.count) {
        store.save(guild.id, { blockedUntil: Date.now() + 300000 });
        let result;
        try { result = await rejectJoin(member, config, 'Antitoken : vague de joins'); }
        catch (error) { result = error.message; }
        await log(guild, 'antitoken', `Seuil ${limit.count}/${limit.duration / 1000}s atteint. Nouveaux arrivants expulsés pendant 5 minutes. ${result}.`);
    }
}
async function message(message) {
    if (!message.guild || message.author.bot || !message.mentions?.everyone) return;
    const config = store.get(message.guild.id), mode = config.modes.antieveryone;
    if (mode === 'off' || exempt(message.guild, message.author.id, mode, config)) return;
    const limit = config.limits.antieveryone;
    if (count(`${message.guild.id}:everyone:${message.author.id}`, limit.duration) < limit.count) return;
    let deletion = '';
    try { await message.delete(); } catch (error) { deletion = `Suppression impossible : ${error.message}. `; }
    const result = await punish(message.guild, message.author.id, 'antieveryone', mode, config);
    await log(message.guild, 'antieveryone', `${deletion}<@${message.author.id}> • ${result}`);
}
function remember(type, object) {
    if (!object.guild) return;
    const key = `${object.guild.id}:${type}:${object.id}`;
    let data;
    if (type === 'role') data = { name: object.name, color: object.color, hoist: object.hoist, mentionable: object.mentionable, permissions: object.permissions.bitfield, position: object.position };
    else data = { name: object.name, type: object.type, topic: object.topic, nsfw: object.nsfw, parent: object.parentId, position: object.rawPosition, bitrate: object.bitrate, userLimit: object.userLimit, rateLimitPerUser: object.rateLimitPerUser, permissionOverwrites: [...object.permissionOverwrites.cache.values()].map(o => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield })) };
    snapshots.set(key, { data, time: Date.now() });
    for (const [id, snapshot] of snapshots) if (Date.now() - snapshot.time > 60000) snapshots.delete(id);
    if (snapshots.size > 1000) snapshots.delete(snapshots.keys().next().value);
}
function oldFields(entry, fields) {
    const result = {};
    for (const change of entry.changes || []) if (Object.hasOwn(fields, change.key) && change.old !== undefined) result[fields[change.key]] = change.old;
    return result;
}
async function rollback(guild, entry, feature) {
    const id = entry.targetId || entry.target?.id, reason = `Antiraid : ${feature}`;
    if (entry.action === A.MemberBanRemove) { await guild.members.ban(id, { reason }); return 'Utilisateur rebanni'; }
    if (entry.action === A.BotAdd) { const bot = await guild.members.fetch(id); if (!bot.kickable) throw new Error('Bot non expulsable'); await bot.kick(reason); return 'Bot ajouté expulsé'; }
    if (entry.action === A.ChannelCreate) { const channel = await guild.channels.fetch(id); await channel.delete(reason); return 'Salon créé supprimé'; }
    if (entry.action === A.RoleCreate) { const role = await guild.roles.fetch(id); if (!role.editable || role.managed) throw new Error('Rôle non modifiable'); await role.delete(reason); return 'Rôle créé supprimé'; }
    if ([A.RoleDelete, A.ChannelDelete].includes(entry.action)) {
        const type = entry.action === A.RoleDelete ? 'role' : 'channel', key = `${guild.id}:${type}:${id}`;
        const snapshot = snapshots.get(key);
        if (!snapshot || Date.now() - snapshot.time > 60000) return 'Copie de la ressource supprimée indisponible';
        snapshots.delete(key);
        await (type === 'role' ? guild.roles : guild.channels).create({ ...snapshot.data, reason });
        return 'Ressource recréée avec un nouvel ID (contenu supprimé non récupérable)';
    }
    if (entry.action === A.RoleUpdate) {
        const role = await guild.roles.fetch(id), data = oldFields(entry, { name: 'name', color: 'color', hoist: 'hoist', mentionable: 'mentionable', permissions: 'permissions' });
        if (!role.editable || role.managed) throw new Error('Rôle non modifiable');
        if (!Object.keys(data).length) return 'Modification de rôle non restaurable';
        await role.edit({ ...data, reason }); return 'Rôle restauré';
    }
    if (entry.action === A.MemberRoleUpdate) {
        const member = await guild.members.fetch(id);
        const added = (entry.changes || []).find(c => c.key === '$add')?.new || [];
        const ids = added.map(r => r.id).filter(id => guild.roles.cache.get(id)?.editable);
        if (ids.length) await member.roles.remove(ids, reason);
        const removed = (entry.changes || []).find(c => c.key === '$remove')?.new || [];
        const restoreIds = removed.map(r => r.id).filter(id => guild.roles.cache.get(id)?.editable);
        if (restoreIds.length) await member.roles.add(restoreIds, reason);
        return `${ids.length} attribution(s) annulée(s), ${restoreIds.length} rôle(s) réattribué(s)`;
    }
    if (entry.action === A.ChannelUpdate) {
        const channel = await guild.channels.fetch(id), data = oldFields(entry, { name: 'name', topic: 'topic', nsfw: 'nsfw', bitrate: 'bitrate', user_limit: 'userLimit', rate_limit_per_user: 'rateLimitPerUser', parent_id: 'parent' });
        if (!Object.keys(data).length) return 'Modification de salon non restaurable';
        await channel.edit({ ...data, reason }); return 'Salon restauré';
    }
    if ([A.ChannelOverwriteCreate, A.ChannelOverwriteUpdate, A.ChannelOverwriteDelete].includes(entry.action)) {
        const channel = await guild.channels.fetch(id), overwriteId = entry.extra?.id;
        if (!overwriteId) return 'Cible de permission inconnue';
        if (entry.action === A.ChannelOverwriteCreate) await channel.permissionOverwrites.delete(overwriteId, reason);
        else {
            const old = oldFields(entry, { allow: 'allow', deny: 'deny' });
            const current = channel.permissionOverwrites.cache.get(overwriteId);
            const type = current?.type ?? (guild.roles.cache.has(overwriteId) ? 0 : 1);
            const restored = { id: overwriteId, type, allow: BigInt(old.allow ?? current?.allow.bitfield ?? 0), deny: BigInt(old.deny ?? current?.deny.bitfield ?? 0) };
            await channel.permissionOverwrites.set([...channel.permissionOverwrites.cache.values()].filter(o => o.id !== overwriteId).map(o => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield })).concat(restored), reason);
        }
        return 'Permissions du salon restaurées';
    }
    if (entry.action === A.GuildUpdate) {
        const data = oldFields(entry, { name: 'name', verification_level: 'verificationLevel', default_message_notifications: 'defaultMessageNotifications', explicit_content_filter: 'explicitContentFilter', afk_timeout: 'afkTimeout', afk_channel_id: 'afkChannel', system_channel_id: 'systemChannel' });
        if (!Object.keys(data).length) return 'Modification de serveur non restaurable';
        await guild.edit({ ...data, reason }); return 'Paramètres du serveur restaurés';
    }
    if (entry.action === A.WebhookCreate) {
        const hooks = await guild.fetchWebhooks(), hook = hooks.get(id);
        if (hook) await hook.delete(reason);
        return hook ? 'Webhook créé supprimé' : 'Webhook déjà absent';
    }
    return 'Action détectée ; restauration automatique indisponible pour cette action';
}
function featureFor(entry, guild, config) {
    const action = entry.action;
    if (action === A.GuildUpdate) return 'antiupdate';
    if ([A.ChannelCreate, A.ChannelUpdate, A.ChannelDelete, A.ChannelOverwriteCreate, A.ChannelOverwriteUpdate, A.ChannelOverwriteDelete].includes(action)) return 'antichannel';
    if ([A.RoleCreate, A.RoleUpdate, A.RoleDelete, A.MemberRoleUpdate].includes(action)) {
        if (config.roleScope === 'all') return 'antirole';
        if (action === A.MemberRoleUpdate) {
            const roles = (entry.changes || []).filter(c => ['$add', '$remove'].includes(c.key)).flatMap(c => c.new || []);
            return roles.some(r => danger(guild.roles.cache.get(r.id)?.permissions || 0n)) ? 'antirole' : null;
        }
        const permissions = (entry.changes || []).find(c => c.key === 'permissions');
        const bits = guild.roles.cache.get(entry.targetId || entry.target?.id)?.permissions || permissions?.new || permissions?.old || snapshots.get(`${guild.id}:role:${entry.targetId || entry.target?.id}`)?.data.permissions || 0n;
        return danger(bits) ? 'antirole' : null;
    }
    if ([A.WebhookCreate, A.WebhookUpdate, A.WebhookDelete].includes(action)) return 'antiwebhook';
    if (action === A.MemberBanRemove) return 'antiunban';
    if (action === A.BotAdd) return 'antibot';
    if ([A.MemberBanAdd, A.MemberKick, A.MemberPrune].includes(action)) return 'antiban';
    if (action === A.MemberDisconnect) return 'antideco';
    return null;
}
async function audit(entry, guild) {
    const now = Date.now();
    if (!entry.id || now - entry.createdTimestamp > 30000) return;
    for (const [id, time] of seen) if (now - time > 60000) seen.delete(id);
    if (seen.has(entry.id)) return;
    seen.set(entry.id, now);
    if (seen.size > 10000) seen.delete(seen.keys().next().value);
    const config = store.get(guild.id), feature = featureFor(entry, guild, config);
    if (!feature) return;
    const mode = config.modes[feature], executorId = entry.executorId || entry.executor?.id;
    if (mode === 'off' || exempt(guild, executorId, mode, config)) return;
    if (feature === 'antiban' || feature === 'antideco') {
        const limit = config.limits[feature];
        const rawAmount = Number(entry.extra?.count || entry.extra?.removed || 1);
        const amount = Number.isFinite(rawAmount) ? Math.max(1, Math.min(100000, rawAmount)) : 1;
        if (count(`${guild.id}:${feature}:${executorId}`, limit.duration, amount) < limit.count) return;
    }
    let restoration;
    try { restoration = await rollback(guild, entry, feature); }
    catch (error) { restoration = `Restauration impossible : ${error.message}`; }
    const result = await punish(guild, executorId, feature, mode, config);
    await log(guild, feature, `<@${executorId}> • cible ${entry.targetId || entry.target?.id || 'inconnue'}\n${restoration}\n${result}`);
}
function enqueue(entry, guild) {
    const previous = queues.get(guild.id) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => audit(entry, guild));
    queues.set(guild.id, task);
    task.finally(() => { if (queues.get(guild.id) === task) queues.delete(guild.id); }).catch(() => {});
    return task;
}
module.exports = { join, message, audit: enqueue, stripRank, remember, exempt, danger, count, punish, featureFor, log };

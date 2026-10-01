const { ChannelType } = require('discord.js');
const store = require('./managementStore');
const tools = require('./managementTools');
function type(value) { if (!['serveur', 'emoji'].includes(value)) throw new Error('Type de backup : serveur ou emoji.'); return value; }
function name(value) { if (!value || value.length > 64 || !/^[\p{L}\p{N}_ -]+$/u.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('Nom de backup : 1 à 64 lettres, chiffres, espaces, tirets ou underscores.'); return value; }
async function snapshot(guild, kind) {
    type(kind);
    const base = { guildId: guild.id, guildName: guild.name, createdAt: Date.now(), type: kind };
    if (kind === 'emoji') {
        const emojis = await guild.emojis.fetch(), images = [];
        for (const emoji of emojis.values()) {
            const image = await tools.imageBuffer(emoji.imageURL({ size: 128 }), 256 * 1024);
            images.push({ name: emoji.name, data: image.buffer.toString('base64'), mime: image.type });
        }
        return { ...base, emojis: images };
    }
    const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
    const supported = [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia];
    return { ...base,
        managedRoles: [...roles.values()].filter(r => r.managed).map(r => ({ id: r.id, botId: r.tags?.botId })),
        roles: [...roles.values()].filter(r => !r.managed && r.id !== guild.id).sort((a, b) => a.position - b.position).map(r => ({ id: r.id, name: r.name, color: r.color, permissions: r.permissions.bitfield.toString(), hoist: r.hoist, mentionable: r.mentionable, position: r.position })),
        channels: [...channels.values()].filter(c => c && supported.includes(c.type)).sort((a, b) => a.rawPosition - b.rawPosition).map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId, position: c.rawPosition, topic: c.topic, nsfw: c.nsfw, bitrate: c.bitrate, userLimit: c.userLimit, rateLimitPerUser: c.rateLimitPerUser, availableTags: c.availableTags?.map(t => ({ name: t.name, moderated: t.moderated, emoji: t.emoji })), defaultAutoArchiveDuration: c.defaultAutoArchiveDuration, permissionOverwrites: [...c.permissionOverwrites.cache.values()].map(o => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })) }))
    };
}
async function create(guild, kind, backupName, overwrite = false) {
    type(kind); name(backupName);
    if (!overwrite && Object.hasOwn(store.get(guild.id).backups[kind], backupName)) throw new Error('Ce nom de backup existe déjà.');
    const record = await snapshot(guild, kind);
    store.mutate(guild.id, state => { state.backups[kind][backupName] = record; });
    return record;
}
async function restore(guild, record) {
    const results = [];
    if (record.type === 'emoji') {
        for (const emoji of record.emojis) {
            try { await guild.emojis.create({ attachment: Buffer.from(emoji.data, 'base64'), name: emoji.name, reason: 'Chargement backup emoji' }); results.push(`✅ ${emoji.name}`); }
            catch (error) { results.push(`❌ ${emoji.name} : ${error.message}`); }
        }
        return results;
    }
    const roleIds = new Map([[record.guildId, guild.id]]), channelIds = new Map();
    const existingRoles = await guild.roles.fetch();
    for (const reference of record.managedRoles || []) {
        const match = existingRoles.get(reference.id) || (reference.botId ? existingRoles.find(r => r.tags?.botId === reference.botId) : null);
        if (match) roleIds.set(reference.id, match.id);
    }
    for (const role of record.roles) {
        try {
            const created = await guild.roles.create({ name: role.name, color: role.color, permissions: BigInt(role.permissions), hoist: role.hoist, mentionable: role.mentionable, reason: 'Chargement backup serveur' });
            roleIds.set(role.id, created.id); results.push(`✅ Rôle ${role.name}`);
        } catch (error) { results.push(`❌ Rôle ${role.name} : ${error.message}`); }
    }
    const channels = [...record.channels].sort((a, b) => (a.type === ChannelType.GuildCategory ? -1 : 0) - (b.type === ChannelType.GuildCategory ? -1 : 0) || a.position - b.position);
    for (const channel of channels) {
        try {
            const parent = channel.parentId ? channelIds.get(channel.parentId) : null;
            if (channel.parentId && !parent) throw new Error('Catégorie parente non restaurée');
            if (channel.permissionOverwrites.some(o => o.type === 0 && !roleIds.has(o.id))) throw new Error('Un rôle de permission n’a pas pu être restauré');
            const created = await guild.channels.create({ name: channel.name, type: channel.type, parent, position: channel.position, topic: channel.topic, nsfw: channel.nsfw, bitrate: channel.bitrate ? Math.min(channel.bitrate, guild.maximumBitrate) : undefined, userLimit: channel.userLimit, rateLimitPerUser: channel.rateLimitPerUser, availableTags: channel.availableTags, defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration, permissionOverwrites: channel.permissionOverwrites.map(o => ({ id: o.type === 0 ? roleIds.get(o.id) : o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) })), reason: 'Chargement backup serveur' });
            channelIds.set(channel.id, created.id); results.push(`✅ Salon ${channel.name}`);
        } catch (error) { results.push(`❌ Salon ${channel.name} : ${error.message}`); }
    }
    return results;
}
module.exports = { type, name, snapshot, create, restore };

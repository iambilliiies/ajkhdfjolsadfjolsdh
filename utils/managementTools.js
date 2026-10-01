const { PermissionFlagsBits: P, ChannelType, parseEmoji } = require('discord.js');
const settings = require('./settings');
const g = require('./general');
function authorized(guild, userId, member) { return settings.isOwner(userId) || userId === guild.ownerId || Boolean(member?.permissions.has(P.Administrator)); }
function guard(message) {
    if (!message.guild || !authorized(message.guild, message.author.id, message.member)) throw new Error('Commande réservée aux administrateurs, au propriétaire du serveur et aux owners du bot.');
}
const authorize = message => async interaction => authorized(message.guild, interaction.user.id, await message.guild.members.fetch(interaction.user.id).catch(() => null));
async function channel(message, query, voice = false) {
    const channels = await message.guild.channels.fetch();
    let result;
    if (!query) result = voice ? message.member.voice.channel : message.channel;
    else {
        const matches = channels.filter(c => c && (c.id === g.id(query) || c.name.toLowerCase() === query.toLowerCase()));
        result = matches.size === 1 ? matches.first() : null;
    }
    if (!result || (voice && result.type !== ChannelType.GuildVoice) || !result.permissionsFor(message.member)?.has(P.ViewChannel)) throw new Error('Salon introuvable, ambigu, inaccessible ou de type incompatible.');
    return result;
}
function parts(args) { return require('./antiraidCommands').parts(args); }
async function role(message, query) {
    const result = await g.role(message, [query || '']);
    if (!result || result.id === message.guild.id || result.managed || !result.editable) throw new Error('Rôle introuvable, géré par une intégration ou au-dessus du bot.');
    if (!settings.isOwner(message.author.id) && message.author.id !== message.guild.ownerId && message.member.roles.highest.comparePositionTo(result) <= 0) throw new Error('Le rôle doit être sous ton rôle le plus haut.');
    return result;
}
function emoji(value) {
    const parsed = parseEmoji(value || '');
    if (parsed?.id) return { reaction: parsed.id, url: `https://cdn.discordapp.com/emojis/${parsed.id}.${parsed.animated ? 'gif' : 'png'}`, name: parsed.name };
    if (value && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value)) return { reaction: value, name: 'emoji', url: `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${[...value].filter(c => c !== '\ufe0f').map(c => c.codePointAt(0).toString(16)).join('-')}.png` };
    throw new Error('Émoji invalide.');
}
function url(value) { const result = new URL(value); if (!['http:', 'https:'].includes(result.protocol) || result.username || result.password) throw new Error('URL HTTP(S) requise.'); return result.href; }
async function imageBuffer(value, maxBytes = 1024 * 1024) {
    const response = await fetch(url(value), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Image indisponible (HTTP ${response.status}).`);
    const type = response.headers.get('content-type') || '';
    if (!/^image\/(png|jpeg|gif|webp|apng)/i.test(type)) throw new Error('Format image non pris en charge.');
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Image trop grande.');
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    try {
        while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw new Error('Image trop grande.'); chunks.push(Buffer.from(value)); }
    } finally { await reader.cancel().catch(() => {}); }
    return { buffer: Buffer.concat(chunks), type };
}
async function messageByReference(message, query) {
    if (query) {
        const link = query.match(/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/);
        if (link) {
            if (link[1] !== message.guild.id) throw new Error('Le message doit être dans ce serveur.');
            const target = await channel(message, link[2]);
            if (!target.isTextBased()) throw new Error('Salon non textuel.');
            return target.messages.fetch(link[3]);
        }
        if (/^\d+$/.test(query)) return message.channel.messages.fetch(query);
        throw new Error('Indique un lien de message Discord ou un ID.');
    }
    if (message.reference?.messageId) return message.fetchReference();
    throw new Error('Réponds à un message ou indique son ID/lien.');
}
module.exports = { guard, authorize, authorized, channel, role, parts, emoji, url, imageBuffer, messageByReference };

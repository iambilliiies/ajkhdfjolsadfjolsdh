const { PermissionFlagsBits: P } = require('discord.js');
const store = require('./moderationStore');
const settings = require('./settings');
const queues = new Map(), windows = new Map();
function exempt(message) { return !message.guild || !message.member || message.author.bot || settings.isOwner(message.author.id) || message.author.id === message.guild.ownerId || message.member.permissions.has(P.Administrator); }
function publicAllowed(message, command) {
    if (!message.guild || exempt(message)) return true;
    if (command && (command.ownerOnly || command.lockedPermission || (settings.read().permissions[command.name] || command.defaultPermission || 'everyone') !== 'everyone')) return true;
    const config = store.get(message.guild.id);
    return store.enabled(config.publicEnabled, config.publicChannels, message.channel.id);
}
const normalize = value => String(value).normalize('NFKC').toLowerCase();
function violations(message, config, now = Date.now()) {
    const found = [], channel = message.channel.id, text = normalize(message.content);
    if (store.enabled(config.antispam, config.spamChannels, channel)) {
        const key = `${message.guild.id}:${message.author.id}`;
        for (const [id, value] of windows) if (now - value.updated > 3600000) windows.delete(id);
        const entries = (windows.get(key)?.entries || []).filter(at => now - at < config.spamLimit.duration); entries.push(now);
        windows.set(key, { entries: entries.slice(-config.spamLimit.count), updated: now });
        if (windows.size > 10000) windows.delete(windows.keys().next().value);
        if (entries.length >= config.spamLimit.count) found.push('antispam');
    }
    const invite = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
    const link = /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i;
    if (store.enabled(config.antilink, config.linkChannels, channel) && (config.linkMode === 'all' ? link : invite).test(text)) found.push('antilink');
    const mentions = (message.content.match(/<@!?\d+>|<@&\d+>|@everyone|@here/g) || []).length;
    if (config.antimassmention && mentions >= config.mentionLimit) found.push('antimassmention');
    if (config.badwordsEnabled && config.words.some(word => text.includes(normalize(word)))) found.push('badwords');
    if (config.picChannels.includes(channel)) {
        const images = message.attachments?.size > 0 && message.attachments.every(a => /^image\//i.test(a.contentType || '') || !a.contentType && /\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(a.name || ''));
        if (!images || message.content.trim()) found.push('piconly');
    }
    return found;
}
async function sanction(member, rule, config, reason) {
    if (rule.action === 'mute') {
        if (config.timeout) { if (!member.moderatable) throw new Error('Timeout impossible : permission ou hiérarchie.'); const duration = Math.max(rule.duration, (member.communicationDisabledUntilTimestamp || 0) - Date.now()); await member.timeout(Math.min(duration, 28 * 86400000), reason); }
        else {
            const role = config.muteRoleId && await member.guild.roles.fetch(config.muteRoleId);
            if (!require('./serverConfigInteractions').safeRole(role, member.guild)) throw new Error('Rôle muet absent ou dangereux ; utilise muterole.');
            const key = `${member.id}:${role.id}`, management = require('./managementStore'), existing = management.get(member.guild.id).tempRoles[key];
            if (member.roles.cache.has(role.id) && !existing) throw new Error('Le rôle muet est permanent : expiration automatique refusée.');
            await member.roles.add(role.id, reason);
            management.mutate(member.guild.id, state => { state.tempRoles[key] = { userId: member.id, roleId: role.id, expiresAt: Math.max(existing?.expiresAt || 0, Date.now() + rule.duration) }; });
        }
    } else if (rule.action === 'kick') { if (!member.kickable) throw new Error('Expulsion impossible : permission ou hiérarchie.'); await member.kick(reason); }
    else if (rule.action === 'ban') { if (!member.bannable) throw new Error('Ban impossible : permission ou hiérarchie.'); await member.ban({ reason }); }
    else if (rule.action === 'derank') {
        if (!member.manageable) throw new Error('Derank impossible : hiérarchie.');
        const roles = member.roles.cache.filter(r => r.id !== member.guild.id && !r.managed && r.editable && !config.noderank.includes(r.id));
        if (roles.size) await member.roles.remove([...roles.keys()], reason);
    }
}
async function process(message) {
    if (exempt(message)) return false;
    const config = store.get(message.guild.id), now = Date.now(), found = violations(message, config, now);
    if (!found.length) return false;
    let deletion = 'Message supprimé';
    try { await message.delete(); } catch (error) { deletion = `Suppression impossible : ${error.message}`; }
    const age = message.member.joinedTimestamp == null ? 0 : now - message.member.joinedTimestamp;
    const kind = age >= config.ancientAge ? 'ancien' : 'nouveau';
    const points = found.reduce((sum, trigger) => sum + config.strikes[trigger][kind], 0);
    const maxWindow = Math.max(3600000, ...config.punishments.map(r => r.window));
    store.mutate(message.guild.id, state => {
        for (const [id, history] of Object.entries(state.history)) { state.history[id] = history.filter(e => now - e.at < maxWindow); if (!state.history[id].length) { delete state.history[id]; delete state.applied[id]; } }
        const history = state.history[message.author.id] || []; history.push({ at: now, points, triggers: found }); state.history[message.author.id] = history.slice(-1000);
    });
    const state = store.get(message.guild.id), history = state.history[message.author.id];
    const active = state.punishments.filter(r => now - (state.applied[message.author.id]?.[r.id] || 0) < r.window);
    const rule = state.punishments.filter(r => !active.some(previous => previous.count >= r.count) && history.filter(e => now - e.at < r.window).reduce((sum,e) => sum + e.points,0) >= r.count).sort((a,b) => b.count - a.count)[0];
    let result = '';
    if (rule) {
        // Réserve la sanction pour éviter les doublons ; les échecs sont visibles dans modlog.
        store.mutate(message.guild.id, s => { s.applied[message.author.id] ||= {}; s.applied[message.author.id][rule.id] = now; });
        try { await sanction(message.member, rule, state, `Automod : ${found.join(', ')}`); require('./moderationActionsStore').record(message.guild.id,message.author.id,rule.action,message.guild.client?.user.id||'automod',`Automod : ${found.join(', ')}`,rule.duration); result = `${rule.action} effectué`; }
        catch (error) { result = `Sanction impossible : ${error.message}`; }
    }
    await require('./logs').send(message.guild, 'mod', 'Protection de modération', `**Membre :** <@${message.author.id}>\n**Déclencheurs :** ${found.join(', ')}\n**Strikes :** +${points} (${kind})\n${deletion}${result ? '\n' + result : ''}`);
    return true;
}
async function message(message) {
    if (!message.guild) return false;
    const key = `${message.guild.id}:${message.author.id}`, previous = queues.get(key) || Promise.resolve();
    const work = previous.catch(() => {}).then(() => process(message)); queues.set(key, work);
    try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
}
module.exports = { message, violations, sanction, publicAllowed, exempt, normalize };

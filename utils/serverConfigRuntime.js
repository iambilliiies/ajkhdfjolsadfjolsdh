const { ActivityType, ChannelType, PermissionFlagsBits: P } = require('discord.js');
const store = require('./serverConfigStore');
const g = require('./general');
const settings = require('./settings');
const voiceLocks = new Set();
let busy = false, twitchCheck = 0;
function template(text, member, guild, args = '') {
    const replacements = { '{member}': member ? `<@${member.id}>` : '', '{user}': member?.user?.tag || member?.tag || '', '{server}': guild.name, '{count}': String(guild.memberCount), '{args}': args };
    return String(text).replace(/\{member\}|\{user\}|\{server\}|\{count\}|\{args\}/g, key => replacements[key]);
}
async function welcome(member, leaving = false) {
    const guild = member.guild, config = store.get(guild.id)[leaving ? 'leaves' : 'joins'];
    if (!config.enabled) return;
    if (!leaving && config.roleId) {
        try { const role = await guild.roles.fetch(config.roleId); if (require('./serverConfigInteractions').safeRole(role, guild)) await member.roles.add(config.roleId, 'Rôle automatique de bienvenue'); }
        catch (error) { console.error('Rôle de bienvenue :', error.message); }
    }
    if (config.channelId) {
        const channel = await guild.channels.fetch(config.channelId);
        if (channel?.isTextBased()) await channel.send({ content: template(config.message, member, guild).slice(0, 2000), allowedMentions: { parse: [], users: leaving ? [] : [member.id] } });
    }
}
async function soutien(presence) {
    const guild = presence?.guild, member = presence?.member;
    if (!guild || !member || member.user.bot) return;
    const config = store.get(guild.id).soutien;
    if (!config.enabled || !config.roleId) return;
    if (!require('./serverConfigInteractions').safeRole(await guild.roles.fetch(config.roleId), guild)) return;
    const status = presence.activities?.find(a => a.type === ActivityType.Custom);
    // Une activité absente peut être cachée par la confidentialité Discord.
    // On ne retire le rôle que lorsqu’un statut explicitement visible ne correspond plus.
    if (!status || typeof status.state !== 'string') return;
    const qualifies = status.state.toLowerCase().includes(config.text.toLowerCase());
    if (qualifies && !member.roles.cache.has(config.roleId)) await member.roles.add(config.roleId, 'Soutien : statut correspondant');
    if (!qualifies && member.roles.cache.has(config.roleId)) await member.roles.remove(config.roleId, 'Soutien : statut changé');
}
async function onMessage(message) {
    if (!message.guild || message.author.bot) return;
    const config = store.get(message.guild.id);
    if (config.autopublish && message.channel.type === ChannelType.GuildAnnouncement && !message.flags.has(1)) {
        try { await message.crosspost(); } catch (error) { console.error('Autopublish :', error.message); }
    }
}
async function custom(message, keyword, args) {
    const command = store.get(message.guild.id).customCommands[keyword];
    if (!Object.hasOwn(store.get(message.guild.id).customCommands, keyword) || !command) return false;
    await message.reply({ content: template(command.text, message.member, message.guild, args.join(' ')).slice(0, 2000), allowedMentions: { parse: [], repliedUser: false } });
    return true;
}
function trackReplies(message, command) {
    if (!message.guild) return () => {};
    const group = command.name === 'snipe' ? 'snipe' : /mod[eé]ration/i.test(command.category || '') ? 'moderation' : null;
    if (!group) return () => {};
    const config = store.get(message.guild.id).autodelete[group];
    if (!config) return () => {};
    const original = message.reply, replies = [];
    message.reply = async function(...args) { const sent = await original.apply(this, args); replies.push(sent); return sent; };
    const schedule = (target, delay) => { if (delay != null) setTimeout(() => target.delete().catch(() => {}), delay).unref(); };
    return () => { message.reply = original; schedule(message, config.commande); replies.forEach(reply => schedule(reply, config.reply)); };
}
async function voice(oldState, state) {
    const guild = state.guild, config = store.get(guild.id).tempVoice;
    const previous = store.get(guild.id).tempChannels[oldState.channelId];
    if (previous && oldState.channelId !== state.channelId) {
        const channel = await guild.channels.fetch(oldState.channelId).catch(() => null);
        if (!channel || channel.members.size === 0) {
            if (channel) await channel.delete('Vocal temporaire vide');
            store.mutate(guild.id, current => { delete current.tempChannels[oldState.channelId]; });
        }
    }
    const lock = `${guild.id}:${state.id}`;
    if (!config.enabled || state.channelId !== config.hubId || oldState.channelId === state.channelId || state.member.user.bot || voiceLocks.has(lock)) return;
    voiceLocks.add(lock);
    try {
        const category = await guild.channels.fetch(config.categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) throw new Error('Catégorie des vocaux temporaires introuvable.');
        const overwrites = category.permissionOverwrites.cache.map(o => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield })).filter(o => o.id !== state.id);
        overwrites.push({ id: state.id, allow: [P.ViewChannel, P.Connect] });
        const channel = await guild.channels.create({ name: `Vocal de ${state.member.displayName}`.slice(0, 100), type: ChannelType.GuildVoice, parent: config.categoryId, permissionOverwrites: overwrites, reason: 'Création vocal temporaire' });
        try {
            await state.member.voice.setChannel(channel.id, 'Vocal temporaire');
            store.mutate(guild.id, current => { current.tempChannels[channel.id] = { ownerId: state.id }; });
        } catch (error) { await channel.delete('Annulation vocal temporaire').catch(() => {}); throw error; }
    } finally { voiceLocks.delete(lock); }
}
async function tick(client) {
    if (busy) return;
    busy = true;
    const checkTwitch = Date.now() - twitchCheck >= 60000;
    if (checkTwitch) twitchCheck = Date.now();
    try {
        for (const [guildId, config] of Object.entries(store.read().guilds)) {
            const guild = client.guilds.cache.get(guildId); if (!guild) continue;
            for (const [id, reminder] of Object.entries(config.reminders || {})) if (!reminder.sent && reminder.at <= Date.now() && (!reminder.retryAt || reminder.retryAt <= Date.now())) {
                try {
                    const channel = await guild.channels.fetch(reminder.channelId);
                    await channel.send({ content: reminder.text, allowedMentions: { parse: [] } });
                    store.mutate(guildId, state => { if (state.reminders[id]) state.reminders[id].sent = true; });
                } catch (error) { console.error('Reminder :', error.message); store.mutate(guildId, state => { if (state.reminders[id]) state.reminders[id].retryAt = Date.now() + 60000; }); }
            }
            const pics = config.showPics;
            if (pics?.enabled && pics.nextAt <= Date.now()) {
                try {
                    const members = await guild.members.fetch(), humans = [...members.values()].filter(m => !m.user.bot);
                    if (humans.length) {
                        const selected = humans[require('node:crypto').randomInt(humans.length)];
                        const channel = await guild.channels.fetch(pics.channelId);
                        await channel.send({ embeds: [g.embed('Photo de profil', selected.user.tag).setImage(selected.displayAvatarURL({ size: 1024 }))], allowedMentions: { parse: [] } });
                    }
                } catch (error) { console.error('Show pics :', error.message); }
                store.mutate(guildId, state => { state.showPics.nextAt = Date.now() + pics.interval; });
            }
            const twitch = config.twitch;
            if (checkTwitch && twitch?.enabled && twitch.usernames.length) {
                try {
                    const streams = await require('./twitchAlerts').streams(twitch.usernames);
                    for (const stream of streams) {
                        const user = stream.user_login.toLowerCase();
                        if (twitch.liveIds[user] === stream.id) continue;
                        const channel = await guild.channels.fetch(twitch.channelId);
                        await channel.send({ embeds: [g.embed(`🔴 ${stream.user_name} est en live`, `${stream.title}\n\n[Regarder sur Twitch](https://www.twitch.tv/${user})`)], allowedMentions: { parse: [] } });
                        store.mutate(guildId, state => { state.twitch.liveIds[user] = stream.id; });
                    }
                } catch (error) { console.error('Alertes Twitch :', error.message); }
            }
        }
    } finally { busy = false; }
}
async function start(client) {
    if (client.serverConfigTimer) clearInterval(client.serverConfigTimer);
    client.serverConfigTimer = setInterval(() => tick(client).catch(error => console.error('Configuration serveur :', error.message)), 15000);
    client.serverConfigTimer.unref();
    for (const [guildId, config] of Object.entries(store.read().guilds)) {
        const guild = client.guilds.cache.get(guildId); if (!guild) continue;
        for (const id of Object.keys(config.tempChannels || {})) {
            const channel = await guild.channels.fetch(id).catch(() => null);
            if (channel && !channel.members.size) await channel.delete('Nettoyage vocal temporaire').catch(() => {});
            if (!channel || !channel.members.size) store.mutate(guildId, state => { delete state.tempChannels[id]; });
        }
    }
    await tick(client);
}
module.exports = { welcome, soutien, onMessage, custom, trackReplies, voice, tick, start, template };

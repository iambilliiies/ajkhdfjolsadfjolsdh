const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const store = require('./managementStore');
const busy = new Set();
const started = new WeakSet();
function names(guild) {
    const humans = [...guild.members.cache.values()].filter(member => !member.user.bot);
    return {
        members: `👥 Membres : ${humans.length}`,
        active: `🟢 Membres actifs : ${humans.filter(member => ['online', 'idle', 'dnd'].includes(member.presence?.status)).length}`,
        voice: `🔊 Membres en vocal : ${humans.filter(member => member.voice?.channelId).length}`
    };
}
async function update(guild, create = false) {
    if (busy.has(guild.id)) throw new Error('Actualisation des compteurs déjà en cours.');
    busy.add(guild.id);
    const created = [];
    try {
        const me = guild.members.me || await guild.members.fetchMe();
        if (!me.permissions.has(P.ManageChannels)) throw new Error('Le bot doit avoir la permission Gérer les salons.');
        // Une liste complète est nécessaire pour compter aussi les membres hors ligne.
        if (create || guild.members.cache.size < guild.memberCount) await guild.members.fetch();
        const channels = await guild.channels.fetch();
        const state = { ...(store.get(guild.id).counters || {}) };
        const overwrites = [{ id: guild.id, allow: [P.ViewChannel], deny: [P.Connect] }, { id: me.id, allow: [P.ViewChannel, P.ManageChannels] }];
        let category = channels.get(state.category);
        if (category?.type !== ChannelType.GuildCategory) {
            if (!create) return;
            category = await guild.channels.create({ name: '📊 Statistiques du serveur', type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
            created.push(category); state.category = category.id;
        }
        for (const [key, name] of Object.entries(names(guild))) {
            const channel = channels.get(state[key]);
            if (channel?.type === ChannelType.GuildVoice) {
                if (channel.name !== name) await channel.setName(name, 'Actualisation des compteurs Protect');
            } else if (create) {
                const fresh = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: overwrites });
                created.push(fresh); state[key] = fresh.id;
            }
        }
        if (create) store.mutate(guild.id, data => { data.counters = state; });
        return state;
    } catch (error) {
        for (const channel of created.reverse()) await channel.delete('Annulation de la création des compteurs').catch(() => {});
        throw error;
    } finally { busy.delete(guild.id); }
}
function start(client) {
    if (started.has(client)) return;
    started.add(client);
    const tick = async () => {
        for (const guild of client.guilds.cache.values()) {
            if (!store.get(guild.id).counters || busy.has(guild.id)) continue;
            await update(guild).catch(error => console.error(`Compteurs ${guild.id} : ${error.message}`));
        }
    };
    // Discord limite les changements de nom : espacer les actualisations.
    const timer = setInterval(tick, 10 * 60 * 1000);
    timer.unref();
    return tick();
}
module.exports = { names, update, start };

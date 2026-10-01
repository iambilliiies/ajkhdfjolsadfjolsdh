const { randomInt } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('./managementStore');
const { embed } = require('./general');
const finishing = new Set();
function draw(ids, count) {
    const candidates = [...new Set(ids)], winners = [];
    while (candidates.length && winners.length < count) winners.push(candidates.splice(randomInt(candidates.length), 1)[0]);
    return winners;
}
function render(record) {
    return embed(`🎉 ${record.prize}`, `**Organisateur :** <@${record.hostId}>\n**Gagnants :** ${record.winnerCount}\n**Participants :** ${record.participants.length}\n**Fin :** <t:${Math.floor(record.endsAt / 1000)}:R>\n\n${record.ended ? `**Terminé**\n${record.winners?.length ? record.winners.map(id => `<@${id}>`).join(', ') : 'Aucun participant éligible.'}` : 'Appuie sur Participer pour entrer ou retirer ta participation.'}`);
}
async function create(channel, values) {
    const record = { guildId: channel.guild.id, channelId: channel.id, prize: values.prize, hostId: values.hostId, winnerCount: values.winnerCount, endsAt: Date.now() + values.duration, participants: [], ended: false, winners: [] };
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mg:giveaway').setLabel('🎉 Participer').setStyle(ButtonStyle.Primary));
    const message = await channel.send({ embeds: [render(record)], components: [row], allowedMentions: { parse: [] } });
    try { store.mutate(channel.guild.id, state => { state.giveaways[message.id] = record; }); }
    catch (error) { await message.delete().catch(() => {}); throw error; }
    return message;
}
async function finish(guild, id, reroll = false) {
    const key = `${guild.id}:${id}`;
    if (finishing.has(key)) throw new Error('Ce giveaway est déjà en cours de traitement.');
    finishing.add(key);
    try {
        const record = store.get(guild.id).giveaways[id];
        if (!record || (!reroll && record.ended)) throw new Error('Giveaway introuvable ou déjà terminé.');
        store.mutate(guild.id, state => { state.giveaways[id].ending = true; });
        const channel = await guild.channels.fetch(record.channelId), message = await channel.messages.fetch(id);
        const eligible = [];
        for (const userId of record.participants) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member && !member.user.bot && !require('./settings').blacklisted(userId) && (!reroll || !record.winners?.includes(userId))) eligible.push(userId);
        }
        const winners = draw(eligible, record.winnerCount);
        const result = { ...record, ending: false, ended: true, winners, endedAt: Date.now() };
        await message.edit({ embeds: [render(result)], components: [], allowedMentions: { parse: [] } });
        store.mutate(guild.id, state => { state.giveaways[id] = result; state.lastGiveaway = id; });
        await channel.send({ content: `${reroll ? '🔄 Nouveau tirage' : '🎉 Giveaway terminé'} : **${record.prize}**\n${winners.length ? winners.map(id => `<@${id}>`).join(', ') : 'Aucun participant éligible.'}`, allowedMentions: { parse: [], users: winners } });
        return winners;
    } finally {
        const record = store.get(guild.id).giveaways[id];
        if (record?.ending) store.mutate(guild.id, state => { if (state.giveaways[id]) state.giveaways[id].ending = false; });
        finishing.delete(key);
    }
}
module.exports = { draw, render, create, finish };

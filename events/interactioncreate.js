const { MessageFlags } = require('discord.js');
const g = require('../utils/general');
// Une file évite que deux votes simultanés écrasent la mise à jour du message.
let queue = Promise.resolve();
module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try { if (await require('../utils/serverConfigInteractions').handle(interaction)) return; }
        catch (error) {
            console.error('Configuration interactive :', error.message);
            const payload = { content: `❌ ${String(error.message).slice(0, 1500)}`, allowedMentions: { parse: [] } };
            if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
            else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }
        if (await require('../utils/managementInteractions').handle(interaction)) return;
        if (!interaction.isButton() || !['suggestion:up', 'suggestion:down'].includes(interaction.customId)) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const work = async () => {
            try {
                const data = g.readSuggestions(), record = data[interaction.message.id];
                if (!record || record.guildId !== interaction.guildId || record.channelId !== interaction.channelId) return await interaction.editReply('Suggestion introuvable.');
                if (record.authorId === interaction.user.id) return await interaction.editReply('Tu ne peux pas voter pour ta propre suggestion.');
                const vote = interaction.customId === 'suggestion:up' ? 1 : -1;
                if (record.votes[interaction.user.id] === vote) delete record.votes[interaction.user.id];
                else record.votes[interaction.user.id] = vote;
                g.writeSuggestions(data);
                await interaction.message.edit({ embeds: [g.suggestionEmbed(record)], allowedMentions: { parse: [] } });
                await interaction.editReply('Ton vote a été mis à jour.');
            } catch (error) { console.error('Vote suggestion :', error.message); await interaction.editReply('Impossible de mettre à jour le vote.'); }
        };
        queue = queue.then(work, work);
        await queue;
    }
};

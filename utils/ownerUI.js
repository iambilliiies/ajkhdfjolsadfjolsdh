const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ComponentType } = require('discord.js');
const { randomUUID } = require('node:crypto');
const settings = require('./settings');
async function confirm(message, text, action, authorize = interaction => settings.isOwner(interaction.user.id)) {
    const key = randomUUID();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${key}:yes`).setLabel('Confirmer').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`${key}:no`).setLabel('Annuler').setStyle(ButtonStyle.Secondary));
    const sent = await message.reply({ content: text, components: [row], allowedMentions: { parse: [] } });
    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    let finished = false;
    collector.on('collect', async interaction => {
        try {
            if (interaction.user.id !== message.author.id || !await authorize(interaction)) return await interaction.reply({ content: 'Ce menu est réservé à son auteur autorisé.', flags: MessageFlags.Ephemeral });
            if (finished) return await interaction.deferUpdate();
            finished = true;
            await interaction.update({ content: 'Traitement…', components: [] });
            if (interaction.customId.endsWith(':yes')) { const result = await action(); if (!result?.completionHandled) await sent.edit({ content: '✅ Action effectuée.', components: [] }); }
            else await sent.edit({ content: 'Action annulée.', components: [] });
            collector.stop();
        } catch (error) { collector.stop(); await sent.edit({ content: `❌ ${error.message}`, components: [], allowedMentions: { parse: [] } }).catch(() => {}); }
    });
    collector.on('end', () => { if (!finished) sent.edit({ content: 'Confirmation expirée.', components: [] }).catch(() => {}); });
}
async function form(message, title, fields, action, authorize = interaction => settings.isOwner(interaction.user.id)) {
    const key = randomUUID();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(key).setLabel('Ouvrir le formulaire').setStyle(ButtonStyle.Primary));
    const sent = await message.reply({ content: title, components: [row] });
    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
    let opened = false;
    collector.on('collect', async interaction => {
        try {
            if (interaction.user.id !== message.author.id || !await authorize(interaction)) return await interaction.reply({ content: 'Menu réservé à son auteur autorisé.', flags: MessageFlags.Ephemeral });
            if (opened) return await interaction.reply({ content: 'Formulaire déjà ouvert.', flags: MessageFlags.Ephemeral });
            opened = true;
            const modal = new ModalBuilder().setCustomId(key).setTitle(title.slice(0, 45));
            for (const field of fields) {
                const input = new TextInputBuilder().setCustomId(field.id).setLabel(field.label).setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(Boolean(field.required)).setMaxLength(field.max || 500);
                if (field.value) input.setValue(field.value);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
            }
            await interaction.showModal(modal);
            collector.stop();
            const submission = await interaction.awaitModalSubmit({ filter: i => i.customId === key && i.user.id === message.author.id, time: 180000 });
            await submission.deferReply({ flags: MessageFlags.Ephemeral });
            if (!await authorize(submission)) return await submission.editReply('Accès retiré.');
            const values = Object.fromEntries(fields.map(field => [field.id, submission.fields.getTextInputValue(field.id).trim()]));
            try { await action(values); await submission.editReply('✅ Modification enregistrée.'); }
            catch (error) { await submission.editReply(`❌ ${error.message}`); }
        } catch (error) { await sent.edit({ content: `Formulaire terminé : ${error.code === 'InteractionCollectorError' ? 'délai expiré' : error.message}`, components: [] }).catch(() => {}); }
    });
    collector.on('end', () => sent.edit({ components: [] }).catch(() => {}));
}
module.exports = { confirm, form };

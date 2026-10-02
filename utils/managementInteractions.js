const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const store = require('./managementStore');
const g = require('./general');
const tools = require('./managementTools');
const settings = require('./settings');
const formLimits = new Map();
let queue = Promise.resolve();
async function handle(interaction) {
    if (!interaction.customId?.startsWith('mg:')) return false;
    const action = interaction.customId.split(':')[1];
    if (interaction.isButton() && action === 'form') {
        const id = interaction.customId.split(':')[2], form = store.get(interaction.guildId).forms[id];
        if (!form || form.messageId !== interaction.message.id || form.channelId !== interaction.channelId) { await interaction.reply({ content: 'Formulaire introuvable.', flags: MessageFlags.Ephemeral }); return true; }
        if (settings.blacklisted(interaction.user.id)) { await interaction.reply({ content: 'Accès refusé.', flags: MessageFlags.Ephemeral }); return true; }
        const modal = new ModalBuilder().setCustomId(`mg:response:${id}`).setTitle(form.title.slice(0, 45));
        form.questions.forEach((question, index) => modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`answer${index}`).setLabel(question.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true))));
        await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && action === 'response') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const id = interaction.customId.split(':')[2], form = store.get(interaction.guildId).forms[id];
        if (!form || settings.blacklisted(interaction.user.id)) { await interaction.editReply('Formulaire introuvable ou accès refusé.'); return true; }
        const key = `${interaction.guildId}:${id}:${interaction.user.id}`, now = Date.now();
        for (const [key, time] of formLimits) if (now - time > 60000) formLimits.delete(key);
        if (formLimits.has(key)) { await interaction.editReply('Attends une minute avant de répondre à nouveau.'); return true; }
        formLimits.set(key, now);
        try {
            const channel = await interaction.guild.channels.fetch(form.logChannelId);
            const answers = form.questions.map((question, index) => ({ name: question.slice(0, 256), value: interaction.fields.getTextInputValue(`answer${index}`).slice(0, 1000) || '-' }));
            await channel.send({ embeds: [g.embed(`📝 ${form.title}`, `Réponse de <@${interaction.user.id}> • ID ${interaction.user.id}`).addFields(answers)], allowedMentions: { parse: [] } });
            await interaction.editReply('✅ Réponse envoyée.');
        } catch (error) { formLimits.delete(key); await interaction.editReply(`Envoi impossible : ${error.message}`); }
        return true;
    }
    if (interaction.isButton() && action === 'giveaway') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const work = async () => {
            const record = store.get(interaction.guildId).giveaways[interaction.message.id];
            if (!record || record.channelId !== interaction.channelId || record.ended || record.ending || record.endsAt <= Date.now()) return interaction.editReply('Ce giveaway est terminé.');
            if (interaction.user.bot || settings.blacklisted(interaction.user.id)) return interaction.editReply('Participation refusée.');
            let removed = false;
            store.mutate(interaction.guildId, state => {
                const record = state.giveaways[interaction.message.id];
                removed = record.participants.includes(interaction.user.id);
                record.participants = removed ? record.participants.filter(id => id !== interaction.user.id) : [...record.participants, interaction.user.id];
            });
            await interaction.message.edit({ embeds: [require('./giveaways').render(store.get(interaction.guildId).giveaways[interaction.message.id])], allowedMentions: { parse: [] } });
            return interaction.editReply(removed ? 'Participation retirée.' : '🎉 Participation enregistrée.');
        };
        const task = queue.catch(() => {}).then(work);
        queue = task;
        try { await task; } catch (error) { await interaction.editReply(`Participation impossible : ${error.message}`); }
        return true;
    }
    if (interaction.isButton() && action === 'modmail-close') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!tools.authorized(interaction.guild, interaction.user.id, interaction.member)) { await interaction.editReply('Réservé aux administrateurs.'); return true; }
        const mail = require('./modmail');
        const ticket = mail.ticketForChannel(interaction.guildId, interaction.channelId);
        if (!ticket) { await interaction.editReply('Ticket introuvable.'); return true; }
        try {
            await interaction.editReply('Fermeture du ticket…');
            const result = await mail.close(interaction.guild, interaction.channelId, interaction.client || interaction.guild.client, interaction.user.id);
            await interaction.editReply(result.notified ? 'Ticket fermé et membre prévenu en MP.' : 'Ticket fermé. Le MP n’a pas pu être envoyé ou les MP du bot sont désactivés.').catch(() => {});
        } catch (error) {
            await interaction.editReply(`❌ Fermeture impossible : ${error.message}`).catch(() => {});
        }
        return true;
    }
    return false;
}
async function onMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) {
        return require('./modmail').receive(message);
    }
    const state = store.get(message.guild.id);
    for (const reaction of state.autoReacts[message.channel.id] || []) {
        try { await message.react(reaction); } catch (error) { console.error('Autoreact :', error.message); }
    }
    const ticket = Object.values(state.tickets).find(record => record.channelId === message.channel.id && !record.closed);
    const mailGuild = require('./serverConfigStore').read().modmailGuildId;
    const mailSettings = require('./serverConfigStore').get(message.guild.id).modmail;
    if ((!mailSettings.categoryId || mailSettings.enabled) && (!mailGuild || mailGuild === message.guild.id) && ticket && message.content && !message.content.startsWith(settings.prefix()) && tools.authorized(message.guild, message.author.id, message.member)) {
        if (!settings.read().dmEnabled) { await message.reply('Les MP du bot sont désactivés.'); return; }
        const user = await message.client.users.fetch(ticket.userId);
        await user.send({ embeds: [g.embed(`📨 ${message.guild.name} • Modmail`, `${message.content.slice(0, 3200)}\n\nRéponds à ce MP pour contacter l’équipe. Si plusieurs tickets sont ouverts, ajoute [${message.guild.id}] au début.`)], allowedMentions: { parse: [] } });
    }
}
module.exports = { handle, onMessage };

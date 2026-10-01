const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const store = require('./serverConfigStore');
const tools = require('./managementTools');
const g = require('./general');
const settings = require('./settings');
const locks = new Set(), reportCooldown = new Map();
function safeRole(role, guild) {
    return role && role.id !== guild.id && !role.managed && role.editable && !require('./antiraid').danger(role.permissions);
}
function ticketAccess(guild, userId, member, ticket, staffOnly = false) {
    const staff = tools.authorized(guild, userId, member) || Boolean(store.get(guild.id).tickets.staffRoleId && member?.roles.cache.has(store.get(guild.id).tickets.staffRoleId));
    return staff || (!staffOnly && ticket?.ownerId === userId);
}
async function closeTicket(guild, channelId, reason) {
    const record = store.get(guild.id).openTickets[channelId];
    if (!record) throw new Error('Ce salon n’est pas un ticket.');
    const config = store.get(guild.id).tickets, channel = await guild.channels.fetch(channelId);
    if (config.logChannelId) {
        const log = await guild.channels.fetch(config.logChannelId);
        if (!log?.isTextBased()) throw new Error('Salon de logs des tickets indisponible.');
        await log.send({ embeds: [g.embed('Ticket fermé', `**Salon :** ${channel.name}\n**Membre :** <@${record.ownerId}>\n**Raison :** ${reason || 'Aucune'}\nLes messages du ticket ne sont pas archivés.`)], allowedMentions: { parse: [] } });
    }
    await channel.delete(`Ticket fermé : ${String(reason || 'Aucune raison').slice(0, 350)}`);
    store.mutate(guild.id, state => { delete state.openTickets[channelId]; });
}
async function handle(interaction) {
    if (interaction.isMessageContextMenuCommand?.() && interaction.commandName === 'Signaler le message') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const config = store.get(interaction.guildId).report;
        if (!config.enabled || settings.blacklisted(interaction.user.id)) { await interaction.editReply('Signalements désactivés ou accès refusé.'); return true; }
        const key = `${interaction.guildId}:${interaction.user.id}`, now = Date.now();
        for (const [id, time] of reportCooldown) if (now - time > 60000) reportCooldown.delete(id);
        if (reportCooldown.has(key)) { await interaction.editReply('Attends une minute entre les signalements.'); return true; }
        const message = interaction.targetMessage;
        if (!message.channel.permissionsFor(interaction.member)?.has(P.ViewChannel)) { await interaction.editReply('Message inaccessible.'); return true; }
        const channel = await interaction.guild.channels.fetch(config.logChannelId);
        await channel.send({ embeds: [g.embed('🚩 Signalement', `**Auteur du signalement :** <@${interaction.user.id}>\n**Auteur du message :** <@${message.author.id}>\n[Voir le message](${message.url})\n\n${(message.content || '[Sans texte]').slice(0, 2800)}`)], allowedMentions: { parse: [] } });
        reportCooldown.set(key, now); await interaction.editReply('Signalement envoyé à l’équipe.'); return true;
    }
    if (!interaction.customId?.startsWith('cfg:')) return false;
    if (!interaction.guild || settings.blacklisted(interaction.user.id)) { await interaction.reply({ content: 'Accès refusé.', flags: MessageFlags.Ephemeral }); return true; }
    const [, action, id] = interaction.customId.split(':');
    if (interaction.isStringSelectMenu?.() && action === 'roles') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const menu = store.get(interaction.guildId).roleMenus[id];
        if (!menu || menu.messageId !== interaction.message.id || menu.channelId !== interaction.channelId || interaction.values.some(value => !menu.roleIds.includes(value))) { await interaction.editReply('Menu de rôles introuvable ou invalide.'); return true; }
        const member = await interaction.guild.members.fetch(interaction.user.id), roles = await interaction.guild.roles.fetch();
        if (menu.roleIds.some(id => !safeRole(roles.get(id), interaction.guild))) { await interaction.editReply('Un rôle du menu n’est plus attribuable sans risque. Un administrateur doit corriger le menu.'); return true; }
        const remove = menu.roleIds.filter(id => !interaction.values.includes(id) && member.roles.cache.has(id)), add = interaction.values.filter(id => !member.roles.cache.has(id));
        if (remove.length) await member.roles.remove(remove, 'Menu de rôles');
        if (add.length) await member.roles.add(add, 'Menu de rôles');
        await interaction.editReply('Rôles mis à jour.'); return true;
    }
    if (interaction.isButton() && action === 'ticket-open') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const key = `${interaction.guildId}:${interaction.user.id}`;
        if (locks.has(key)) { await interaction.editReply('Création déjà en cours.'); return true; }
        locks.add(key);
        try {
            const state = store.get(interaction.guildId), config = state.tickets;
            if (!config.enabled) throw new Error('Tickets désactivés.');
            const existing = Object.entries(state.openTickets).find(([, record]) => record.ownerId === interaction.user.id);
            if (existing && await interaction.guild.channels.fetch(existing[0]).catch(() => null)) { await interaction.editReply(`Tu as déjà un ticket : <#${existing[0]}>.`); return true; }
            const overwrites = [{ id: interaction.guildId, deny: [P.ViewChannel] }, { id: interaction.guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels] }, { id: interaction.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }];
            if (config.staffRoleId) overwrites.push({ id: config.staffRoleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] });
            const channel = await interaction.guild.channels.create({ name: `ticket-${interaction.user.id}`, type: ChannelType.GuildText, parent: config.categoryId, permissionOverwrites: overwrites, reason: 'Ticket demandé par un membre' });
            try {
                store.mutate(interaction.guildId, state => { if (existing) delete state.openTickets[existing[0]]; state.openTickets[channel.id] = { ownerId: interaction.user.id, claimedBy: null, createdAt: Date.now() }; });
                await channel.send({ embeds: [g.embed('🎫 Ticket ouvert', `Bonjour <@${interaction.user.id}>. Décris ta demande ici.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cfg:ticket-close').setLabel('Fermer').setStyle(ButtonStyle.Danger))], allowedMentions: { parse: [], users: [interaction.user.id] } });
            } catch (error) { await channel.delete('Annulation ticket').catch(() => {}); store.mutate(interaction.guildId, state => { delete state.openTickets[channel.id]; }); throw error; }
            await interaction.editReply(`Ticket créé : <#${channel.id}>.`);
        } catch (error) { await interaction.editReply(`Création impossible : ${error.message}`); }
        finally { locks.delete(key); }
        return true;
    }
    if (interaction.isButton() && action === 'ticket-close') {
        const ticket = store.get(interaction.guildId).openTickets[interaction.channelId];
        if (!ticket || !ticketAccess(interaction.guild, interaction.user.id, interaction.member, ticket)) { await interaction.reply({ content: 'Accès refusé.', flags: MessageFlags.Ephemeral }); return true; }
        const modal = new ModalBuilder().setCustomId('cfg:ticket-confirm-close').setTitle('Fermer le ticket')
            .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Raison (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300)));
        await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit?.() && action === 'ticket-confirm-close') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ticket = store.get(interaction.guildId).openTickets[interaction.channelId];
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!ticketAccess(interaction.guild, interaction.user.id, member, ticket)) { await interaction.editReply('Accès refusé.'); return true; }
        await interaction.editReply('Fermeture du ticket…');
        await closeTicket(interaction.guild, interaction.channelId, interaction.fields.getTextInputValue('reason')); return true;
    }
    return false;
}
module.exports = { handle, closeTicket, ticketAccess, safeRole };

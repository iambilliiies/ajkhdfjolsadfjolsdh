const { ChannelType, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('./managementStore');
const configStore = require('./serverConfigStore');
const settings = require('./settings');
const g = require('./general');
const opening = new Map();
const closing = new Map();
function ticketForChannel(guildId, channelId) {
    return Object.entries(store.get(guildId).tickets).find(([, record]) => record.channelId === channelId && !record.closed);
}
function close(guild, channelId, client, actorId, reason = 'Fermeture par l’équipe') {
    const key = `${guild.id}:${channelId}`;
    if (closing.has(key)) return closing.get(key);
    const task = (async () => {
        const entry = ticketForChannel(guild.id, channelId);
        if (!entry) throw new Error('Ticket modmail introuvable ou déjà fermé.');
        const [userId, record] = entry;
        const channel = await guild.channels.fetch(channelId);
        if (!channel) throw new Error('Salon modmail introuvable.');
        await channel.delete(`Modmail fermé par ${actorId} : ${String(reason).slice(0, 350)}`);
        store.mutate(guild.id, state => {
            if (state.tickets[userId]?.channelId === channelId) Object.assign(state.tickets[userId], { closed: true, closedAt: Date.now(), closedBy: actorId, closeReason: String(reason).slice(0, 1000) });
        });
        let notified = false;
        if (settings.read().dmEnabled) {
            try {
                const user = await client.users.fetch(record.userId);
                await user.send({ embeds: [g.embed('🔒 Modmail fermé', `Ton ticket sur **${guild.name}** a été fermé par l’équipe.\n\n**Raison :** ${String(reason).slice(0, 1000)}\n\nTu peux envoyer un nouveau MP pour ouvrir un nouveau ticket si le modmail est activé.`)], allowedMentions: { parse: [] } });
                notified = true;
            } catch (error) { console.error(`Notification de fermeture modmail ${guild.id}/${userId} :`, error.message); }
        }
        return { notified };
    })();
    closing.set(key, task);
    task.then(() => { closing.delete(key); }, () => { closing.delete(key); });
    return task;
}
function open(guild, member, client, openedBy) {
    const key = `${guild.id}:${member.id}`;
    if (opening.has(key)) return opening.get(key);
    const task = (async () => {
        const config = configStore.get(guild.id).modmail, mailGuild = configStore.read().modmailGuildId;
        if (mailGuild && mailGuild !== guild.id) throw new Error('Le modmail est configuré sur un autre serveur.');
        if (config.categoryId && !config.enabled || !openedBy && !config.enabled) throw new Error('Le modmail est désactivé.');
        if (member.user.bot) throw new Error('Membre humain requis.');
        let current = store.get(guild.id).tickets[member.id];
        if (current && closing.has(`${guild.id}:${current.channelId}`)) {
            await closing.get(`${guild.id}:${current.channelId}`);
            current = store.get(guild.id).tickets[member.id];
        }
        if (current && !current.closed) {
            const channel = await guild.channels.fetch(current.channelId).catch(error => {
                if (error.code === 10003) return null;
                throw error;
            });
            if (channel) return { channel, created: false };
        }
        if (config.categoryId) {
            const category = await guild.channels.fetch(config.categoryId);
            if (!category || category.type !== ChannelType.GuildCategory) throw new Error('La catégorie modmail a été supprimée ou est invalide.');
        } else if (!openedBy) throw new Error('Aucune catégorie modmail configurée.');
        const channel = await guild.channels.create({ name: `modmail-${member.id}`, type: ChannelType.GuildText, parent: config.categoryId,
            permissionOverwrites: [{ id: guild.id, deny: [P.ViewChannel] }, { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks] }],
            reason: openedBy ? `Modmail par ${openedBy}` : `Modmail reçu de ${member.id}` });
        try {
            await channel.send({ embeds: [g.embed('Modmail ouvert', `Membre : <@${member.id}>\n${openedBy ? 'Aucune notification envoyée. ' : ''}Les messages des administrateurs dans ce ticket seront relayés en MP au membre.`)],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mg:modmail-close').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger))], allowedMentions: { parse: [] } });
            store.mutate(guild.id, state => { state.tickets[member.id] = { userId: member.id, channelId: channel.id, closed: false }; });
        } catch (error) { await channel.delete('Annulation modmail').catch(() => {}); throw error; }
        return { channel, created: true };
    })();
    opening.set(key, task);
    task.then(() => { opening.delete(key); }, () => { opening.delete(key); });
    return task;
}
async function receive(message) {
    if (message.author.bot || settings.blacklisted(message.author.id) || message.content.startsWith(settings.prefix())) return;
    const mailGuild = configStore.read().modmailGuildId;
    const tickets = Object.entries(store.read()).filter(([guildId]) => {
        const config = configStore.get(guildId).modmail;
        return (!mailGuild || guildId === mailGuild) && (!config.categoryId || config.enabled);
    }).flatMap(([guildId, state]) => Object.entries(state.tickets || {}).filter(([userId, record]) => userId === message.author.id && !record.closed).map(([, record]) => ({ ...record, guildId })));
    let target = tickets.length === 1 ? tickets[0] : null, text = message.content;
    const selector = text.match(/^\[(\d+)\]\s*([\s\S]*)$/);
    if (selector) { target = tickets.find(ticket => ticket.guildId === selector[1]); text = selector[2]; }
    if (selector && !target && selector[1] !== mailGuild) {
        await message.reply({ content: 'Aucun ticket modmail ouvert pour ce serveur.', allowedMentions: { parse: [] } }); return;
    }
    if (tickets.length > 1 && !target) {
        await message.reply({ content: `Plusieurs tickets sont ouverts. Commence ta réponse par [ID du serveur] : ${tickets.map(t => `[${t.guildId}]`).join(', ')}`, allowedMentions: { parse: [] } }); return;
    }
    const attachments = [...(message.attachments?.values() || [])];
    if (!text.trim() && !attachments.length) return;
    if (!target && !mailGuild) return;
    try {
        let channel, created = false;
        if (!target || target.guildId === mailGuild) {
            const guild = message.client.guilds.cache.get(mailGuild);
            if (!guild || !configStore.get(mailGuild).modmail.enabled) return;
            let member;
            try { member = await guild.members.fetch(message.author.id); }
            catch (error) { if (error.code === 10007) throw new Error('Tu dois être membre du serveur pour ouvrir un modmail.'); throw error; }
            ({ channel, created } = await open(guild, member, message.client));
        } else channel = await message.client.channels.fetch(target.channelId);
        if (!channel?.isTextBased()) throw new Error('Salon modmail introuvable.');
        const lines = attachments.map(a => a.url);
        const description = [text, ...lines].filter(Boolean).join('\n');
        // Discord limite la description d’un embed à 4096 caractères.
        for (let offset = 0; offset < description.length; offset += 3500) {
            await channel.send({ embeds: [g.embed(`📩 ${message.author.tag || message.author.username || message.author.id}`, description.slice(offset, offset + 3500))], allowedMentions: { parse: [] } });
        }
        if (created && settings.read().dmEnabled) await message.reply({ embeds: [g.embed('📩 Modmail', 'Ton ticket a été ouvert et ton message a été envoyé à l’équipe. Réponds ici pour continuer la discussion.')], allowedMentions: { parse: [] } });
    } catch (error) {
        console.error('Réception modmail :', error);
        if (settings.read().dmEnabled) await message.reply({ content: '❌ Impossible d’envoyer ton modmail. Vérifie que tu es membre du serveur. Si le problème persiste, un administrateur doit vérifier la catégorie et les permissions du bot.', allowedMentions: { parse: [] } }).catch(() => {});
    }
}
module.exports = { open, receive, close, ticketForChannel };

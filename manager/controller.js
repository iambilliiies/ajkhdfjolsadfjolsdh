const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { duration, id } = require('./rentals');
const embed = (title, description) => new EmbedBuilder().setColor(0xED1515).setTitle(`Protect • ${title}`).setDescription(description).setFooter({ text: 'Protect Gestion' });
async function validateToken(token) {
    let response;
    try { response = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('Discord est indisponible. Réessaie avec le bouton.'); }
    if (!response.ok) throw new Error('Token de bot invalide ou refusé par Discord.');
    const user = await response.json();
    if (!user.bot) throw new Error('Un token de bot Discord est requis.');
    return user;
}
class Controller {
    constructor(client, config, rentals, supervisor, validate = validateToken, forbiddenTokens = []) {
        Object.assign(this, { client, config, rentals, supervisor, validate, forbiddenTokens }); this.activating = new Set();
    }
    owner(userId) { return userId === this.config.ownerId; }
    async message(message) {
        if (message.author.bot || !message.content.startsWith(this.config.prefix)) return;
        const args = message.content.slice(this.config.prefix.length).trim().split(/\s+/), command = args.shift()?.toLowerCase();
        if (!['create', 'mybot', 'renew', 'help'].includes(command)) return;
        const reply = payload => message.reply({ ...(typeof payload === 'string' ? { content: payload } : payload), allowedMentions: { parse: [], repliedUser: false } });
        try {
            if (['create', 'renew'].includes(command) && !this.owner(message.author.id)) throw new Error('Commande réservée au propriétaire du gestionnaire.');
            if (command === 'help') return reply({ embeds: [embed('Commandes', `${this.config.prefix}mybot : tes bots et leurs échéances.\n\nPropriétaire uniquement :\n${this.config.prefix}create @client 30j\n${this.config.prefix}renew <ID location ou @client> 30j`)] });
            if (command === 'create') {
                if (args.length !== 2) throw new Error(`Utilise ${this.config.prefix}create @client 30j.`);
                const clientId = id(args[0]), time = duration(args[1]);
                const customer = await this.client.users.fetch(clientId);
                if (customer.bot) throw new Error('Choisis un client humain.');
                const record = this.rentals.create(clientId, time);
                try {
                    await customer.send({ embeds: [embed('Ton bot personnel', `Une location de **${args[1]}** a été créée pour toi.\nClique sur le bouton pour saisir **le token de ton bot** et **l’ID Discord de son owner** dans un formulaire privé.\n\nLa durée commence à l’activation. Ce lien est valable 24 heures. Active Server Members Intent, Message Content Intent et Presence Intent dans le portail développeur Discord avant l’activation.\n\n**ID de location :** \`${record.id}\``)],
                        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mgr:setup:${record.id}:${record.nonce}`).setLabel('Configurer mon bot').setStyle(ButtonStyle.Primary))], allowedMentions: { parse: [] } });
                } catch { this.rentals.store.mutate(all => { delete all[record.id]; }); throw new Error('Le client bloque les MP. Il doit les autoriser avant de recréer la location.'); }
                return reply({ embeds: [embed('Location créée', `Formulaire envoyé en MP au client.\n**ID :** \`${record.id}\`\n**Durée :** ${args[1]}`)] });
            }
            if (command === 'renew') {
                if (args.length !== 2) throw new Error(`Utilise ${this.config.prefix}renew <ID location ou @client> 30j.`);
                const record = this.rentals.renew(args[0], duration(args[1]));
                await this.supervisor.tick();
                try { await (await this.client.users.fetch(record.clientId)).send({ embeds: [embed('Location renouvelée', `**Location :** \`${record.id}\`\n**Durée ajoutée :** ${args[1]}\n${record.expiresAt ? `**Nouvelle échéance :** <t:${Math.floor(record.expiresAt / 1000)}:F>` : 'La durée commencera après configuration de ton bot.'}`)], allowedMentions: { parse: [] } }); } catch { /* Le renouvellement reste enregistré si le client bloque les MP. */ }
                return reply('✅ Location renouvelée.');
            }
            let records = Object.values(this.rentals.store.read()).filter(r => this.owner(message.author.id) || r.clientId === message.author.id);
            if (args[0]) records = records.filter(r => r.id === args[0] || r.clientId === id(args[0]));
            if (!records.length) return reply('Aucun bot personnel trouvé.');
            let description = '';
            for (const record of records) {
                const status = record.expiresAt <= Date.now() ? 'Expiré' : record.state === 'pending' ? (record.signupExpiresAt <= Date.now() ? 'Invitation expirée' : 'À configurer') : record.state === 'failed' ? 'Démarrage en échec' : this.supervisor.children.has(record.id) ? 'Lancé' : 'En attente de lancement';
                const line = `**${status}** • Client <@${record.clientId}>\nID : \`${record.id}\`\n${record.botId ? `[Inviter le bot](https://discord.com/oauth2/authorize?client_id=${record.botId}&permissions=8&scope=bot%20applications.commands)\n` : ''}${record.expiresAt ? `Échéance : <t:${Math.floor(record.expiresAt / 1000)}:F>` : 'La durée commence à l’activation.'}\n\n`;
                if (description.length + line.length > 3500) { await reply({ embeds: [embed('Mes bots', description)] }); description = ''; }
                description += line;
            }
            if (description) await reply({ embeds: [embed('Mes bots', description)] });
        } catch (error) { await reply(`❌ ${error.message}`).catch(() => {}); }
    }
    async interaction(interaction) {
        if (!interaction.customId?.startsWith('mgr:')) return;
        const [, action, recordId, nonce] = interaction.customId.split(':');
        let locked = false;
        try {
            const record = this.rentals.store.read()[recordId];
            if (!record || record.clientId !== interaction.user.id || record.nonce !== nonce || record.state !== 'pending' || record.signupExpiresAt <= Date.now()) throw new Error('Invitation réservée à son client, expirée ou déjà utilisée.');
            if (interaction.isButton() && action === 'setup') {
                const modal = new ModalBuilder().setCustomId(`mgr:submit:${recordId}:${nonce}`).setTitle('Configurer mon bot Protect').addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('token').setLabel('Token du bot Discord').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(20).setMaxLength(200)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('owner').setLabel('ID Discord de l’owner du bot').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(15).setMaxLength(22))
                );
                return interaction.showModal(modal);
            }
            if (!interaction.isModalSubmit() || action !== 'submit') return;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (this.activating.has(recordId)) throw new Error('Activation déjà en cours.');
            this.activating.add(recordId); locked = true;
            const token = interaction.fields.getTextInputValue('token').trim().replace(/^Bot\s+/i, ''), ownerId = interaction.fields.getTextInputValue('owner').trim();
            if (!/^[\w.-]{20,200}$/.test(token)) throw new Error('Format du token invalide.');
            if (!/^\d{15,22}$/.test(ownerId)) throw new Error('ID owner invalide.');
            if (this.forbiddenTokens.includes(token)) throw new Error('Le token du gestionnaire ou du bot principal ne peut pas être utilisé.');
            const owner = await this.client.users.fetch(ownerId).catch(() => null);
            if (!owner || owner.bot) throw new Error('L’owner doit être un utilisateur Discord existant.');
            const bot = await this.validate(token);
            if (bot.id === this.client.user.id) throw new Error('Le bot de gestion ne peut pas être loué.');
            const active = this.rentals.activate(recordId, interaction.user.id, nonce, token, ownerId, bot.id);
            await this.supervisor.tick();
            const latest = this.rentals.store.read()[recordId];
            await interaction.editReply({ embeds: [embed('Activation enregistrée', `**Bot :** ${bot.username}\n**Owner :** <@${ownerId}>\n**Échéance :** <t:${Math.floor(active.expiresAt / 1000)}:F>\n\n${latest.state === 'failed' ? 'Le lancement a échoué : contacte le gestionnaire.' : 'Le lancement est en cours. Consulte +mybot pour son état.'}\n\n[Inviter ton bot avec slash](https://discord.com/oauth2/authorize?client_id=${bot.id}&permissions=8&scope=bot%20applications.commands)`)], allowedMentions: { parse: [] } });
        } catch (error) {
            const payload = { content: `❌ ${error.message}`, allowedMentions: { parse: [] } };
            if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
            else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
        } finally { if (locked) this.activating.delete(recordId); }
    }
}
module.exports = { Controller, validateToken, embed };

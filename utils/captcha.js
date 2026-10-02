const { randomInt, randomUUID } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const store = require('./serverConfigStore');
const tools = require('./managementTools');
const g = require('./general');
const challenges = new Map();
const safeRole = (role, guild) => require('./serverConfigInteractions').safeRole(role, guild);
async function configure(message, args) {
    tools.guard(message);
    if (args[0] === 'off') {
        store.mutate(message.guild.id, state => { state.captcha = { enabled: false }; });
        return g.reply(message, g.embed('Captcha', 'Captcha désactivé.'));
    }
    if (args.length && !['settings', 'on'].includes(args[0])) throw new Error('Utilise captcha, captcha settings ou captcha off.');
    const config = store.get(message.guild.id).captcha || {};
    return require('./ownerUI').form(message, 'Configuration du captcha', [
        { id: 'enabled', label: 'Activer : on/off', value: config.enabled ? 'on' : 'off', required: true },
        { id: 'channel', label: 'Salon de vérification (nom ou ID)', value: config.channelId || '', required: false },
        { id: 'role', label: 'Rôle vérifié (nom ou ID)', value: config.roleId || '', required: false }
    ], async values => {
        if (!['on', 'off'].includes(values.enabled)) throw new Error('Indique on ou off.');
        if (values.enabled === 'off') return store.mutate(message.guild.id, state => { state.captcha = { enabled: false }; });
        const channel = await tools.channel(message, values.channel), role = await tools.role(message, values.role);
        const me = message.guild.members.me || await message.guild.members.fetchMe();
        if (channel.type !== ChannelType.GuildText || !channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks]) || !me.permissions.has(P.ManageRoles)) throw new Error('Salon textuel requis ; le bot doit pouvoir y envoyer des embeds et gérer les rôles.');
        if (!safeRole(role, message.guild)) throw new Error('Choisis un rôle vérifié sans permission dangereuse, sous le rôle du bot.');
        const sent = await channel.send({
            embeds: [g.embed('🛡️ Vérification', 'Clique sur le bouton et réponds au calcul pour recevoir le rôle vérifié.')],
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('captcha:open').setLabel('Se vérifier').setStyle(ButtonStyle.Success))],
            allowedMentions: { parse: [] }
        });
        store.mutate(message.guild.id, state => { state.captcha = { enabled: true, channelId: channel.id, roleId: role.id, messageId: sent.id }; });
    }, tools.authorize(message));
}
async function handle(interaction) {
    if (!interaction.customId?.startsWith('captcha:') || !(interaction.isButton() || interaction.isModalSubmit())) return false;
    if (!interaction.guild || interaction.user.bot) throw new Error('Vérification réservée aux membres du serveur.');
    const config = store.get(interaction.guild.id).captcha;
    if (!config?.enabled || config.channelId !== interaction.channelId) throw new Error('Captcha désactivé ou déplacé.');
    if (interaction.isButton()) {
        if (interaction.customId !== 'captcha:open' || config.messageId !== interaction.message.id) throw new Error('Ce panneau de vérification a été remplacé.');
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (member.roles.cache.has(config.roleId)) {
            await interaction.reply({ content: 'Tu es déjà vérifié.', flags: MessageFlags.Ephemeral }); return true;
        }
        const now = Date.now();
        for (const [id, record] of challenges) if (record.expiresAt <= now) challenges.delete(id);
        if ([...challenges.values()].some(r => r.guildId === interaction.guild.id && r.userId === interaction.user.id && r.createdAt + 30000 > now)) throw new Error('Attends 30 secondes avant de redemander un captcha.');
        if (challenges.size >= 10000) throw new Error('Trop de vérifications en cours. Réessaie dans deux minutes.');
        const a = randomInt(10, 100), b = randomInt(10, 100), id = randomUUID();
        challenges.set(id, { guildId: interaction.guild.id, userId: interaction.user.id, roleId: config.roleId, messageId: config.messageId, answer: String(a + b), createdAt: now, expiresAt: now + 120000 });
        const modal = new ModalBuilder().setCustomId(`captcha:answer:${id}`).setTitle('Vérification Protect').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('answer').setLabel(`Combien font ${a} + ${b} ?`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)));
        await interaction.showModal(modal); return true;
    }
    const id = interaction.customId.slice('captcha:answer:'.length), challenge = challenges.get(id);
    if (!challenge || challenge.used || challenge.userId !== interaction.user.id || challenge.guildId !== interaction.guild.id) throw new Error('Captcha introuvable. Clique de nouveau sur Se vérifier.');
    // Une tentative consomme le défi avant toute requête Discord.
    challenge.used = true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (challenge.expiresAt <= Date.now() || challenge.roleId !== config.roleId || challenge.messageId !== config.messageId) throw new Error('Captcha expiré ou configuration modifiée. Relance la vérification.');
    if (interaction.fields.getTextInputValue('answer').trim() !== challenge.answer) throw new Error('Réponse incorrecte. Clique de nouveau sur Se vérifier.');
    const role = await interaction.guild.roles.fetch(config.roleId);
    if (!safeRole(role, interaction.guild)) throw new Error('Le rôle vérifié n’est plus attribuable. Préviens un administrateur.');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(role.id, 'Captcha Protect réussi');
    await interaction.editReply('✅ Vérification réussie ! Ton rôle vérifié a été ajouté.');
    return true;
}
module.exports = { configure, handle };

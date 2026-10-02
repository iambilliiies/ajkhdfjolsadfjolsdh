const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, ApplicationCommandType, MessageFlags } = require('discord.js');
const settings = require('./settings');
const { allowed } = require('./permissions');
const options = {
    rolemembers: [['Role', 'role', 'Rôle à consulter', true]], role: [['Role', 'role', 'Rôle à consulter', true]],
    channel: [['Channel', 'salon', 'Salon à consulter', false]],
    user: [['User', 'membre', 'Utilisateur à consulter', false]], member: [['User', 'membre', 'Membre à consulter', false]],
    pic: [['User', 'membre', 'Utilisateur dont afficher l’avatar', false]], banner: [['User', 'membre', 'Utilisateur dont afficher la bannière', false]],
    emoji: [['String', 'emoji', 'Émoji Unicode ou personnalisé', true, 100]],
    image: [['String', 'mot-cle', 'Recherche Google Images', true, 500]],
    wiki: [['String', 'mot-cle', 'Recherche Wikipedia', true, 500]],
    suggestion: [['String', 'message', 'Texte de la suggestion', true, 2000]],
    calc: [['String', 'calcul', 'Calcul ou équation en x', true, 500]]
};
function addOptions(builder, specs) {
    for (const [type, name, description, required, max] of specs) builder[`add${type}Option`](option => {
        option.setName(name).setDescription(description).setRequired(required);
        if (max) option.setMaxLength(max);
        return option;
    });
    return builder;
}
function commands(client) {
    const routes = [...client.commands.values(), ...[...(client.commandRoutes?.values() || [])].flat()];
    return new Map(routes.filter(command => !command.hidden && !command.ownerOnly && String(command.category || 'general').toLowerCase() === 'general').map(command => [command.name, command]));
}
function definition(command) {
    const builder = new SlashCommandBuilder().setName(command.name).setDescription(command.description.slice(0, 100))
        .setContexts(InteractionContextType.Guild).setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
    if (command.name === 'server') {
        for (const name of ['pic', 'banner']) builder.addSubcommand(sub => sub.setName(name).setDescription(name === 'pic' ? 'Affiche l’icône du serveur' : 'Affiche la bannière du serveur'));
    } else if (command.name === 'lb') builder.addSubcommand(sub => sub.setName('suggestions').setDescription('Affiche les suggestions les mieux notées'));
    else if (command.name === 'search') builder.addSubcommand(sub => addOptions(sub.setName('wiki').setDescription('Recherche des articles Wikipedia'), options.wiki));
    else if (command.name === 'tempvoc') {
        for (const [name, description] of [['info', 'Affiche le vocal de création'], ['cmd', 'Affiche les commandes des vocaux temporaires'], ['name', 'Renomme ton vocal temporaire'], ['limit', 'Change la limite de ton vocal temporaire'], ['lock', 'Verrouille ton vocal temporaire'], ['unlock', 'Déverrouille ton vocal temporaire']]) {
            builder.addSubcommand(sub => {
                sub.setName(name).setDescription(description);
                if (name === 'name') sub.addStringOption(option => option.setName('nom').setDescription('Nouveau nom').setRequired(true).setMaxLength(100));
                if (name === 'limit') sub.addIntegerOption(option => option.setName('nombre').setDescription('Limite de membres ; 0 = illimité').setRequired(true).setMinValue(0).setMaxValue(99));
                return sub;
            });
        }
    } else addOptions(builder, options[command.name] || []);
    return builder.toJSON();
}
function argumentsFor(interaction) {
    const name = interaction.commandName;
    if (['server', 'lb', 'search', 'tempvoc'].includes(name)) {
        const sub = interaction.options.getSubcommand();
        if (name === 'tempvoc') return sub === 'info' ? [] : [sub, ...(sub === 'name' ? [interaction.options.getString('nom', true)] : sub === 'limit' ? [String(interaction.options.getInteger('nombre', true))] : [])];
        return [sub, ...(name === 'search' ? [interaction.options.getString('mot-cle', true)] : [])];
    }
    return (options[name] || []).flatMap(([type, optionName, , required]) => {
        const value = interaction.options[`get${type}`](optionName, required);
        return value === null || value === undefined ? [] : [type === 'String' ? value : value.id];
    });
}
async function register(client) {
    try {
        const existing = await client.application.commands.fetch();
        for (const command of commands(client).values()) {
            const data = definition(command), current = existing.find(entry => entry.name === data.name && entry.type === ApplicationCommandType.ChatInput);
            if (current?.equals(data, true)) continue;
            // Upsert individuel : conserve notamment les commandes de signalement.
            await client.application.commands.create(data);
        }
        console.log(`✅ ${commands(client).size} commandes Général disponibles en slash et avec préfixe.`);
    } catch (error) { console.error('Enregistrement des commandes slash Général :', error.message); }
}
function messageAdapter(interaction, member, args) {
    let replied = false;
    return {
        id: interaction.id, guild: interaction.guild, channel: interaction.channel, client: interaction.client,
        author: interaction.user, member, createdTimestamp: interaction.createdTimestamp, isSlash: true,
        content: `${settings.prefix()}${interaction.commandName} ${args.join(' ')}`,
        reply: async payload => {
            payload = typeof payload === 'string' ? { content: payload } : payload;
            payload = { ...payload, allowedMentions: { parse: [], repliedUser: false, ...payload.allowedMentions } };
            if (replied) return interaction.followUp(payload);
            const sent = await interaction.editReply(payload); replied = true; return sent;
        },
        hasReplied: () => replied
    };
}
async function handle(interaction) {
    if (!interaction.isChatInputCommand?.()) return false;
    const command = commands(interaction.client).get(interaction.commandName);
    if (!command) return false;
    if (!interaction.guild || settings.blacklisted(interaction.user.id)) {
        await interaction.reply({ content: 'Cette commande nécessite un serveur ou ton accès est refusé.', flags: MessageFlags.Ephemeral }); return true;
    }
    await interaction.deferReply();
    try {
        const member = await interaction.guild.members.fetch(interaction.user.id), args = argumentsFor(interaction);
        const message = messageAdapter(interaction, member, args);
        if (!allowed(message, command)) throw new Error('Tu n’as pas la permission nécessaire pour cette commande.');
        if (!require('./moderation').publicAllowed(message, command)) throw new Error('Les commandes publiques sont désactivées dans ce salon.');
        await command.execute(message, args, interaction.client, { prefix: settings.prefix() });
        if (!message.hasReplied()) await message.reply('✅ Commande effectuée.');
    } catch (error) {
        console.error(`Commande slash ${interaction.commandName} :`, error.message);
        await interaction.editReply({ content: `❌ ${String(error.message).slice(0, 1500)}`, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return true;
}
module.exports = { register, handle, commands, definition, argumentsFor, messageAdapter };

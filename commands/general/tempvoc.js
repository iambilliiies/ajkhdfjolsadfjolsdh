const g = require('../../utils/general');
const store = require('../../utils/serverConfigStore');
const command = require('../../utils/serverConfigCommands')('tempvoc');
module.exports = {
    name: 'tempvoc', category: 'general', defaultPermission: 'everyone',
    usage: 'tempvoc', description: 'Affiche comment créer et gérer ton vocal temporaire',
    helpEntries: [
        { usage: 'tempvoc', description: 'Affiche le vocal à rejoindre pour créer ton vocal temporaire' },
        { usage: 'tempvoc cmd', description: 'Affiche les commandes de gestion de ton vocal temporaire' }
    ],
    async execute(message, args, client) {
        if (args.length) return command.execute(message, args, client);
        const config = store.get(message.guild.id).tempVoice;
        const description = config.enabled && config.hubId
            ? `Rejoins <#${config.hubId}> pour créer ton vocal temporaire.\nUtilise \`tempvoc cmd\` pour afficher les commandes de gestion.`
            : 'Les vocaux temporaires ne sont pas activés sur ce serveur. Un administrateur peut les configurer avec `tempvoc settings`.';
        return g.reply(message, g.embed('Vocaux temporaires', description));
    }
};

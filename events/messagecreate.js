const fs = require('node:fs');
const path = require('node:path');
const settings = require('../utils/settings');
const { allowed } = require('../utils/permissions');
const prefixFile = path.join(__dirname, '../data/prefixes.json');
const dmCommands = new Set(['help', 'ping', 'calc', 'wiki', 'search', 'image', 'emoji', 'protect', 'crowbots', 'changelogs', 'user', 'pic', 'banner']);
module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || settings.blacklisted(message.author.id)) return;
        await require('../utils/antiraid').message(message);
        if (await require('../utils/moderation').message(message)) return;
        await require('../utils/managementInteractions').onMessage(message);
        await require('../utils/serverConfigRuntime').onMessage(message);
        let prefix = settings.prefix();
        if (message.guild && fs.existsSync(prefixFile)) {
            try {
                const prefixes = JSON.parse(fs.readFileSync(prefixFile, 'utf8'));
                if (!prefixes || typeof prefixes !== 'object' || Array.isArray(prefixes)) throw new Error('Préfixes invalides');
                if (typeof prefixes[message.guild.id] === 'string' && prefixes[message.guild.id]) prefix = prefixes[message.guild.id];
            } catch (error) { console.error('Préfixes :', error.message); }
        }
        if (!message.content.startsWith(prefix)) return;
        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        let name = args.shift()?.toLowerCase();
        if (!name) return;
        const aliases = settings.read().aliases;
        if (Object.hasOwn(aliases, name)) name = aliases[name];
        const ownerCommand = client.ownerCommands.get(name);
        const ownerMatch = ownerCommand && (!ownerCommand.matches || ownerCommand.matches(args));
        const routes = client.commandRoutes?.get(name) || [];
        const command = ownerMatch ? ownerCommand : routes.find(route => route.matches?.(args)) || routes.find(route => !route.matches) || client.commands.get(name);
        if (!command) {
            if (message.guild && require('../utils/moderation').publicAllowed(message)) await require('../utils/serverConfigRuntime').custom(message, name, args);
            return;
        }
        try {
            if (!require('../utils/moderation').publicAllowed(message, command)) return await message.reply({ content: 'Les commandes publiques sont désactivées dans ce salon.', allowedMentions: { parse: [] } });
            if ((ownerMatch && !settings.isOwner(message.author.id)) || !allowed(message, command)) {
                return await message.reply({ content: ownerMatch ? '❌ Cette commande est réservée aux **owners du bot**.' : '❌ Tu n’as pas la permission nécessaire pour cette commande.', allowedMentions: { parse: [] } });
            }
            if (!message.guild && !ownerMatch && !dmCommands.has(name)) return await message.reply('Cette commande nécessite un serveur.');
            const cleanup = require('../utils/serverConfigRuntime').trackReplies(message, command);
            try { await command.execute(message, args, client, { prefix }); }
            finally { cleanup(); }
        } catch (error) {
            console.error(`Commande ${name} :`, error);
            await message.reply({ content: `❌ ${String(error.message || 'Une erreur est survenue.').slice(0, 1500)}`, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
        }
    }
};

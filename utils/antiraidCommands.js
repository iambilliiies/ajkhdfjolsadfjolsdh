const { PermissionFlagsBits: P } = require('discord.js');
const store = require('./antiraidStore');
const engine = require('./antiraid');
const settings = require('./settings');
const g = require('./general');
const ui = require('./ownerUI');
const definitions = {
    raidlog: [['raidlog <on/off> [salon]', 'Active les logs de l’antiraid dans un salon']],
    raidping: [['raidping <rôle>', 'Modifie les rôles mentionnés en cas de raid']],
    antitoken: [['antitoken <on/off/lock>', 'Active, désactive ou verrouille les arrivées sur le serveur'], ['antitoken <nombre>/<durée>', 'Règle le seuil de joins déclenchant l’antitoken']],
    secur: [['secur [off/on/max]', 'Affiche ou modifie toutes les protections antiraid du serveur']],
    antiupdate: [['antiupdate <off/on/max>', 'Protège les paramètres du serveur']],
    antichannel: [['antichannel <off/on/max>', 'Protège les salons et leurs permissions']],
    antirole: [['antirole <off/on/max>', 'Protège les rôles et leurs attributions'], ['antirole <danger/all>', 'Protège les rôles dangereux ou tous les rôles']],
    antiwebhook: [['antiwebhook <off/on/max>', 'Surveille les créations, modifications et suppressions de webhooks']],
    clear: [['clear webhooks', 'Supprime tous les webhooks du serveur après confirmation'], ['clear wl', 'Vide la whitelist antiraid du serveur après confirmation']],
    antiunban: [['antiunban <off/on/max>', 'Protège contre les débannissements non autorisés']],
    antibot: [['antibot <off/on/max>', 'Protège contre l’ajout de bots non autorisés']],
    antiban: [['antiban <off/on/max>', 'Protège contre les bannissements et expulsions en masse'], ['antiban <nombre>/<durée>', 'Règle le seuil de bans ou kicks par membre']],
    antieveryone: [['antieveryone <off/on/max>', 'Protège contre les mentions everyone et here répétées'], ['antieveryone <nombre>/<durée>', 'Règle le seuil de mentions everyone ou here par membre']],
    antideco: [['antideco <off/on/max>', 'Protège contre les déconnexions vocales forcées en masse'], ['antideco <nombre>/<durée>', 'Règle le seuil de déconnexions forcées par membre']],
    blrank: [['blrank <on/off/max>', 'Active ou désactive la blacklist rank'], ['blrank <danger/all>', 'Retire seulement les rôles dangereux ou tous les rôles'], ['blrank <add/del> <membre>', 'Ajoute ou retire un membre de la blacklist rank'], ['blrank', 'Affiche la blacklist rank du serveur']],
    punition: [['punition <antiraid> <derank/kick/ban>', 'Définit la sanction d’une protection antiraid'], ['punition all <derank/kick/ban>', 'Définit la sanction de toutes les protections']],
    creation: [['creation limit <durée>', 'Définit l’âge minimum d’un compte pour rejoindre le serveur']],
    wl: [['wl <@membre/ID>', 'Ajoute des membres à la whitelist antiraid du serveur'], ['wl', 'Affiche la whitelist du serveur']],
    unwl: [['unwl <@membre/ID>', 'Retire des membres de la whitelist antiraid du serveur']]
};
function canConfigure(guild, userId, member) {
    return settings.isOwner(userId) || guild.ownerId === userId || Boolean(member?.permissions.has(P.Administrator));
}
function parts(args) {
    const text = args.join(' ').trim();
    if (!text) throw new Error('Indique au moins un nom, une mention ou un ID. Sépare les noms et IDs par ,,');
    return text.split(',,').flatMap(part => {
        const mentions = part.match(/<@!?\d+>|<@&\d+>|<#\d+>/g);
        if (mentions && !part.replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, '').trim()) return mentions;
        return [part.trim()];
    }).filter(Boolean);
}
async function resolveUsers(message, args, client) {
    const users = [];
    for (const query of parts(args)) {
        const id = g.id(query);
        const user = /^\d{15,22}$/.test(id) ? await client.users.fetch(id).catch(() => null) : (await g.member(message, [query]))?.user;
        if (!user) throw new Error(`Membre introuvable ou nom ambigu : ${query}.`);
        users.push(user.id);
    }
    return [...new Set(users)];
}
async function execute(name, message, args, client) {
    if (!message.guild) throw new Error('Les commandes antiraid nécessitent un serveur.');
    const guild = message.guild;
    if (!canConfigure(guild, message.author.id, message.member)) throw new Error('Configuration antiraid réservée aux administrateurs, au propriétaire du serveur et aux owners du bot.');
    const config = store.get(guild.id), action = args[0]?.toLowerCase();
    const send = (text, title = '🛡 Antiraid') => g.reply(message, g.embed(title, text));
    const saveMode = (feature, mode) => {
        if (!['off', 'on', 'max'].includes(mode)) throw new Error('Utilise off, on ou max.');
        store.save(guild.id, { modes: { ...config.modes, [feature]: mode } });
    };
    const authorize = async interaction => {
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        return canConfigure(guild, interaction.user.id, member);
    };
    if (name === 'raidlog') {
        if (!['on', 'off'].includes(action)) throw new Error('Utilise raidlog on/off [salon].');
        let channel = message.channel;
        if (args.length > 1) {
            const query = args.slice(1).join(' '), channels = await guild.channels.fetch();
            const matches = channels.filter(c => c && (c.id === g.id(query) || c.name.toLowerCase() === query.toLowerCase()));
            channel = matches.size === 1 ? matches.first() : null;
        }
        if (action === 'on' && (!channel?.isTextBased() || !channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks]))) throw new Error('Salon introuvable ou permissions ViewChannel, SendMessages, EmbedLinks manquantes.');
        store.save(guild.id, { logEnabled: action === 'on', ...(action === 'on' ? { logChannelId: channel.id } : {}) });
        return send(`Logs ${action === 'on' ? `activés dans <#${channel.id}>` : 'désactivés'}.`);
    }
    if (name === 'raidping') {
        if (action === 'off') { store.save(guild.id, { pingRoleIds: [] }); return send('Mentions de raid désactivées.'); }
        const roles = [];
        for (const query of parts(args)) {
            const role = await g.role(message, [query]);
            if (!role || role.id === guild.id) throw new Error(`Rôle introuvable ou rôle everyone interdit : ${query}.`);
            roles.push(role.id);
        }
        if (roles.length > 20) throw new Error('Maximum 20 rôles de notification.');
        store.save(guild.id, { pingRoleIds: [...new Set(roles)] }); return send(`Rôles de raid : ${roles.map(id => `<@&${id}>`).join(', ')}. Le bot doit pouvoir les mentionner.`);
    }
    if (name === 'secur') {
        if (action) {
            if (!['off', 'on', 'max'].includes(action)) throw new Error('Utilise secur off/on/max pour l’antiraid, ou secur invite on/off pour le réglage owner.');
            store.save(guild.id, { modes: Object.fromEntries(store.features.map(feature => [feature, action])), ...(action === 'off' ? { joinLock: false, blockedUntil: 0, creationAge: 0 } : {}) });
        }
        const current = store.get(guild.id);
        return send(`**Modes :**\n${store.features.map(feature => `\`${feature}\` : **${current.modes[feature]}** • ${current.punishments[feature]}`).join('\n')}\n\n**Seuils :**\n${Object.entries(current.limits).map(([feature, limit]) => `${feature} : ${limit.count}/${limit.duration / 1000}s`).join('\n')}\n\n**Rôles :** ${current.roleScope} • **Blacklist rank :** ${current.rankScope}\n**Âge minimum :** ${current.creationAge / 1000}s\n**Arrivées verrouillées :** ${current.joinLock ? 'Oui' : 'Non'}\n**Blocage temporaire :** ${current.blockedUntil > Date.now() ? g.date(current.blockedUntil) : 'Non'}\n**Whitelist :** ${current.whitelist.length} membre(s)\n**Logs :** ${current.logEnabled ? `<#${current.logChannelId}>` : 'off'}`);
    }
    if (name === 'antitoken' && action === 'lock') {
        store.save(guild.id, { modes: { ...config.modes, antitoken: 'max' }, joinLock: true });
        return send('Arrivées verrouillées : les nouveaux membres seront expulsés, sauf le propriétaire et les owners du bot. antitoken on/off lève le verrouillage. Discord ne permet pas de bloquer un join avant qu’il arrive.');
    }
    if (Object.hasOwn(config.limits, name) && action?.includes('/')) {
        const limit = store.limit(action);
        store.save(guild.id, { limits: { ...config.limits, [name]: limit } });
        return send(`${name} : seuil ${limit.count}/${limit.duration / 1000}s. Mode actuel : ${config.modes[name]}.`);
    }
    if (name === 'antirole' && ['danger', 'all'].includes(action)) { store.save(guild.id, { roleScope: action }); return send(`Portée antirole : ${action}.`); }
    if (name === 'blrank') {
        if (!action) return g.list(message, '🛡 Blacklist rank', config.rankBlacklist.map(id => `<@${id}> • \`${id}\``));
        if (['danger', 'all'].includes(action)) {
            store.save(guild.id, { rankScope: action });
            await enforceRanks(guild); return send(`Portée blacklist rank : ${action}.`);
        }
        if (['add', 'del'].includes(action)) {
            const users = await resolveUsers(message, args.slice(1), client);
            if (action === 'add' && users.some(id => id === guild.ownerId || settings.isOwner(id) || id === client.user.id)) throw new Error('Le propriétaire, les owners et le bot ne peuvent pas être blacklist rank.');
            store.save(guild.id, { rankBlacklist: action === 'add' ? [...new Set([...config.rankBlacklist, ...users])] : config.rankBlacklist.filter(id => !users.includes(id)) });
            if (action === 'add') await enforceRanks(guild, users);
            return send(`${users.length} membre(s) ${action === 'add' ? 'ajouté(s)' : 'retiré(s)'} de la blacklist rank.`);
        }
    }
    if (store.features.includes(name)) {
        saveMode(name, action);
        if (name === 'antitoken') store.save(guild.id, { joinLock: false, blockedUntil: 0 });
        if (name === 'blrank' && action !== 'off') await enforceRanks(guild);
        return send(`${name} : **${action}**. ${action === 'max' ? 'La whitelist est ignorée pour cette protection.' : ''}`);
    }
    if (name === 'punition') {
        const punishment = args[1]?.toLowerCase();
        if (!['derank', 'kick', 'ban'].includes(punishment) || (action !== 'all' && !store.features.includes(action))) throw new Error('Utilise punition <protection/all> derank/kick/ban.');
        const names = action === 'all' ? store.features : [action];
        store.save(guild.id, { punishments: { ...config.punishments, ...Object.fromEntries(names.map(feature => [feature, punishment])) } });
        return send(`Sanction ${punishment} enregistrée pour ${names.join(', ')}. Antitoken derank retire les rôles puis expulse les arrivants pour maintenir le verrouillage ; blrank retire les rôles concernés puis applique kick/ban si configuré.`);
    }
    if (name === 'creation') {
        if (action !== 'limit') throw new Error('Utilise creation limit <durée>. 0 désactive la limite.');
        const age = store.duration(args[1]); store.save(guild.id, { creationAge: age }); return send(`Âge minimum du compte : ${age / 1000}s.`);
    }
    if (name === 'wl' || name === 'unwl') {
        if (name === 'wl' && !args.length) return g.list(message, '🛡 Whitelist antiraid', config.whitelist.map(id => `<@${id}> • \`${id}\``));
        const users = await resolveUsers(message, args, client);
        store.save(guild.id, { whitelist: name === 'wl' ? [...new Set([...config.whitelist, ...users])] : config.whitelist.filter(id => !users.includes(id)) });
        return send(`${users.length} membre(s) ${name === 'wl' ? 'ajouté(s)' : 'retiré(s)'} de la whitelist.`);
    }
    if (name === 'clear') {
        if (action === 'wl') return ui.confirm(message, 'Vider la whitelist antiraid de ce serveur ?', () => store.save(guild.id, { whitelist: [] }), authorize);
        if (action === 'webhooks') return ui.confirm(message, 'Supprimer tous les webhooks de ce serveur ? Cette suppression est irréversible.', async () => {
            const hooks = await guild.fetchWebhooks(), errors = [];
            let deleted = 0;
            for (const hook of hooks.values()) {
                try { await hook.delete(`Antiraid : clear webhooks par ${message.author.id}`); deleted++; }
                catch (error) { errors.push(`${hook.name} : ${error.message}`); }
            }
            await g.list(message, '🛡 Webhooks', [`${deleted}/${hooks.size} webhook(s) supprimé(s).`, ...errors]);
        }, authorize);
        throw new Error('Utilise clear wl ou clear webhooks.');
    }
}
async function enforceRanks(guild, ids = store.get(guild.id).rankBlacklist) {
    for (const id of ids) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (member) await engine.stripRank(member);
    }
}
module.exports = name => ({ name, category: 'Antiraid', defaultPermission: 'Administrator', lockedPermission: true, usage: definitions[name][0][0], description: definitions[name][0][1], helpEntries: definitions[name].map(([usage, description]) => ({ usage, description })), execute: (message, args, client) => execute(name, message, args, client) });
module.exports.names = Object.keys(definitions);
module.exports.parts = parts;

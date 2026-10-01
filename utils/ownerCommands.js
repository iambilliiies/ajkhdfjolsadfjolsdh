const fs = require('node:fs');
const path = require('node:path');
const { ActivityType, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const settings = require('./settings');
const g = require('./general');
const ui = require('./ownerUI');
const presence = require('./presence');
const permissions = require('./permissions');
const updater = require('./updater');
const fivem = require('./fivem');
const definitions = {
    set: [['set name [nom]', 'Change le nom du bot'], ['set pic [lien]', 'Change la photo de profil du bot'], ['set banner [lien]', 'Change la bannière du bot'], ['set profil', 'Modifie le nom, la photo et la bannière avec un formulaire'], ['set lang <langue>', 'Change la langue du bot']],
    theme: [['theme <couleur>', 'Change la couleur des embeds du bot']],
    playto: [['playto [message]', 'Définit une activité de jeu ; sépare les phrases par ,,']],
    listen: [['listen [message]', 'Définit une activité d’écoute ; sépare les phrases par ,,']],
    watch: [['watch [message]', 'Définit une activité de visionnage ; sépare les phrases par ,,']],
    compet: [['compet [message]', 'Définit une activité de compétition ; sépare les phrases par ,,']],
    stream: [['stream [message]', 'Définit une activité de stream ; sépare les phrases par ,,']],
    remove: [['remove activity', 'Supprime l’activité du bot']],
    online: [['online', 'Passe le bot en ligne']], idle: [['idle', 'Passe le bot en inactif']], dnd: [['dnd', 'Passe le bot en ne pas déranger']], invisible: [['invisible', 'Passe le bot en invisible']],
    mp: [['mp settings', 'Gère les messages privés envoyés par le bot'], ['mp <membre> <message>', 'Envoie un message privé à un membre']],
    server: [['server list', 'Affiche la liste des serveurs du bot']],
    invite: [['invite <ID/nombre>', 'Crée une invitation pour un serveur du bot']],
    leave: [['leave [ID/nombre]', 'Fait quitter un serveur au bot']],
    discussion: [['discussion <ID/nombre>', 'Ouvre une discussion via le bot sur un serveur']],
    fivem: [['fivem [adresse]', 'Connecte le bot à un serveur FiveM et affiche son état']],
    owner: [['owner [@membre/ID]', 'Ajoute un owner ou affiche les owners du bot']],
    unowner: [['unowner <@membre/ID>', 'Retire un owner du bot']],
    clear: [['clear owners', 'Retire tous les owners secondaires'], ['clear bl', 'Vide la blacklist sans annuler les bannissements existants']],
    bl: [['bl [@membre/ID] [raison]', 'Blacklist un utilisateur et le bannit des serveurs du bot, ou affiche la blacklist']],
    unbl: [['unbl <@membre/ID>', 'Retire un utilisateur de la blacklist sans annuler ses bannissements']],
    blinfo: [['blinfo <@membre/ID>', 'Affiche les informations de blacklist d’un utilisateur']],
    say: [['say <message>', 'Envoie un message dans le salon courant']],
    change: [['change <commande> <permission>', 'Change la permission d’une commande générale'], ['change reset', 'Réinitialise les permissions des commandes']],
    changeall: [['changeall <permission> <permission>', 'Transfère les commandes d’une permission vers une autre']],
    mainprefix: [['mainprefix <préfixe>', 'Change le préfixe par défaut du bot, y compris en privé']],
    secur: [['secur invite <on/off>', 'Quitte les nouveaux serveurs où le propriétaire principal est absent']],
    helptype: [['helptype <button/select/hybrid>', 'Change le mode de navigation du help']],
    alias: [['alias <commande> [alias]', 'Crée un alias pour une commande']],
    helpalias: [['helpalias <on/off>', 'Affiche ou masque les alias dans le help']],
    lang: [['lang custom [on/off/fichier]', 'Active ou importe un dictionnaire de langue JSON']],
    get: [['get lang', 'Exporte les dictionnaires de langue du bot']],
    updatebot: [['updatebot', 'Installe les mises à jour du dépôt Git configuré']],
    autoupdate: [['autoupdate <on/off>', 'Active ou désactive les mises à jour horaires']],
    reset: [['reset server', 'Réinitialise les paramètres du serveur courant après confirmation']],
    resetall: [['resetall', 'Réinitialise les paramètres du bot après confirmation']]
};
const bool = value => { if (!['on', 'off'].includes(value)) throw new Error('Utilise on ou off.'); return value === 'on'; };
function http(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Indique un lien HTTP(S).');
    return url.href;
}
function profile(values) {
    const result = {};
    if (values.name) { if (values.name.length < 2 || values.name.length > 32) throw new Error('Le nom doit contenir entre 2 et 32 caractères.'); result.username = values.name; }
    for (const key of ['pic', 'banner']) if (values[key]) result[key === 'pic' ? 'avatar' : 'banner'] = values[key] === 'remove' ? null : http(values[key]);
    if (!Object.keys(result).length) throw new Error('Indique au moins une modification.');
    return result;
}
function guilds(client) { return [...client.guilds.cache.values()].sort((a, b) => a.id.localeCompare(b.id)); }
function targetGuild(message, value, client) {
    if (!value) return message.guild;
    return /^\d{1,6}$/.test(value) ? guilds(client)[Number(value) - 1] : client.guilds.cache.get(value);
}
function command(client, name) { return client.commands.get(name) || client.ownerCommands.get(name); }
async function targetUser(message, value, client) {
    if (!value) throw new Error('Indique une mention ou un ID utilisateur.');
    const id = g.id(value);
    if (!/^\d{15,22}$/.test(id)) throw new Error('Indique une mention ou un ID utilisateur valide.');
    return client.users.fetch(id);
}
function resetServer(id, client) {
    require('./serverConfigStore').reset(id);
    require('./antiraidStore').reset(id);
    require('./managementStore').reset(id);
    const prefixFile = path.join(__dirname, '../data/prefixes.json');
    if (fs.existsSync(prefixFile)) {
        const prefixes = JSON.parse(fs.readFileSync(prefixFile, 'utf8'));
        delete prefixes[id]; fs.writeFileSync(prefixFile, JSON.stringify(prefixes, null, 2));
    }
    const records = g.readSuggestions();
    for (const [key, record] of Object.entries(records)) if (record.guildId === id) delete records[key];
    g.writeSuggestions(records);
    for (const [channelId] of client.snipes || []) if (client.channels.cache.get(channelId)?.guildId === id) client.snipes.delete(channelId);
}
async function discussion(message, guild, client) {
    if (!message.guild) throw new Error('Ouvre la discussion depuis un salon de serveur.');
    const key = `${message.author.id}:${message.channel.id}`;
    if (!client.discussions) client.discussions = new Map();
    if (client.discussions.has(key)) throw new Error('Une discussion est déjà ouverte ici. Écris stop pour la fermer.');
    const channels = (await guild.channels.fetch()).filter(c => c?.isTextBased() && !c.isThread() && c.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]));
    if (!channels.size) throw new Error('Aucun salon accessible pour discuter.');
    client.discussions.set(key, true);
    try {
        await g.list(message, `Discussion • ${guild.name}`, [...channels.values()].map(c => `**${c.name}** • \`${c.id}\``));
        await message.reply('Envoie ici l’ID du salon cible dans les 60 secondes, ou stop pour annuler.');
        const selected = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id && (m.content === 'stop' || channels.has(m.content.trim())), max: 1, time: 60000 });
        const response = selected.first();
        if (!response || response.content === 'stop') return;
        if (!settings.isOwner(message.author.id)) return;
        const target = channels.get(response.content.trim());
        if (target.id === message.channel.id) throw new Error('Choisis un autre salon que celui de commande.');
        await message.reply(`Discussion ouverte vers **${guild.name} / ${target.name}** pour 5 minutes. Tes prochains messages seront envoyés par le bot. Écris stop pour terminer.`);
        const outgoing = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, time: 300000 });
        const incoming = target.createMessageCollector({ filter: m => !m.author.bot, time: 300000 });
        client.discussions.set(key, outgoing);
        outgoing.on('collect', async m => {
            try {
                if (m.content.toLowerCase() === 'stop' || !settings.isOwner(m.author.id)) { outgoing.stop(); return; }
                if (m.content) await target.send({ content: m.content.slice(0, 2000), allowedMentions: { parse: [] } });
            } catch (error) { await message.reply(`Envoi impossible : ${error.message}`).catch(() => {}); }
        });
        incoming.on('collect', m => {
            if (!settings.isOwner(message.author.id)) { outgoing.stop(); return; }
            message.channel.send({ embeds: [g.embed(`${guild.name} • ${m.author.tag}`, m.content || '[Message sans texte]')], allowedMentions: { parse: [] } }).catch(() => {});
        });
        outgoing.on('end', () => { incoming.stop(); client.discussions.delete(key); message.reply('Discussion terminée.').catch(() => {}); });
    } finally { if (client.discussions.get(key) === true) client.discussions.delete(key); }
}
async function execute(name, message, args, client) {
    if (!settings.isOwner(message.author.id)) throw new Error('Commande réservée aux owners.');
    const send = (title, text) => g.reply(message, g.embed(title, text));
    if (name === 'set') {
        const action = args.shift()?.toLowerCase();
        if (action === 'lang') {
            const language = args[0]?.toLowerCase();
            if (!['fr', 'en'].includes(language)) throw new Error('Langues disponibles : fr, en. Utilise lang custom pour ton dictionnaire.');
            settings.save({ language }); return send('Langue', `Langue enregistrée : ${language}.`);
        }
        if (action === 'profil') return ui.form(message, 'Profil du bot', [{ id: 'name', label: 'Nom (vide = conserver)', max: 32 }, { id: 'pic', label: 'Avatar : URL ou remove' }, { id: 'banner', label: 'Bannière : URL ou remove' }], values => client.user.edit(profile(values)));
        if (!['name', 'pic', 'banner'].includes(action)) throw new Error('Utilise set name, set pic, set banner, set profil ou set lang.');
        const value = args.join(' ') || (action !== 'name' ? message.attachments?.first()?.url : '');
        if (!value) return ui.form(message, `Modifier ${action}`, [{ id: action, label: action === 'name' ? 'Nouveau nom' : 'URL de l’image ou remove', required: true, max: action === 'name' ? 32 : 500 }], values => client.user.edit(profile(values)));
        await client.user.edit(profile({ [action]: value })); return send('Profil', 'Profil du bot modifié.');
    }
    if (name === 'theme') {
        const colors = { rouge: 'ED1515', red: 'ED1515', bleu: '3498DB', blue: '3498DB', vert: '2ECC71', green: '2ECC71', noir: '010101', black: '010101', blanc: 'FFFFFF', white: 'FFFFFF', violet: '9B59B6', purple: '9B59B6' };
        const color = colors[args[0]?.toLowerCase()] || args[0]?.replace(/^#|^0x/i, '');
        if (!/^[a-f0-9]{6}$/i.test(color || '')) throw new Error('Indique une couleur hexadécimale (#ED1515) ou rouge, bleu, vert, noir, blanc, violet.');
        settings.save({ theme: parseInt(color, 16) }); return send('Thème', `Couleur : #${color.toUpperCase()}`);
    }
    const activities = { playto: ActivityType.Playing, listen: ActivityType.Listening, watch: ActivityType.Watching, compet: ActivityType.Competing, stream: ActivityType.Streaming };
    if (Object.hasOwn(activities, name)) {
        let streamUrl = settings.read().activity?.url || g.config.streamUrl;
        if (name === 'stream' && /^https?:\/\//.test(args[0] || '')) streamUrl = http(args.shift());
        const text = args.join(' ');
        if (name === 'stream' && !streamUrl) return ui.form(message, 'Activité de stream', [{ id: 'url', label: 'Lien Twitch ou YouTube', required: true }, { id: 'text', label: 'Messages séparés par ,,', required: true }], values => {
            const url = new URL(http(values.url));
            if (!['twitch.tv', 'www.twitch.tv', 'youtube.com', 'www.youtube.com'].includes(url.hostname)) throw new Error('Utilise un lien Twitch ou YouTube.');
            streamUrl = url.href; return setActivity(values.text);
        });
        if (!text) return ui.form(message, 'Activité du bot', [{ id: 'text', label: 'Messages séparés par ,,', required: true }], values => setActivity(values.text));
        return setActivity(text);
        function setActivity(text) {
            const messages = text.split(',,').map(s => s.trim()).filter(Boolean);
            if (!messages.length || messages.length > 20 || messages.some(s => s.length > 128)) throw new Error('Maximum 20 activités de 128 caractères chacune.');
            if (name === 'stream' && !['twitch.tv', 'www.twitch.tv', 'youtube.com', 'www.youtube.com'].includes(new URL(streamUrl).hostname)) throw new Error('Utilise un lien Twitch ou YouTube.');
            settings.save({ activity: { type: activities[name], messages, ...(name === 'stream' ? { url: streamUrl } : {}) } });
            presence.apply(client); return send('Activité', `Activité modifiée • ${messages.length} phrase(s), rotation toutes les 15 secondes.`);
        }
    }
    if (name === 'remove') {
        if (args[0] !== 'activity') throw new Error('Utilise remove activity.');
        settings.save({ activity: null }); presence.apply(client); return send('Activité', 'Activité supprimée.');
    }
    if (['online', 'idle', 'dnd', 'invisible'].includes(name)) { settings.save({ status: name }); presence.apply(client); return send('Statut', `Statut : ${name}`); }
    if (name === 'mp') {
        if (args[0] === 'settings') {
            if (args[1]) { settings.save({ dmEnabled: bool(args[1]) }); return send('Messages privés', `Envois ${settings.read().dmEnabled ? 'activés' : 'désactivés'}.`); }
            return ui.confirm(message, `Messages privés actuellement ${settings.read().dmEnabled ? 'activés' : 'désactivés'}. Confirmer pour inverser ce réglage ?`, () => settings.save({ dmEnabled: !settings.read().dmEnabled }));
        }
        if (!settings.read().dmEnabled) throw new Error('Les messages privés sont désactivés. Utilise mp settings on.');
        const user = await targetUser(message, args.shift(), client), text = args.join(' ');
        if (!text || text.length > 2000) throw new Error('Indique un message de 1 à 2000 caractères.');
        await user.send({ content: text, allowedMentions: { parse: [] } }); return send('Message privé', `Message envoyé à ${user.tag}.`);
    }
    if (name === 'server') {
        if (args[0]?.toLowerCase() !== 'list') throw new Error('Utilise server list.');
        return g.list(message, 'Serveurs du bot', guilds(client).map((guild, index) => `**${index + 1}. ${guild.name}** • \`${guild.id}\` • ${guild.memberCount} membres`));
    }
    if (['invite', 'leave', 'discussion'].includes(name)) {
        const guild = targetGuild(message, args[0], client);
        if (!guild) throw new Error('Serveur introuvable. Consulte server list pour son ID ou numéro.');
        if (name === 'leave') return ui.confirm(message, `Faire quitter **${guild.name}** (ID ${guild.id}) au bot ?`, () => guild.leave());
        if (name === 'discussion') return discussion(message, guild, client);
        const channels = await guild.channels.fetch();
        const target = channels.find(c => c && !c.isThread() && c.isTextBased() && c.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite]));
        if (!target) throw new Error('Aucun salon accessible avec la permission de créer une invitation.');
        const invite = await target.createInvite({ maxAge: 3600, maxUses: 1, unique: true, reason: `Owner ${message.author.id}` });
        if (settings.read().dmEnabled) { await message.author.send({ content: `${guild.name} : ${invite.url}`, allowedMentions: { parse: [] } }); return send('Invitation', 'Invitation envoyée en privé (1 utilisation, 1 heure).'); }
        return send('Invitation', `${guild.name} : ${invite.url}`);
    }
    if (name === 'fivem') {
        if (args[0] === 'off') { settings.save({ fivem: null }); return send('FiveM', 'Connexion supprimée.'); }
        if (args[0]) settings.save({ fivem: fivem.parse(args[0]) });
        try { const result = await fivem.status(); return send('FiveM', `**${result.name.replace(/\^\d/g, '')}**\n**Joueurs :** ${result.players}/${result.max}\n[Rejoindre](${result.url})`); }
        catch (error) { return send('FiveM', `Adresse enregistrée : ${settings.read().fivem?.url || 'aucune'}\nÉtat indisponible : ${error.message}\nSi Cfx refuse l’accès, utilise fivem http://IP:30120.`); }
    }
    if (name === 'owner') {
        if (!args.length) return g.list(message, 'Owners du bot', settings.owners().map(id => `<@${id}> • \`${id}\`${id === settings.primaryOwner() ? ' • Principal' : ''}`));
        const user = await targetUser(message, args[0], client);
        if (user.bot || settings.blacklisted(user.id)) throw new Error('Un bot ou un utilisateur blacklisté ne peut pas devenir owner.');
        settings.save({ owners: [...new Set([...settings.owners(), user.id])] }); return send('Owners', `${user.tag} est maintenant owner du bot.`);
    }
    if (name === 'unowner') {
        const id = g.id(args[0]);
        if (!settings.owners().includes(id)) throw new Error('Cet utilisateur n’est pas owner.');
        if (id === settings.primaryOwner()) throw new Error('Le propriétaire principal ne peut pas être retiré.');
        settings.save({ owners: settings.owners().filter(owner => owner !== id) }); return send('Owners', 'Owner retiré.');
    }
    if (name === 'clear') {
        if (args[0] === 'owners') return ui.confirm(message, 'Retirer tous les owners secondaires ? Le propriétaire principal sera conservé pour garder l’accès au bot.', () => settings.save({ owners: [settings.primaryOwner()].filter(Boolean) }));
        if (args[0] === 'bl') return ui.confirm(message, 'Vider la blacklist ? Les bannissements déjà effectués resteront en place.', () => settings.save({ blacklist: {} }));
        throw new Error('Utilise clear owners ou clear bl.');
    }
    if (name === 'bl') {
        if (!args.length) return g.list(message, 'Blacklist', Object.entries(settings.read().blacklist).map(([id, entry]) => `<@${id}> • \`${id}\` • ${entry.reason}`));
        const user = await targetUser(message, args.shift(), client);
        if (settings.isOwner(user.id) || user.id === client.user.id) throw new Error('Tu ne peux pas blacklister un owner ou le bot.');
        const reason = args.join(' ').slice(0, 400) || 'Aucune raison donnée';
        settings.save({ blacklist: { ...settings.read().blacklist, [user.id]: { reason, authorId: message.author.id, date: Date.now() } } });
        const results = [];
        for (const guild of guilds(client)) {
            try { await guild.members.ban(user.id, { reason: `Blacklist : ${reason}` }); results.push(`✅ ${guild.name}`); }
            catch (error) { results.push(`❌ ${guild.name} : ${error.message.slice(0, 150)}`); }
        }
        return g.list(message, `Blacklist • ${user.tag}`, ['Utilisateur ajouté à la blacklist. Les nouveaux joins seront aussi bannis.', ...results]);
    }
    if (name === 'unbl') {
        const id = g.id(args[0]), blacklist = { ...settings.read().blacklist };
        if (!Object.hasOwn(blacklist, id)) throw new Error('Cet utilisateur n’est pas blacklisté.');
        delete blacklist[id]; settings.save({ blacklist }); return send('Blacklist', 'Utilisateur retiré. Ses bannissements existants restent en place.');
    }
    if (name === 'blinfo') {
        const id = g.id(args[0]), entry = settings.read().blacklist[id];
        if (!entry) throw new Error('Utilisateur absent de la blacklist.');
        return send('Informations blacklist', `**Utilisateur :** <@${id}> (${id})\n**Auteur :** <@${entry.authorId}>\n**Date :** ${g.date(entry.date)}\n**Raison :** ${entry.reason}`);
    }
    if (name === 'say') {
        const text = args.join(' ');
        if (!text || text.length > 2000) throw new Error('Indique un message de 1 à 2000 caractères.');
        return message.channel.send({ content: text, allowedMentions: { parse: [] } });
    }
    if (name === 'change') {
        if (args[0] === 'reset') { settings.save({ permissions: {} }); return send('Permissions', 'Permissions réinitialisées. Les commandes owner restent réservées aux owners.'); }
        const item = client.commands.get(args[0]?.toLowerCase());
        if (!item || item.ownerOnly || item.lockedPermission) throw new Error('Indique une commande générale modifiable. Les commandes owner et antiraid conservent leurs restrictions.');
        const permission = permissions.normalize(args[1] || '');
        settings.save({ permissions: { ...settings.read().permissions, [item.name]: permission } }); return send('Permissions', `${item.name} : ${permission}`);
    }
    if (name === 'changeall') {
        const from = permissions.normalize(args[0] || ''), to = permissions.normalize(args[1] || '');
        const rules = { ...settings.read().permissions }; let count = 0;
        for (const item of client.commands.values()) if (!item.ownerOnly && !item.lockedPermission && (rules[item.name] || item.defaultPermission || 'everyone') === from) { rules[item.name] = to; count++; }
        settings.save({ permissions: rules }); return send('Permissions', `${count} commande(s) transférée(s) de ${from} vers ${to}.`);
    }
    if (name === 'mainprefix') {
        const prefix = args[0];
        if (!prefix || prefix.length > 5 || /\s/.test(prefix)) throw new Error('Préfixe de 1 à 5 caractères, sans espace.');
        settings.save({ mainPrefix: prefix }); return send('Préfixe', `Préfixe par défaut : \`${prefix.replace(/`/g, 'ˋ')}\`. Les préfixes de serveur personnalisés restent prioritaires.`);
    }
    if (name === 'secur') {
        if (args[0] !== 'invite') throw new Error('Utilise secur invite on/off.');
        if (!settings.primaryOwner()) throw new Error('Configure au moins un owner dans config.json avant d’activer secur invite.');
        settings.save({ secureInvite: bool(args[1]) }); return send('Sécurité invitation', `Vérification du propriétaire principal ${settings.read().secureInvite ? 'activée' : 'désactivée'} pour les nouveaux serveurs.`);
    }
    if (name === 'helptype') {
        if (!['button', 'select', 'hybrid'].includes(args[0])) throw new Error('Modes disponibles : button, select, hybrid.');
        settings.save({ helpType: args[0] }); return send('Help', `Navigation : ${args[0]}`);
    }
    if (name === 'alias') {
        const target = args[0]?.toLowerCase();
        if (!command(client, target)) throw new Error('Commande introuvable.');
        const create = value => {
            const alias = value.toLowerCase();
            if (!/^[a-z0-9_-]{1,32}$/.test(alias) || command(client, alias)) throw new Error('Alias invalide ou déjà utilisé par une commande.');
            if (Object.hasOwn(settings.read().aliases, alias)) throw new Error('Cet alias existe déjà.');
            settings.save({ aliases: { ...settings.read().aliases, [alias]: target } });
        };
        if (!args[1]) return ui.form(message, `Alias de ${target}`, [{ id: 'alias', label: 'Nouvel alias', required: true, max: 32 }], values => create(values.alias));
        create(args[1]); return send('Alias', `${args[1]} → ${target}`);
    }
    if (name === 'helpalias') { settings.save({ helpAlias: bool(args[0]) }); return send('Alias du help', `Affichage ${settings.read().helpAlias ? 'activé' : 'désactivé'}.`); }
    if (name === 'lang') {
        if (args[0] !== 'custom') throw new Error('Utilise lang custom on/off ou joins un fichier JSON à lang custom fichier.');
        if (['on', 'off'].includes(args[1])) { settings.save({ customLanguageEnabled: bool(args[1]) }); return send('Langue personnalisée', `Dictionnaire ${settings.read().customLanguageEnabled ? 'activé' : 'désactivé'}.`); }
        const attachment = message.attachments?.first();
        if (!attachment) return send('Langue personnalisée', 'Joins un fichier JSON à lang custom fichier. Format : {"texte français": "traduction"}. get lang exporte les dictionnaires actuels.');
        if (attachment.size > 100000 || !attachment.name?.endsWith('.json')) throw new Error('Fichier JSON de 100 ko maximum.');
        const dictionary = await g.json(attachment.url);
        if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object' || Object.keys(dictionary).length > 1000 || Object.entries(dictionary).some(([key, value]) => !key || typeof value !== 'string' || value.length > 4000 || ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Dictionnaire invalide : objet JSON de chaînes de caractères.');
        settings.save({ customLanguage: dictionary, customLanguageEnabled: true }); return send('Langue personnalisée', 'Dictionnaire importé et activé.');
    }
    if (name === 'get') {
        if (args[0] !== 'lang') throw new Error('Utilise get lang.');
        const files = ['fr', 'en'].map(lang => new AttachmentBuilder(Buffer.from(JSON.stringify(require(`../data/lang/${lang}.json`), null, 2)), { name: `${lang}.json` }));
        files.push(new AttachmentBuilder(Buffer.from(JSON.stringify(settings.read().customLanguage, null, 2)), { name: 'custom.json' }));
        return message.reply({ files, allowedMentions: { parse: [] } });
    }
    if (name === 'updatebot') { await send('Mise à jour', 'Vérification du dépôt Git…'); return send('Mise à jour', await updater.update(client)); }
    if (name === 'autoupdate') { settings.save({ autoUpdate: bool(args[0]) }); updater.schedule(client); return send('Mise à jour automatique', `${settings.read().autoUpdate ? 'Activée (toutes les heures)' : 'Désactivée'}. Nécessite Git et une branche avec dépôt distant configuré.`); }
    if (name === 'reset') {
        if (args[0] !== 'server' || !message.guild) throw new Error('Utilise reset server dans un serveur.');
        return ui.confirm(message, `Réinitialiser le préfixe, les suggestions enregistrées et les snipes de **${message.guild.name}** ? Les messages Discord resteront en place.`, () => resetServer(message.guild.id, client));
    }
    if (name === 'resetall') return ui.confirm(message, 'Réinitialiser les réglages du bot, les owners secondaires, la blacklist, les permissions, les alias, les préfixes et les suggestions ? Le token et le propriétaire principal seront conservés.', () => {
        require('./antiraidStore').resetAll();
        const configuration = require('./serverConfigStore');
        for (const id of Object.keys(configuration.read().guilds)) configuration.reset(id);
        const management = require('./managementStore');
        for (const id of Object.keys(management.read())) management.reset(id);
        for (const session of client.discussions?.values() || []) if (session.stop) session.stop();
        settings.save({ ...settings.defaults(), owners: [settings.primaryOwner()].filter(Boolean) });
        fs.writeFileSync(path.join(__dirname, '../data/prefixes.json'), '{}');
        g.writeSuggestions({}); client.snipes?.clear(); presence.apply(client); updater.schedule(client);
    });
}
module.exports = name => ({ name, ownerOnly: true, category: 'owners', usage: definitions[name][0][0], description: definitions[name][0][1], helpEntries: definitions[name].map(([usage, description]) => ({ usage, description })),
    ...(name === 'server' ? { matches: args => args[0]?.toLowerCase() === 'list' } : {}),
    ...(name === 'secur' ? { matches: args => args[0]?.toLowerCase() === 'invite' } : {}),
    ...(name === 'clear' ? { matches: args => ['owners', 'bl'].includes(args[0]?.toLowerCase()) } : {}),
    ...(name === 'set' ? { matches: args => !['perm', 'modlogs', 'boostembed', 'muterole'].includes(args[0]?.toLowerCase()) } : {}),
    ...(name === 'leave' ? { matches: args => args[0]?.toLowerCase() !== 'settings' } : {}),
    execute: (message, args, client) => execute(name, message, args, client)
});
module.exports.names = Object.keys(definitions);
module.exports.profile = profile;
module.exports.targetGuild = targetGuild;

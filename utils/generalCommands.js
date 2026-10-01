const g = require('./general');
const calculate = require('./calculate');
const { parseEmoji } = require('discord.js');
const definitions = {
    changelogs: ['changelogs', 'Affiche les dernières notes de mise à jour'],
    allbots: ['allbots', 'Affiche la liste des bots présents sur le serveur'],
    alladmins: ['alladmins', 'Affiche la liste des membres (hors bots) ayant la permission administrateur'],
    botadmins: ['botadmins', 'Affiche la liste des bots ayant la permission administrateur'],
    boosters: ['boosters', 'Affiche la liste des membres boostant le serveur'],
    rolemembers: ['rolemembers <rôle>', 'Affiche la liste des membres ayant un rôle précis'],
    serverinfo: ['serverinfo', 'Affiche les informations relatives au serveur'],
    vocinfo: ['vocinfo', "Affiche les informations relatives à l'activité vocale du serveur"],
    role: ['role <rôle>', 'Affiche les informations relatives à un rôle'],
    channel: ['channel [salon]', 'Affiche les informations relatives à un salon'],
    user: ['user [membre]', 'Affiche les informations relatives à un utilisateur'],
    member: ['member [membre]', 'Affiche les informations relatives à un membre sur le serveur'],
    pic: ['pic [membre]', "Permet de récupérer la photo de profil de quelqu'un"],
    banner: ['banner [membre]', "Permet de récupérer la bannière de quelqu'un"],
    server: ['server <pic|banner>', "Permet de récupérer l'icône ou la bannière du serveur"],
    snipe: ['snipe', 'Affiche le dernier message supprimé du salon'],
    emoji: ['emoji <émoji>', "Permet de récupérer l'image d'un émoji"],
    image: ['image <mot-clé>', 'Fait une recherche Google Images avec le bot'],
    suggestion: ['suggestion <message>', 'Poste une suggestion sur le serveur'],
    lb: ['lb suggestions', 'Affiche les suggestions les mieux notées du serveur'],
    wiki: ['wiki <mot-clé>', 'Fait une recherche Wikipedia avec le bot'],
    search: ['search wiki <mot-clé>', 'Affiche les articles Wikipedia relatifs au mot-clé donné'],
    calc: ['calc <calcul>', 'Résout des calculs ou des équations linéaires en x'],
    crowbots: ['crowbots', 'Donne une invitation pour le serveur de support Protect']
};
async function execute(name, message, args, client) {
    const guild = message.guild;
    const send = (title, text) => g.reply(message, g.embed(title, text));
    const fail = text => send('❌ Commande', text);
    if (['allbots', 'alladmins', 'botadmins', 'boosters', 'rolemembers'].includes(name)) {
        const role = name === 'rolemembers' ? await g.role(message, args) : null;
        if (name === 'rolemembers' && !role) return fail('Indique un rôle valide (mention, ID ou nom exact unique).');
        const members = await guild.members.fetch();
        const selected = members.filter(m => name === 'allbots' ? m.user.bot : name === 'alladmins' ? !m.user.bot && m.permissions.has(g.PermissionFlagsBits.Administrator) : name === 'botadmins' ? m.user.bot && m.permissions.has(g.PermissionFlagsBits.Administrator) : name === 'boosters' ? Boolean(m.premiumSince) : m.roles.cache.has(role.id));
        return g.list(message, `${role ? role.name : name} • ${selected.size}`, [...selected.values()].map(m => `<@${m.id}> • ${m.user.tag} • \`${m.id}\``));
    }
    if (name === 'serverinfo') {
        return g.reply(message, g.embed(`Serveur • ${guild.name}`, `**ID :** ${guild.id}\n**Propriétaire :** <@${guild.ownerId}>\n**Création :** ${g.date(guild.createdAt)}\n**Membres :** ${guild.memberCount}\n**Salons :** ${guild.channels.cache.size}\n**Rôles :** ${guild.roles.cache.size}\n**Boosts :** ${guild.premiumSubscriptionCount || 0} • Niveau ${guild.premiumTier}\n**Vérification :** ${guild.verificationLevel}`).setThumbnail(guild.iconURL({ size: 256 })));
    }
    if (name === 'vocinfo') {
        const channels = guild.channels.cache.filter(c => [g.ChannelType.GuildVoice, g.ChannelType.GuildStageVoice].includes(c.type));
        const active = channels.filter(c => c.members.size > 0);
        const states = guild.voiceStates.cache.filter(s => s.channelId);
        return g.list(message, '🔊 Activité vocale', [
            `**Salons vocaux :** ${channels.size} • **Actifs :** ${active.size}`,
            `**Connectés :** ${states.size} • **Micro coupé :** ${states.filter(s => s.mute).size} • **Sourdine :** ${states.filter(s => s.deaf).size}`,
            ...[...active.values()].map(c => `<#${c.id}> • ${c.members.size} membre(s) • ${c.bitrate / 1000} kbps`)
        ]);
    }
    if (name === 'role') {
        const role = await g.role(message, args);
        if (!role) return fail('Indique un rôle valide (mention, ID ou nom exact unique).');
        const members = await guild.members.fetch();
        return g.reply(message, g.embed(`Rôle • ${role.name}`, `**ID :** ${role.id}\n**Couleur :** ${role.hexColor}\n**Position :** ${role.position}\n**Membres :** ${members.filter(m => m.roles.cache.has(role.id)).size}\n**Création :** ${g.date(role.createdAt)}\n**Mentionnable :** ${role.mentionable ? 'Oui' : 'Non'}\n**Géré par une intégration :** ${role.managed ? 'Oui' : 'Non'}\n**Permissions :** ${role.permissions.toArray().join(', ') || 'Aucune'}`));
    }
    if (name === 'channel') {
        let channel = message.channel;
        if (args.length) {
            const query = args.join(' ');
            const channels = await guild.channels.fetch();
            const matches = channels.filter(c => c && (c.id === g.id(query) || c.name.toLowerCase() === query.toLowerCase()));
            channel = matches.size === 1 ? matches.first() : null;
        }
        if (!channel || !channel.permissionsFor(message.member)?.has(g.PermissionFlagsBits.ViewChannel)) return fail('Salon introuvable ou inaccessible.');
        return send(`Salon • ${channel.name}`, `**ID :** ${channel.id}\n**Type :** ${g.ChannelType[channel.type]}\n**Catégorie :** ${channel.parent?.name || 'Aucune'}\n**Création :** ${g.date(channel.createdAt)}\n**Sujet :** ${channel.topic || 'Aucun'}\n**NSFW :** ${channel.nsfw ? 'Oui' : 'Non'}${channel.bitrate ? `\n**Débit :** ${channel.bitrate / 1000} kbps` : ''}`);
    }
    if (name === 'member') {
        const member = await g.member(message, args);
        if (!member) return fail('Membre introuvable. Utilise une mention, un ID ou un nom exact unique.');
        const roles = [...member.roles.cache.values()].filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => `<@&${r.id}>`).join(', ');
        return g.reply(message, g.embed(`Membre • ${member.displayName}`, `**Utilisateur :** ${member.user.tag}\n**ID :** ${member.id}\n**Arrivée :** ${g.date(member.joinedAt)}\n**Boost depuis :** ${g.date(member.premiumSince)}\n**Administrateur :** ${member.permissions.has(g.PermissionFlagsBits.Administrator) ? 'Oui' : 'Non'}\n**Rôles :** ${roles.slice(0, 2000) || 'Aucun'}`).setThumbnail(member.displayAvatarURL({ size: 256 })));
    }
    if (['user', 'pic', 'banner'].includes(name)) {
        let user = await g.user(message, args, client);
        if (!user) return fail('Utilisateur introuvable.');
        if (name === 'user') return g.reply(message, g.embed(`Utilisateur • ${user.tag}`, `**ID :** ${user.id}\n**Bot :** ${user.bot ? 'Oui' : 'Non'}\n**Compte créé :** ${g.date(user.createdAt)}`).setThumbnail(user.displayAvatarURL({ size: 256 })));
        if (name === 'banner') user = await user.fetch(true);
        const url = name === 'pic' ? user.displayAvatarURL({ size: 4096 }) : user.bannerURL({ size: 4096 });
        if (!url) return fail('Cet utilisateur ne possède pas de bannière.');
        return g.reply(message, g.embed(`${name === 'pic' ? 'Avatar' : 'Bannière'} • ${user.username}`, `[Ouvrir l’image](${url})`).setImage(url));
    }
    if (name === 'server') {
        const action = args[0]?.toLowerCase();
        if (!['pic', 'banner'].includes(action)) return fail('Utilise server pic ou server banner.');
        const url = action === 'pic' ? guild.iconURL({ size: 4096 }) : guild.bannerURL({ size: 4096 });
        return url ? g.reply(message, g.embed(guild.name, `[Ouvrir l’image](${url})`).setImage(url)) : fail(`Ce serveur ne possède pas ${action === 'pic' ? "d’icône" : 'de bannière'}.`);
    }
    if (name === 'snipe') {
        const record = client.snipes?.get(message.channel.id);
        if (!record || Date.now() - record.deletedAt > 3600000) return fail('Aucun message supprimé récent enregistré dans ce salon.');
        return g.reply(message, g.embed('🗑 Dernier message supprimé', record.content || '*Message sans texte*').addFields({ name: 'Auteur', value: record.author }, { name: 'Supprimé', value: g.date(record.deletedAt) }));
    }
    if (name === 'emoji') {
        const raw = args[0];
        if (!raw) return fail('Indique un émoji.');
        const parsed = parseEmoji(raw);
        let url;
        if (parsed?.id) url = `https://cdn.discordapp.com/emojis/${parsed.id}.${parsed.animated ? 'gif' : 'png'}?size=4096`;
        else if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(raw)) {
            const codes = [...raw].filter(c => c !== '\ufe0f').map(c => c.codePointAt(0).toString(16)).join('-');
            url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${codes}.png`;
        }
        if (!url) return fail('Émoji invalide. Utilise un émoji Unicode ou un émoji personnalisé Discord.');
        return g.reply(message, g.embed('Émoji', `[Ouvrir l’image](${url})`).setImage(url));
    }
    if (name === 'calc') {
        try { return send('🧮 Calcul', `\`${args.join(' ').replace(/`/g, 'ˋ').slice(0, 300)}\`\n\n**Résultat :** ${calculate(args.join(' '))}`); }
        catch (error) { return fail(error.message); }
    }
    if (name === 'crowbots') return send('Protect • Support', g.config.supportInvite || 'https://discord.gg/KX5bGypTVh');
    if (name === 'changelogs') {
        const notes = require('../data/changelogs.json');
        return g.list(message, '📋 Notes de mise à jour', notes.map(note => `**${note.version} • ${note.date}**\n${note.changes.map(change => `• ${change}`).join('\n')}`));
    }
    if (name === 'image') {
        const query = args.join(' ');
        if (!query) return fail('Indique un mot-clé.');
        const link = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
        const key = process.env.GOOGLE_API_KEY || g.config.googleApiKey, cx = process.env.GOOGLE_SEARCH_ENGINE_ID || g.config.googleSearchEngineId;
        if (!key || !cx) return send('🔎 Google Images', `[Voir les images pour « ${query.replace(/[\[\]]/g, '').slice(0, 200)} »](${link})\n\nL’affichage des résultats dans Discord nécessite une clé Google et un moteur de recherche configurés.`);
        try {
            const params = new URLSearchParams({ key, cx, q: query, searchType: 'image', safe: 'active', num: '1' });
            const result = await g.json(`https://customsearch.googleapis.com/customsearch/v1?${params}`);
            const item = result.items?.[0];
            return item ? g.reply(message, g.embed('🔎 Google Images', `[${String(item.title).replace(/[\[\]]/g, '').slice(0, 200)}](${item.image.contextLink})`).setImage(item.link)) : fail('Aucune image trouvée.');
        } catch { return fail(`Recherche indisponible. [Ouvrir Google Images](${link})`); }
    }
    if (name === 'wiki' || name === 'search') {
        if (name === 'search' && args.shift()?.toLowerCase() !== 'wiki') return fail('Utilise search wiki <mot-clé>.');
        const query = args.join(' ');
        if (!query) return fail('Indique un mot-clé.');
        try {
            const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '20', format: 'json', utf8: '1' });
            const results = (await g.json(`https://fr.wikipedia.org/w/api.php?${params}`)).query?.search || [];
            if (!results.length) return fail('Aucun article trouvé.');
            const link = item => `https://fr.wikipedia.org/?curid=${item.pageid}`;
            if (name === 'search') return g.list(message, '📚 Résultats Wikipedia', [...results.map(item => `[${item.title.replace(/[\[\]]/g, '')}](${link(item)})`), `[Voir tous les résultats](https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}&title=Sp%C3%A9cial:Recherche)`]);
            const item = results[0];
            const extractParams = new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', exintro: '1', pageids: String(item.pageid), format: 'json' });
            const extract = (await g.json(`https://fr.wikipedia.org/w/api.php?${extractParams}`)).query?.pages?.[item.pageid]?.extract;
            return send(`📚 ${item.title}`, `${String(extract || 'Résumé indisponible.').slice(0, 3200)}\n\n[Lire l’article](${link(item)})`);
        } catch { return fail('Wikipedia est momentanément indisponible. Réessaie plus tard.'); }
    }
    if (name === 'suggestion') {
        const text = args.join(' ');
        if (!text || text.length > 2000) return fail('Indique une suggestion de 1 à 2000 caractères.');
        const suggestionSettings = require('./serverConfigStore').get(guild.id).suggestions;
        if (!suggestionSettings.enabled) throw new Error('Les suggestions sont désactivées sur ce serveur.');
        const suggestionChannelId = suggestionSettings.channelId || g.config.suggestionChannelId;
        const channel = suggestionChannelId ? await guild.channels.fetch(suggestionChannelId).catch(() => null) : message.channel;
        if (!channel?.isTextBased() || !channel.permissionsFor(message.member)?.has(g.PermissionFlagsBits.ViewChannel)) return fail('Salon de suggestions introuvable ou inaccessible.');
        const data = g.readSuggestions();
        if (Object.values(data).some(r => r.guildId === guild.id && r.authorId === message.author.id && Date.now() - r.createdAt < 60000)) return fail('Attends une minute entre deux suggestions.');
        const record = { guildId: guild.id, channelId: channel.id, authorId: message.author.id, text, createdAt: Date.now(), votes: {} };
        const row = new g.ActionRowBuilder().addComponents(new g.ButtonBuilder().setCustomId('suggestion:up').setLabel('👍 Pour').setStyle(g.ButtonStyle.Success), new g.ButtonBuilder().setCustomId('suggestion:down').setLabel('👎 Contre').setStyle(g.ButtonStyle.Danger));
        const sent = await channel.send({ embeds: [g.suggestionEmbed(record)], components: [row], allowedMentions: { parse: [] } });
        try {
            const latest = g.readSuggestions();
            latest[sent.id] = record;
            g.writeSuggestions(latest);
        } catch (error) { await sent.delete().catch(() => {}); throw error; }
        if (channel.id !== message.channel.id) return send('💡 Suggestion publiée', `[Voir la suggestion](${sent.url})`);
        return;
    }
    if (name === 'lb') {
        if (args[0]?.toLowerCase() !== 'suggestions') return fail('Utilise lb suggestions.');
        const score = record => Object.values(record.votes).reduce((sum, vote) => sum + vote, 0);
        const records = Object.entries(g.readSuggestions()).filter(([, r]) => r.guildId === guild.id && guild.channels.cache.get(r.channelId)?.permissionsFor(message.member)?.has(g.PermissionFlagsBits.ViewChannel)).sort(([, a], [, b]) => score(b) - score(a));
        return g.list(message, '🏆 Classement des suggestions', records.map(([id, record], index) => `**${index + 1}. Score ${score(record)}** • [Suggestion](https://discord.com/channels/${guild.id}/${record.channelId}/${id})\n${record.text.slice(0, 300)}`));
    }
}
module.exports = name => ({ name, usage: definitions[name][0], description: definitions[name][1],
    ...(name === 'server' ? { helpEntries: [{ usage: 'server pic', description: "Permet de récupérer l’icône du serveur" }, { usage: 'server banner', description: 'Permet de récupérer la bannière du serveur' }] } : {}),
    execute: (message, args, client) => execute(name, message, args, client)
});
module.exports.names = Object.keys(definitions);


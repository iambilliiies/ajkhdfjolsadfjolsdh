const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionFlagsBits: P, ComponentType } = require('discord.js');
const { randomUUID } = require('node:crypto');
const g = require('./general');
const tools = require('./managementTools');
const store = require('./managementStore');
const ui = require('./ownerUI');
const backups = require('./backups');
const giveaways = require('./giveaways');
const { duration } = require('./antiraidStore');
const definitions = {
    giveaway: [['giveaway', 'Ouvre un menu interactif pour créer un giveaway']],
    end: [['end giveaway <ID>', 'Termine instantanément un giveaway à partir de l’ID de son message']],
    reroll: [['reroll', 'Rejoue le dernier giveaway terminé du serveur']],
    choose: [['choose', 'Tire au sort parmi les membres ayant réagi à un message']],
    embed: [['embed', 'Ouvre un générateur d’embed interactif']],
    backup: [['backup <serveur/emoji> <nom>', 'Crée une backup du serveur ou de ses émojis'], ['backup list <serveur/emoji>', 'Affiche les backups enregistrées'], ['backup delete <serveur/emoji> <nom>', 'Supprime une backup après confirmation'], ['backup load <serveur/emoji> <nom>', 'Charge une backup après confirmation']],
    autobackup: [['autobackup <serveur/emoji> <jours>', 'Configure les backups automatiques ; 0 les désactive']],
    loading: [['loading <durée> <message>', 'Affiche une barre de chargement avec le message voulu']],
    create: [['create [émoji] [nom]', 'Crée un émoji à partir d’une image ou d’un émoji Discord']],
    newsticker: [['newsticker [nom]', 'Crée un sticker à partir d’un sticker envoyé ou cité']],
    massiverole: [['massiverole [rôle] [rôle]', 'Ajoute un rôle à tous les membres ou aux membres d’un rôle source']],
    unmassiverole: [['unmassiverole [rôle] [rôle]', 'Retire un rôle de tous les membres ou des membres d’un rôle source']],
    voicemove: [['voicemove [salon] [salon]', 'Déplace tous les membres d’un salon vocal vers un autre']],
    voicekick: [['voicekick <membre>', 'Déconnecte un ou plusieurs membres de leur vocal']],
    cleanup: [['cleanup <salon>', 'Déconnecte tous les membres d’un salon vocal']],
    bringall: [['bringall [salon]', 'Déplace tous les membres connectés vers un salon vocal']],
    renew: [['renew [salon]', 'Supprime et recrée un salon textuel après confirmation']],
    unbanall: [['unbanall', 'Retire tous les bannissements du serveur après confirmation']],
    temprole: [['temprole <membre> <rôle> <durée>', 'Ajoute un rôle à un membre pour une durée donnée']],
    untemprole: [['untemprole <membre> <rôle>', 'Retire un rôle temporaire d’un membre']],
    sync: [['sync <salon/catégorie/all>', 'Synchronise les permissions avec les catégories parentes']],
    openmodmail: [['openmodmail <membre>', 'Ouvre un ticket sans envoyer de notification au membre']],
    button: [['button <add/del> <lien>', 'Ajoute ou retire un bouton lien sur un message du bot']],
    autoreact: [['autoreact <add/del> <salon> <émoji>', 'Ajoute ou retire une réaction automatique dans un salon'], ['autoreact list', 'Affiche les réactions automatiques du serveur']],
    formulaire: [['formulaire [ID]', 'Crée ou modifie un formulaire avec réponses dans un salon de logs']]
};
async function execute(name, message, args, client) {
    tools.guard(message);
    const guild = message.guild, authorize = tools.authorize(message);
    const send = text => g.reply(message, g.embed('Gestion du serveur', text));
    const form = (title, fields, action) => ui.form(message, title, fields, action, authorize);
    const confirm = (text, action) => ui.confirm(message, text, action, authorize);
    if (name === 'giveaway') return form('Créer un giveaway', [
        { id: 'prize', label: 'Lot à gagner', required: true, max: 150 }, { id: 'duration', label: 'Durée (ex. 1h)', required: true }, { id: 'winners', label: 'Nombre de gagnants', required: true, max: 2 }, { id: 'channel', label: 'Salon : ID/nom (vide = ici)' }
    ], async values => {
        const time = duration(values.duration), winners = Number(values.winners);
        if (time < 10000 || !Number.isInteger(winners) || winners < 1 || winners > 50) throw new Error('Durée minimale 10s et 1 à 50 gagnants.');
        const target = await tools.channel(message, values.channel);
        if (!target.isTextBased()) throw new Error('Choisis un salon textuel.');
        await giveaways.create(target, { prize: values.prize, duration: time, winnerCount: winners, hostId: message.author.id });
    });
    if (name === 'end') {
        if (args[0] !== 'giveaway' || !args[1]) throw new Error('Utilise end giveaway <ID du message>.');
        await giveaways.finish(guild, args[1]); return send('Giveaway terminé.');
    }
    if (name === 'reroll') {
        const id = store.get(guild.id).lastGiveaway;
        if (!id) throw new Error('Aucun giveaway terminé.');
        await giveaways.finish(guild, id, true); return send('Nouveau tirage effectué.');
    }
    if (name === 'choose') {
        const target = await tools.messageByReference(message, args[0]);
        const candidates = [];
        for (const reaction of target.reactions.cache.values()) {
            let after;
            while (true) {
                const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) });
                candidates.push(...[...users.values()].filter(u => !u.bot).map(u => u.id));
                if (users.size < 100) break;
                const next = users.lastKey(); if (next === after) break; after = next;
            }
        }
        const winners = giveaways.draw(candidates.filter(id => !require('./settings').blacklisted(id)), 1);
        return send(winners.length ? `🎉 Gagnant : <@${winners[0]}>\n[Message du tirage](${target.url})` : 'Aucun participant humain ayant réagi à ce message. Réponds au message du tirage avec choose.');
    }
    if (name === 'embed') return form('Générateur d’embed', [
        { id: 'title', label: 'Titre', max: 256 }, { id: 'description', label: 'Description', required: true, max: 3500, paragraph: true }, { id: 'color', label: 'Couleur #HEX (vide = thème)' }, { id: 'image', label: 'Image : URL (facultatif)' }, { id: 'channel', label: 'Salon : ID/nom (vide = ici)' }
    ], async values => {
        const embed = g.embed(values.title || 'Protect', values.description);
        if (values.color) { if (!/^#[a-f0-9]{6}$/i.test(values.color)) throw new Error('Couleur invalide. Exemple : #ED1515.'); embed.setColor(parseInt(values.color.slice(1), 16)); }
        if (values.image) embed.setImage(tools.url(values.image));
        const channel = await tools.channel(message, values.channel);
        if (!channel.isTextBased()) throw new Error('Salon non textuel.');
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    });
    if (name === 'backup') {
        const action = args[0]?.toLowerCase();
        if (action === 'list') {
            const kind = backups.type(args[1]);
            return g.list(message, `Backups • ${kind}`, Object.entries(store.get(guild.id).backups[kind]).map(([name, backup]) => `**${name}** • ${g.date(backup.createdAt)}`));
        }
        if (['delete', 'load'].includes(action)) {
            const kind = backups.type(args[1]), backupName = backups.name(args.slice(2).join(' '));
            const records = store.get(guild.id).backups[kind];
            if (!Object.hasOwn(records, backupName)) throw new Error('Backup introuvable.');
            if (action === 'delete') return confirm(`Supprimer la backup **${backupName}** ?`, () => store.mutate(guild.id, state => { delete state.backups[kind][backupName]; }));
            return confirm(`Charger **${backupName}** ? Les rôles/salons ou émojis seront recréés avec de nouveaux IDs, sans supprimer les ressources existantes.`, async () => {
                await g.list(message, 'Chargement backup', await backups.restore(guild, records[backupName]));
            });
        }
        const kind = backups.type(action), backupName = backups.name(args.slice(1).join(' '));
        await send('Création de la backup…'); await backups.create(guild, kind, backupName); return send(`Backup **${backupName}** créée.`);
    }
    if (name === 'autobackup') {
        const kind = backups.type(args[0]), days = Number(args[1]);
        if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error('Indique un intervalle de 1 à 365 jours, ou 0 pour désactiver.');
        store.mutate(guild.id, state => { if (!days) delete state.autoBackups[kind]; else state.autoBackups[kind] = { days, nextAt: Date.now() + days * 86400000 }; });
        return send(days ? `Backup ${kind} automatique tous les ${days} jour(s), enregistrée sous automatique.` : 'Backup automatique désactivée.');
    }
    if (name === 'loading') {
        const time = duration(args.shift()), text = args.join(' ');
        if (time < 1000 || time > 3600000 || !text) throw new Error('Durée entre 1s et 1h et message obligatoires.');
        const start = Date.now();
        const render = () => { const percent = Math.min(100, Math.floor((Date.now() - start) / time * 100)), filled = Math.floor(percent / 10); return g.embed('Chargement', `${text.slice(0, 3000)}\n\n${'█'.repeat(filled)}${'░'.repeat(10 - filled)} **${percent}%**`); };
        const sent = await message.reply({ embeds: [render()], allowedMentions: { parse: [] } });
        const interval = Math.max(1500, Math.ceil(time / 10));
        const update = async () => { try { await sent.edit({ embeds: [render()] }); if (Date.now() - start < time) setTimeout(update, Math.min(interval, time - (Date.now() - start))).unref(); } catch (error) { console.error('Loading :', error.message); } };
        setTimeout(update, Math.min(interval, time)).unref(); return;
    }
    if (name === 'create') {
        const attachment = message.attachments.first();
        let source = null;
        if (args[0]) {
            try { source = tools.emoji(args[0]); }
            catch (error) { if (!attachment) throw error; }
        }
        if (!attachment && !source) throw new Error('Joins une image ou indique un émoji Discord.');
        const emojiName = args[1] || (attachment && !source ? args[0] : source?.name) || 'emoji';
        if (!/^\w{2,32}$/.test(emojiName)) throw new Error('Nom d’émoji : 2 à 32 lettres ASCII, chiffres ou underscores.');
        const image = await tools.imageBuffer(attachment?.url || source.url, 256 * 1024);
        const created = await guild.emojis.create({ attachment: image.buffer, name: emojiName, reason: `Commande create par ${message.author.id}` }); return send(`Émoji créé : ${created}`);
    }
    if (name === 'newsticker') {
        const sourceMessage = message.stickers.size ? message : message.reference ? await message.fetchReference() : null;
        const sticker = sourceMessage?.stickers.first();
        if (!sticker) throw new Error('Envoie un sticker avec la commande, ou réponds à un sticker.');
        if (sticker.format === 3) throw new Error('Les stickers Lottie ne sont pas pris en charge. Utilise un sticker PNG/APNG/GIF.');
        const stickerName = args.join(' ') || sticker.name;
        if (stickerName.length < 2 || stickerName.length > 30) throw new Error('Nom de sticker : 2 à 30 caractères.');
        const image = await tools.imageBuffer(sticker.url, 512 * 1024);
        const created = await guild.stickers.create({ file: image.buffer, name: stickerName, tags: '🙂', description: 'Sticker ajouté avec Protect', reason: `Commande newsticker par ${message.author.id}` }); return send(`Sticker créé : **${created.name}**.`);
    }
    if (name === 'massiverole' || name === 'unmassiverole') {
        if (!args.length) return form('Gestion des rôles en masse', [{ id: 'target', label: 'Rôle à ajouter/retirer : nom ou ID', required: true }, { id: 'source', label: 'Rôle source : vide = tous les membres' }], values => execute(name, message, [values.target + (values.source ? `,,${values.source}` : '')], client));
        const queries = tools.parts(args);
        if (queries.length > 2) throw new Error('Maximum deux rôles : cible puis source, séparés par ,, ou mentions.');
        const target = await tools.role(message, queries[0]);
        const source = queries[1] ? await g.role(message, [queries[1]]) : null;
        if (queries[1] && !source) throw new Error('Rôle source introuvable.');
        return confirm(`${name === 'massiverole' ? 'Ajouter' : 'Retirer'} **${target.name}** ${source ? `aux membres de ${source.name}` : 'à tous les membres'} ?`, async () => {
            const members = await guild.members.fetch(), errors = []; let changed = 0;
            for (const member of members.values()) {
                if (source && !member.roles.cache.has(source.id)) continue;
                const present = member.roles.cache.has(target.id);
                if (name === 'massiverole' ? present : !present) continue;
                try { await member.roles[name === 'massiverole' ? 'add' : 'remove'](target.id, name); changed++; }
                catch (error) { errors.push(`${member.user.tag} : ${error.message}`); }
            }
            await g.list(message, 'Gestion des rôles', [`${changed} membre(s) modifié(s).`, ...errors]);
        });
    }
    if (['voicemove', 'voicekick', 'cleanup', 'bringall'].includes(name)) {
        let members, target;
        if (name === 'voicekick') {
            members = [];
            for (const query of tools.parts(args)) { const member = await g.member(message, [query]); if (!member) throw new Error(`Membre introuvable : ${query}`); if (member.voice.channelId) members.push(member); }
        } else if (name === 'cleanup') members = [...(await tools.channel(message, args.join(' '), true)).members.values()];
        else if (name === 'bringall') {
            target = await tools.channel(message, args.join(' '), true);
            const channels = await guild.channels.fetch();
            members = [...new Map([...channels.values()].filter(c => c?.isVoiceBased()).flatMap(c => [...c.members.values()]).map(m => [m.id, m])).values()];
        } else {
            const queries = args.length ? tools.parts(args) : [];
            if (queries.length < 2) {
                if (!queries.length) return form('Déplacer le vocal', [{ id: 'source', label: 'Salon de départ : nom ou ID', required: true }, { id: 'target', label: 'Salon d’arrivée : nom ou ID', required: true }], values => execute(name, message, [`${values.source},,${values.target}`], client));
                if (!message.member.voice.channel) throw new Error('Rejoins le salon de départ ou indique départ,,arrivée.');
                members = [...message.member.voice.channel.members.values()]; target = await tools.channel(message, queries[0], true);
            } else { if (queries.length !== 2) throw new Error('Deux salons maximum.'); members = [...(await tools.channel(message, queries[0], true)).members.values()]; target = await tools.channel(message, queries[1], true); }
        }
        return confirm(`${target ? `Déplacer vers ${target.name}` : 'Déconnecter'} ${members.length} membre(s) ?`, async () => {
            const errors = []; let changed = 0;
            for (const member of members) {
                try { if (target && member.voice.channelId === target.id) continue; await member.voice.setChannel(target?.id || null, name); changed++; }
                catch (error) { errors.push(`${member.user.tag} : ${error.message}`); }
            }
            await g.list(message, 'Gestion vocale', [`${changed} membre(s) modifié(s).`, ...errors]);
        });
    }
    if (name === 'renew') {
        const channel = await tools.channel(message, args.join(' '));
        if (channel.type !== ChannelType.GuildText) throw new Error('Renew nécessite un salon textuel classique.');
        return confirm(`Supprimer et recréer **${channel.name}** ? Tous les messages seront perdus et l’ID changera.`, async () => {
            const clone = await channel.clone({ reason: `Renew par ${message.author.id}` });
            try { await channel.delete('Renew'); } catch (error) { await clone.delete('Annulation renew').catch(() => {}); throw error; }
            // Les réglages liés à l’ancien salon doivent être reconfigurés.
            await clone.send({ embeds: [g.embed('Salon renouvelé', `Ancien ID : ${channel.id}\nNouveau ID : ${clone.id}`)] });
        });
    }
    if (name === 'unbanall') return confirm('Retirer tous les bannissements de ce serveur ?', async () => {
        let after, removed = 0; const errors = [];
        while (true) {
            const bans = await guild.bans.fetch({ limit: 1000, ...(after ? { after } : {}) });
            for (const ban of bans.values()) { try { await guild.members.unban(ban.user.id, `Unbanall par ${message.author.id}`); removed++; } catch (error) { errors.push(`${ban.user.id} : ${error.message}`); } }
            if (bans.size < 1000) break;
            const next = bans.lastKey(); if (next === after) break; after = next;
        }
        await g.list(message, 'Débannissements', [`${removed} utilisateur(s) débanni(s). La blacklist du bot reste inchangée.`, ...errors]);
    });
    if (name === 'temprole' || name === 'untemprole') {
        const queries = tools.parts(args);
        // Les mentions/IDs sans espaces acceptent aussi la syntaxe classique.
        const values = queries.length === 1 && args.length >= 2 ? args : queries;
        const expected = name === 'temprole' ? 3 : 2;
        if (values.length !== expected) throw new Error(`Utilise ${name} membre,,rôle${name === 'temprole' ? ',,durée' : ''}, ou des mentions.`);
        const member = await g.member(message, [values[0]]), role = await tools.role(message, values[1]);
        if (!member) throw new Error('Membre introuvable.');
        const key = `${member.id}:${role.id}`, current = store.get(guild.id).tempRoles[key];
        if (name === 'untemprole') {
            if (!current) throw new Error('Ce rôle n’est pas enregistré comme temporaire.');
            await member.roles.remove(role.id, 'Suppression rôle temporaire'); store.mutate(guild.id, state => { delete state.tempRoles[key]; }); return send('Rôle temporaire retiré.');
        }
        const time = duration(values[2]); if (time < 1000) throw new Error('Durée minimale : 1s.');
        if (member.roles.cache.has(role.id) && !current) throw new Error('Le membre possède déjà ce rôle permanent.');
        await member.roles.add(role.id, 'Ajout rôle temporaire');
        try { store.mutate(guild.id, state => { state.tempRoles[key] = { userId: member.id, roleId: role.id, expiresAt: Date.now() + time }; }); }
        catch (error) { if (!current) await member.roles.remove(role.id, 'Annulation rôle temporaire').catch(() => {}); throw error; }
        return send(`Rôle ${role.name} ajouté à <@${member.id}> jusqu’à ${g.date(Date.now() + time)}.`);
    }
    if (name === 'sync') {
        if (!args.length) throw new Error('Utilise sync <salon/catégorie/all>.');
        const channels = await guild.channels.fetch();
        const selected = args[0] === 'all' ? null : await tools.channel(message, args.join(' '));
        const targets = [...channels.values()].filter(c => c && c.parentId && typeof c.lockPermissions === 'function' && (!selected || c.id === selected.id || c.parentId === selected.id));
        return confirm(`Synchroniser ${targets.length} salon(s) avec leur catégorie ?`, async () => {
            const errors = []; let synced = 0;
            for (const channel of targets) { try { await channel.lockPermissions(); synced++; } catch (error) { errors.push(`${channel.name} : ${error.message}`); } }
            await g.list(message, 'Permissions synchronisées', [`${synced} salon(s).`, ...errors]);
        });
    }
    if (name === 'openmodmail') {
        const mail = require('./serverConfigStore').read();
        const mailSettings = require('./serverConfigStore').get(guild.id).modmail;
        if (mailSettings.categoryId && !mailSettings.enabled) throw new Error('Le modmail est désactivé sur ce serveur.');
        if (mail.modmailGuildId && mail.modmailGuildId !== guild.id) throw new Error('Le modmail est configuré sur un autre serveur.');
        if (!args.length) throw new Error('Utilise openmodmail <membre>.');
        const member = await g.member(message, args);
        if (!member || member.user.bot) throw new Error('Membre humain introuvable.');
        const current = store.get(guild.id).tickets[member.id];
        if (current && !current.closed && await guild.channels.fetch(current.channelId).catch(() => null)) return send(`Un ticket existe déjà : <#${current.channelId}>.`);
        const channel = await guild.channels.create({ name: `modmail-${member.id}`, type: ChannelType.GuildText, parent: require('./serverConfigStore').get(guild.id).modmail.categoryId, permissionOverwrites: [{ id: guild.id, deny: [P.ViewChannel] }, { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks] }], reason: `Modmail par ${message.author.id}` });
        try {
            store.mutate(guild.id, state => { state.tickets[member.id] = { userId: member.id, channelId: channel.id, closed: false }; });
            await channel.send({ embeds: [g.embed('Modmail ouvert', `Membre : <@${member.id}>\nAucune notification envoyée. Les messages des administrateurs dans ce ticket seront relayés en MP au membre.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mg:modmail-close').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger))], allowedMentions: { parse: [] } });
        } catch (error) { await channel.delete('Annulation modmail').catch(() => {}); store.mutate(guild.id, state => { delete state.tickets[member.id]; }); throw error; }
        return send(`Ticket ouvert : <#${channel.id}>. Aucun MP envoyé au membre.`);
    }
    if (name === 'button') {
        const action = args[0]?.toLowerCase();
        if (!['add', 'del'].includes(action) || !args[1]) throw new Error('Réponds à un message du bot avec button add/del <URL>.');
        const target = await tools.messageByReference(message, args[2]);
        if (target.author.id !== client.user.id) throw new Error('Le message doit appartenir à ce bot.');
        const link = tools.url(args[1]), rows = target.components.map(row => row.toJSON());
        if (action === 'del') {
            for (const row of rows) row.components = row.components.filter(component => !(component.type === ComponentType.Button && component.style === ButtonStyle.Link && component.url === link));
        } else {
            if (rows.some(row => row.components.some(c => c.url === link))) throw new Error('Ce bouton existe déjà.');
            let row = rows.find(row => row.components.every(c => c.type === ComponentType.Button) && row.components.length < 5);
            if (!row) { if (rows.length >= 5) throw new Error('Le message a déjà 5 rangées de composants.'); row = { type: 1, components: [] }; rows.push(row); }
            row.components.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(args.slice(3).join(' ').slice(0, 80) || 'Lien').setURL(link).toJSON());
        }
        await target.edit({ components: rows.filter(row => row.components.length) }); return send('Boutons mis à jour.');
    }
    if (name === 'autoreact') {
        const action = args.shift()?.toLowerCase();
        if (action === 'list') return g.list(message, 'Réactions automatiques', Object.entries(store.get(guild.id).autoReacts).map(([id, values]) => `<#${id}> : ${values.join(', ')}`));
        if (!['add', 'del'].includes(action) || args.length < 2) throw new Error('Utilise autoreact add/del salon émoji.');
        const reaction = tools.emoji(args.pop()).reaction, channel = await tools.channel(message, args.join(' '));
        if (!channel.isTextBased()) throw new Error('Choisis un salon textuel.');
        store.mutate(guild.id, state => { const reactions = state.autoReacts[channel.id] || []; if (action === 'add' && !reactions.includes(reaction) && reactions.length >= 20) throw new Error('Maximum 20 réactions par salon.'); state.autoReacts[channel.id] = action === 'add' ? [...new Set([...reactions, reaction])] : reactions.filter(value => value !== reaction); if (!state.autoReacts[channel.id].length) delete state.autoReacts[channel.id]; });
        return send('Réactions automatiques mises à jour.');
    }
    if (name === 'formulaire') {
        const existing = args[0] ? Object.entries(store.get(guild.id).forms).find(([id, record]) => id === args[0] || record.messageId === args[0]) : null;
        if (args[0] && !existing) throw new Error('Formulaire introuvable dans ce serveur.');
        return form('Configurer un formulaire', [{ id: 'title', label: 'Titre du formulaire', required: true, max: 100, value: existing?.[1].title }, { id: 'questions', label: 'Questions séparées par ,, (maximum 5)', required: true, paragraph: true, value: existing?.[1].questions.join(',,') }, { id: 'logs', label: 'Salon de logs : nom ou ID', required: true, value: existing?.[1].logChannelId }, { id: 'channel', label: 'Salon de publication : vide = ici' }], async values => {
            const questions = values.questions.split(',,').map(q => q.trim()).filter(Boolean);
            if (!questions.length || questions.length > 5 || questions.some(q => q.length > 45)) throw new Error('1 à 5 questions, de 45 caractères maximum chacune.');
            const logs = await tools.channel(message, values.logs), channel = existing ? await guild.channels.fetch(existing[1].channelId) : await tools.channel(message, values.channel);
            if (!logs.isTextBased() || !channel.isTextBased() || !logs.permissionsFor(guild.members.me)?.has([P.SendMessages, P.EmbedLinks])) throw new Error('Salons textuels accessibles au bot requis.');
            const id = existing?.[0] || randomUUID(), payload = { embeds: [g.embed(`📝 ${values.title}`, 'Appuie sur Répondre pour remplir le formulaire en privé.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mg:form:${id}`).setLabel('Répondre').setStyle(ButtonStyle.Primary))], allowedMentions: { parse: [] } };
            const sent = existing ? await (await channel.messages.fetch(existing[1].messageId)).edit(payload) : await channel.send(payload);
            store.mutate(guild.id, state => { state.forms[id] = { title: values.title, questions, logChannelId: logs.id, channelId: channel.id, messageId: sent.id }; });
        });
    }
}
module.exports = name => ({ name, category: 'Gestion du serveur', defaultPermission: 'Administrator', lockedPermission: true, usage: definitions[name][0][0], description: definitions[name][0][1], helpEntries: definitions[name].map(([usage, description]) => ({ usage, description })), execute: (message, args, client) => execute(name, message, args, client) });
module.exports.names = Object.keys(definitions);

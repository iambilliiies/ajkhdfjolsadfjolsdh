const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Collection, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const root = path.join(__dirname, '..'), ownerId = '100000000000000001', userId = '100000000000000002', botId = '100000000000000009';
function setup() {
    const files = new Map(), cache = new Map(), actions = [], confirmations = [], forms = [];
    const fakeFs = { existsSync: file => files.has(file), mkdirSync() {}, readFileSync: file => files.get(file), writeFileSync: (file, text) => files.set(file, text), renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); } };
    const g = { id: value => String(value || '').replace(/[<@!#&>]/g, ''), embed: (title, description) => new EmbedBuilder().setTitle(title).setDescription(description || '-'), date: value => String(value), reply: async (message, embed) => actions.push({ type: 'reply', embed }), list: async (message, title, lines) => actions.push({ type: 'list', title, lines }) };
    function load(relative) {
        const filename = path.resolve(root, relative);
        if (cache.has(filename)) return cache.get(filename);
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
            module, __dirname: path.dirname(filename), Buffer, URL, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval,
            console: { log() {}, error() {} },
            require: name => {
                if (name === 'node:fs') return fakeFs;
                if (name.endsWith('config.json')) return { owners: [ownerId], defaultPrefix: '+' };
                if (name === './general') return g;
                if (name === './ownerUI') return { confirm: async (message, text, action) => confirmations.push(action), form: async (message, title, fields, action) => forms.push({ title, fields, action }) };
                if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.js`));
                return require(name);
            }
        }, { filename });
        cache.set(filename, module.exports); return module.exports;
    }
    const roles = new Collection([['role', { id: 'role', name: 'Test', managed: false, editable: true, position: 1, permissions: new PermissionsBitField(0n) }]]);
    const members = new Collection();
    const guild = { id: 'guild', ownerId, name: 'Test', maximumBitrate: 96000, roles: { cache: roles, fetch: async () => roles, create: async value => { actions.push({ type: 'createRole', value }); return { id: 'newRole' }; } }, members: { me: { permissions: { has: () => true } }, fetch: async id => { if (id === undefined) return members; if (!members.has(id)) throw Object.assign(new Error('Unknown member'), { code: 10007 }); return members.get(id); } } };
    const channels = new Collection(), messages = new Map();
    function channel(id, name = id) {
        const value = { id, name, guild, type: ChannelType.GuildText, parentId: null, rawPosition: 0, permissionOverwrites: { cache: new Collection() }, isTextBased: () => true, isVoiceBased: () => false, permissionsFor: () => ({ has: () => true }),
            messages: { fetch: async id => { if (!messages.has(id)) throw new Error('Missing message'); return messages.get(id); } },
            send: async payload => {
                actions.push({ type: 'send', channelId: id, payload });
                const result = { id: `message${messages.size + 1}`, channel: value, guild, url: 'https://discord.com/test', edit: async payload => { actions.push({ type: 'edit', payload }); return result; }, delete: async () => {} };
                messages.set(result.id, result); return result;
            }
        };
        channels.set(id, value); return value;
    }
    channel('channel'); channel('logs');
    guild.channels = { cache: channels, fetch: async id => id ? channels.get(id) : channels, create: async value => { actions.push({ type: 'createChannel', value }); return channel(`new${channels.size}`); } };
    const member = { id: userId, guild, user: { id: userId, bot: false }, roles: { cache: roles.clone(), add: async id => { actions.push({ type: 'addRole', id }); member.roles.cache.set(id, roles.get(id)); }, remove: async id => { actions.push({ type: 'removeRole', id }); member.roles.cache.delete(id); } } };
    members.set(userId, member);
    g.role = async (message, args) => roles.get(args[0]) || [...roles.values()].find(r => r.name === args[0]);
    g.member = async (message, args) => members.get(g.id(args[0]));
    const client = { user: { id: botId }, guilds: { cache: new Map([['guild', guild]]) }, channels: guild.channels };
    guild.client = client;
    const message = { guild, client, channel: channels.get('channel'), author: { id: ownerId }, member: { roles: { highest: { comparePositionTo: () => 1 } }, permissions: { has: () => true }, voice: { channel: null } }, attachments: new Collection(), reply: async payload => actions.push({ type: 'reply', payload }) };
    return { load, store: load('utils/managementStore.js'), factory: load('utils/managementCommands.js'), actions, confirmations, forms, guild, member, client, message, channels, roles, messages };
}
test('les 25 commandes de gestion sont documentées et protégées', async () => {
    const e = setup();
    assert.equal(e.factory.names.length, 25);
    e.message.author.id = userId; e.message.member.permissions.has = () => false;
    for (const name of e.factory.names) {
        assert.ok(e.factory(name).helpEntries.length);
        await assert.rejects(e.factory(name).execute(e.message, [], e.client), /administrateurs/);
    }
});
test('giveaway interactif, participation, clôture et tirage sans doublons', async () => {
    const e = setup();
    await e.factory('giveaway').execute(e.message, [], e.client);
    assert.equal(e.forms.length, 1);
    await e.forms[0].action({ prize: 'Lot', duration: '1h', winners: '1', channel: '' });
    const giveawayId = Object.keys(e.store.get('guild').giveaways)[0];
    const interaction = { customId: 'mg:giveaway', guildId: 'guild', channelId: 'channel', user: { id: userId, bot: false }, message: e.messages.get(giveawayId), isButton: () => true, isModalSubmit: () => false, deferReply: async () => {}, editReply: async () => {} };
    const handler = e.load('utils/managementInteractions.js');
    await handler.handle(interaction);
    assert.equal(e.store.get('guild').giveaways[giveawayId].participants.length, 1);
    await handler.handle(interaction);
    assert.equal(e.store.get('guild').giveaways[giveawayId].participants.length, 0);
    await handler.handle(interaction);
    await e.factory('end').execute(e.message, ['giveaway', giveawayId], e.client);
    assert.equal(e.store.get('guild').giveaways[giveawayId].ended, true);
    assert.equal(e.store.get('guild').giveaways[giveawayId].winners[0], userId);
    const draw = e.load('utils/giveaways.js').draw(['a', 'a', 'b', 'c'], 10);
    assert.equal(draw.length, 3);
    assert.equal(new Set(draw).size, 3);
});
test('expiration des rôles persistante et refus des rôles permanents', async () => {
    const e = setup();
    await assert.rejects(e.factory('temprole').execute(e.message, [userId, 'role', '1h'], e.client), /permanent/);
    e.member.roles.cache.clear();
    await e.factory('temprole').execute(e.message, [userId, 'role', '1h'], e.client);
    const key = `${userId}:role`;
    assert.ok(e.store.get('guild').tempRoles[key]);
    e.store.mutate('guild', state => { state.tempRoles[key].expiresAt = Date.now() - 1; });
    await e.load('utils/managementScheduler.js').tick(e.client);
    assert.equal(e.store.get('guild').tempRoles[key], undefined);
    assert.equal(e.member.roles.cache.has('role'), false);
});
test('backups préservent les permissions avec remappage des rôles et catégories', async () => {
    const e = setup();
    const category = e.channels.get('channel'); category.type = ChannelType.GuildCategory;
    const child = e.channels.get('logs'); child.parentId = 'channel';
    child.permissionOverwrites.cache.set('role', { id: 'role', type: 0, allow: new PermissionsBitField(1024n), deny: new PermissionsBitField(2048n) });
    await e.factory('backup').execute(e.message, ['serveur', 'test'], e.client);
    const backup = e.load('utils/backupStore.js').get('serveur').test;
    assert.equal(backup.channels.find(c => c.id === 'logs').permissionOverwrites[0].deny, '2048');
    await e.factory('backup').execute(e.message, ['load', 'serveur', 'test'], e.client);
    assert.equal(e.actions.filter(a => a.type === 'createRole').length, 0);
    await e.confirmations.pop()();
    const restored = e.actions.filter(a => a.type === 'createChannel');
    assert.equal(restored.length, 2);
    assert.equal(restored[1].value.permissionOverwrites[0].id, 'newRole');
    assert.equal(restored[1].value.permissionOverwrites[0].deny, 2048n);
    assert.ok(restored[1].value.parent);
});
test('autoreact persistant sur les messages sans commande', async () => {
    const e = setup();
    await e.factory('autoreact').execute(e.message, ['add', 'channel', '👍'], e.client);
    const reactions = [];
    e.message.author.bot = false; e.message.content = 'Bonjour'; e.message.react = async emoji => reactions.push(emoji);
    await e.load('utils/managementInteractions.js').onMessage(e.message);
    assert.equal(reactions[0], '👍');
    await e.factory('autoreact').execute(e.message, ['del', 'channel', '👍'], e.client);
    assert.equal(e.store.get('guild').autoReacts.channel, undefined);
});

test('une backup globale se liste et se charge depuis un autre serveur', async () => {
    const e = setup();
    await e.factory('backup').execute(e.message, ['serveur', 'partage'], e.client);
    e.guild.id = 'autre';
    await e.factory('backup').execute(e.message, ['list', 'serveur'], e.client);
    assert.match(e.actions.at(-1).lines[0], /partage/);
    await e.factory('backup').execute(e.message, ['load', 'serveur', 'partage'], e.client);
    await e.confirmations.pop()();
    assert.equal(e.actions.filter(a => a.type === 'createChannel').length, 2);
    await assert.rejects(e.factory('backup').execute(e.message, ['serveur', 'partage'], e.client), /globale/);
});

test('migration des backups locales sans perte et suppression définitive', () => {
    const e = setup();
    for (const id of ['guild', 'autre']) e.store.mutate(id, state => { state.backups.serveur.test = { guildId: id, type: 'serveur', roles: [], channels: [] }; });
    const global = e.load('utils/backupStore.js');
    const records = global.get('serveur');
    assert.equal(Object.keys(records).length, 2);
    assert.deepEqual(new Set(Object.values(records).map(r => r.guildId)), new Set(['guild', 'autre']));
    global.mutate('serveur', records => { delete records.test; });
    assert.equal(Object.keys(global.get('serveur')).length, 1);
    assert.equal(global.get('serveur').test, undefined);
});

test('restauration ignore les membres absents et conserve les rôles du plus haut au plus bas', async () => {
    const e = setup();
    const record = { type: 'serveur', guildId: 'source', roles: [{ id: 'low', name: 'Bas', position: 1, permissions: '0' }, { id: 'high', name: 'Haut', position: 4, permissions: '0' }], channels: [{ name: 'test', type: ChannelType.GuildText, permissionOverwrites: [{ id: 'absent', type: 1, allow: '0', deny: '1024' }] }] };
    const results = await e.load('utils/backups.js').restore(e.guild, record);
    assert.match(results.join('\n'), /absent/);
    assert.deepEqual(e.actions.filter(a => a.type === 'createRole').map(a => a.value.name), ['Haut', 'Bas']);
    assert.equal(e.actions.find(a => a.type === 'createChannel').value.permissionOverwrites.length, 0);
});
test('formulaire persistant et réponses envoyées uniquement au salon de logs', async () => {
    const e = setup();
    await e.factory('formulaire').execute(e.message, [], e.client);
    await e.forms[0].action({ title: 'Candidature', questions: 'Nom ?,,Pourquoi ?', logs: 'logs', channel: '' });
    const id = Object.keys(e.store.get('guild').forms)[0];
    let shown, ack;
    const handler = e.load('utils/managementInteractions.js'), record = e.store.get('guild').forms[id];
    await handler.handle({ customId: `mg:form:${id}`, guildId: 'guild', channelId: 'channel', message: { id: record.messageId }, user: { id: userId }, isButton: () => true, isModalSubmit: () => false, showModal: async modal => { shown = modal; } });
    assert.equal(shown.toJSON().components.length, 2);
    await handler.handle({ customId: `mg:response:${id}`, guildId: 'guild', guild: e.guild, user: { id: userId }, isButton: () => false, isModalSubmit: () => true, deferReply: async () => {}, editReply: async text => { ack = text; }, fields: { getTextInputValue: key => key === 'answer0' ? 'Alice' : 'Test' } });
    assert.match(ack, /envoyée/);
    assert.equal(e.actions.filter(a => a.type === 'send').at(-1).channelId, 'logs');
});
test('modmail ouvre un ticket sans MP et relaie seulement le message du staff', async () => {
    const e = setup(); let dms = 0;
    e.client.users = { fetch: async () => ({ send: async () => { dms++; } }) };
    await e.factory('openmodmail').execute(e.message, [userId], e.client);
    assert.equal(dms, 0);
    const ticket = e.store.get('guild').tickets[userId];
    assert.ok(ticket.channelId);
    const handler = e.load('utils/managementInteractions.js');
    await handler.onMessage({ ...e.message, channel: e.channels.get(ticket.channelId), content: 'Bonjour', author: { id: ownerId, bot: false } });
    assert.equal(dms, 1);
});
test('une backup automatique expirée est créée et replanifiée', async () => {
    const e = setup();
    e.store.mutate('guild', state => { state.autoBackups.serveur = { days: 2, nextAt: 0 }; });
    await e.load('utils/managementScheduler.js').tick(e.client);
    assert.ok(e.load('utils/backupStore.js').get('serveur')['automatique guild']);
    assert.ok(e.store.get('guild').autoBackups.serveur.nextAt > Date.now());
});


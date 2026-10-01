const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Collection, EmbedBuilder, PermissionFlagsBits: P, PermissionsBitField, AuditLogEvent: A } = require('discord.js');
const root = path.join(__dirname, '..');
const ownerId = '100000000000000001', actorId = '100000000000000002', otherId = '100000000000000003', botId = '100000000000000009';
function setup() {
    const files = new Map(), modules = new Map(), operations = [], confirmations = [];
    const fakeFs = { existsSync: file => files.has(file), readFileSync: file => files.get(file), mkdirSync() {}, writeFileSync: (file, text) => files.set(file, text), renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); } };
    const g = {
        id: value => String(value || '').replace(/[<@!&>#]/g, ''),
        embed: (title, description) => new EmbedBuilder().setTitle(title).setDescription(description || '-'),
        reply: async (message, embed) => { operations.push({ type: 'reply', embed }); },
        list: async (message, title, lines) => { operations.push({ type: 'list', title, lines }); },
        date: value => String(value)
    };
    function load(relative) {
        const filename = path.resolve(root, relative);
        if (modules.has(filename)) return modules.get(filename);
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
            module, __dirname: path.dirname(filename), console: { log() {}, error() {} },
            require: name => {
                if (name === 'node:fs') return fakeFs;
                if (name === './general') return g;
                if (name.endsWith('config.json')) return { owners: [ownerId], defaultPrefix: '+' };
                if (name === './ownerUI') return { confirm: async (message, text, action) => { confirmations.push(action); } };
                if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.js`));
                return require(name);
            }
        }, { filename });
        modules.set(filename, module.exports); return module.exports;
    }
    const roles = new Collection([['role', { id: 'role', name: 'Admin', editable: true, managed: false, permissions: new PermissionsBitField(P.Administrator) }]]);
    const members = new Map();
    const guild = {
        id: 'guild', ownerId, client: { user: { id: botId } }, roles: { cache: roles },
        members: { me: { permissions: { has: () => true } }, fetch: async id => { if (!members.has(id)) throw new Error('Missing member'); return members.get(id); } },
        channels: { fetch: async () => ({ delete: async () => operations.push({ type: 'deleteChannel' }) }) }
    };
    function member(id) {
        const value = { id, guild, user: { id, createdTimestamp: Date.now() - 86400000 }, kickable: true, bannable: true,
            kick: async () => operations.push({ type: 'kick', id }), ban: async () => operations.push({ type: 'ban', id }),
            roles: { cache: roles.clone(), remove: async ids => { operations.push({ type: 'removeRoles', id, ids }); }, add: async ids => operations.push({ type: 'addRoles', id, ids }) },
            permissions: { has: () => false }
        };
        members.set(id, value); return value;
    }
    member(actorId); member(otherId);
    const client = { user: { id: botId }, users: { fetch: async id => ({ id }) } };
    const message = { guild, author: { id: ownerId }, member: { permissions: { has: () => true } } };
    return { load, store: load('utils/antiraidStore.js'), engine: load('utils/antiraid.js'), factory: load('utils/antiraidCommands.js'), operations, confirmations, guild, members, member, client, message };
}
test('durées, seuils et réglages séparés par serveur', () => {
    const e = setup();
    assert.equal(e.store.duration('7j'), 604800000);
    assert.equal(e.store.limit('5/10s').duration, 10000);
    for (const value of ['0/10s', '3/0s', '2/-1s', '10/2h', 'NaN/1s']) assert.throws(() => e.store.limit(value));
    e.store.save('guild', { creationAge: 1000 });
    assert.equal(e.store.get('guild').creationAge, 1000);
    assert.equal(e.store.get('other').creationAge, 0);
});
test('commandes réservées aux administrateurs et paramètres multiples', async () => {
    const e = setup();
    assert.equal(e.factory.names.length, 19);
    assert.equal(e.factory.parts(['<@100000000000000002>', '<@100000000000000003>']).length, 2);
    assert.equal(e.factory.parts(['Nom', 'complet,,Autre', 'nom']).length, 2);
    e.message.author.id = actorId;
    e.message.member.permissions.has = () => false;
    for (const name of e.factory.names) await assert.rejects(e.factory(name).execute(e.message, [], e.client), /administrateurs/);
    e.message.author.id = ownerId;
    await e.factory('wl').execute(e.message, [actorId + ',,' + otherId], e.client);
    assert.equal(e.store.get('guild').whitelist.length, 2);
    await e.factory('antiban').execute(e.message, ['5/10s'], e.client);
    assert.equal(e.store.get('guild').limits.antiban.count, 5);
    await e.factory('antiban').execute(e.message, ['on'], e.client);
    assert.equal(e.store.get('guild').modes.antiban, 'on');
});
test('whitelist respectée en on, ignorée en max, propriétaire toujours protégé', () => {
    const e = setup();
    e.store.save('guild', { whitelist: [actorId] });
    assert.equal(e.engine.exempt(e.guild, actorId, 'on'), true);
    assert.equal(e.engine.exempt(e.guild, actorId, 'max'), false);
    assert.equal(e.engine.exempt(e.guild, ownerId, 'max'), true);
    assert.equal(e.engine.exempt(e.guild, botId, 'max'), true);
    assert.equal(e.engine.exempt(e.guild, null, 'max'), true);
});
test('antitoken déclenche sur le seuil, verrouille les prochains joins et respecte l’âge minimum', async () => {
    const e = setup(), config = e.store.get('guild');
    e.store.save('guild', { modes: { ...config.modes, antitoken: 'on' }, limits: { ...config.limits, antitoken: { count: 2, duration: 10000 } } });
    await e.engine.join(e.members.get(actorId));
    assert.equal(e.operations.length, 0);
    await e.engine.join(e.members.get(otherId));
    assert.ok(e.store.get('guild').blockedUntil > Date.now());
    assert.equal(e.operations.filter(op => op.type === 'kick').length, 1);
    await e.engine.join(e.member('100000000000000004'));
    assert.equal(e.operations.filter(op => op.type === 'kick').length, 2);
    e.store.save('guild', { blockedUntil: 0, modes: { ...config.modes }, creationAge: 2 * 86400000 });
    await e.engine.join(e.member('100000000000000005'));
    assert.equal(e.operations.filter(op => op.type === 'kick').length, 3);
});
test('audit exact, déduplication et seuil de bannissement', async () => {
    const e = setup(), config = e.store.get('guild');
    e.store.save('guild', { modes: { ...config.modes, antichannel: 'on', antiban: 'on' }, limits: { ...config.limits, antiban: { count: 2, duration: 10000 } } });
    const entry = { id: 'first', action: A.ChannelCreate, executorId: actorId, targetId: 'channel', createdTimestamp: Date.now() };
    await e.engine.audit(entry, e.guild);
    await e.engine.audit(entry, e.guild);
    assert.equal(e.operations.filter(op => op.type === 'deleteChannel').length, 1);
    assert.equal(e.operations.filter(op => op.type === 'removeRoles').length, 1);
    await e.engine.audit({ ...entry, id: 'unknown', executorId: null }, e.guild);
    assert.equal(e.operations.filter(op => op.type === 'deleteChannel').length, 1);
    await e.engine.audit({ ...entry, id: 'ban1', action: A.MemberBanAdd }, e.guild);
    assert.equal(e.operations.filter(op => op.type === 'removeRoles').length, 1);
    await e.engine.audit({ ...entry, id: 'ban2', action: A.MemberBanAdd }, e.guild);
    assert.equal(e.operations.filter(op => op.type === 'removeRoles').length, 2);
});
test('antieveryone et blacklist rank retirent les rôles des bons membres', async () => {
    const e = setup(), config = e.store.get('guild');
    e.store.save('guild', { modes: { ...config.modes, antieveryone: 'on', blrank: 'on' }, rankBlacklist: [otherId], limits: { ...config.limits, antieveryone: { count: 2, duration: 10000 } } });
    const message = { guild: e.guild, author: { id: actorId, bot: false }, mentions: { everyone: true }, delete: async () => e.operations.push({ type: 'deleteMessage' }) };
    await e.engine.message(message);
    assert.equal(e.operations.length, 0);
    await e.engine.message(message);
    assert.equal(e.operations.filter(op => op.type === 'deleteMessage').length, 1);
    await e.engine.stripRank(e.members.get(otherId));
    assert.ok(e.operations.some(op => op.type === 'removeRoles' && op.id === otherId));
});
test('webhooks et whitelist ne sont effacés qu’après confirmation', async () => {
    const e = setup();
    e.store.save('guild', { whitelist: [actorId] });
    await e.factory('clear').execute(e.message, ['wl'], e.client);
    assert.equal(e.store.get('guild').whitelist.length, 1);
    await e.confirmations.pop()();
    assert.equal(e.store.get('guild').whitelist.length, 0);
    let deleted = 0;
    e.guild.fetchWebhooks = async () => new Collection([['hook', { name: 'Hook', delete: async () => { deleted++; } }]]);
    await e.factory('clear').execute(e.message, ['webhooks'], e.client);
    assert.equal(deleted, 0);
    await e.confirmations.pop()();
    assert.equal(deleted, 1);
});
test('les sous-commandes secur et clear sont routées vers la bonne catégorie', () => {
    const factory = require('../utils/ownerCommands');
    assert.equal(factory('secur').matches(['invite', 'on']), true);
    assert.equal(factory('secur').matches(['max']), false);
    assert.equal(factory('clear').matches(['owners']), true);
    assert.equal(factory('clear').matches(['bl']), true);
    assert.equal(factory('clear').matches(['wl']), false);
    assert.equal(factory('clear').matches(['webhooks']), false);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const primary = '100000000000000001';
const secondary = '100000000000000002';
const outsider = '100000000000000003';
function environment() {
    const files = new Map(), cache = new Map(), confirmations = [];
    const fakeFs = {
        existsSync: file => files.has(file), mkdirSync() {},
        readFileSync: file => { if (!files.has(file)) throw new Error('Missing file'); return files.get(file); },
        writeFileSync: (file, text) => files.set(file, text),
        renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); }
    };
    const quiet = { log() {}, error() {} };
    function load(relative, fresh = false) {
        const filename = path.resolve(root, relative);
        if (!fresh && cache.has(filename)) return cache.get(filename);
        const module = { exports: {} };
        const localRequire = name => {
            if (['fs', 'node:fs'].includes(name)) return fakeFs;
            if (name.endsWith('config.json')) return { owners: [primary], defaultPrefix: '+', fivemServer: 'https://cfx.re/join/bddy34d' };
            if (name === './ownerUI') return { confirm: async (message, text, action) => { confirmations.push(action); }, form: async () => {} };
            if (name === './presence') return { apply() {} };
            if (name === './updater') return { update: async () => 'à jour', schedule() {} };
            if (name.startsWith('.')) {
                let file = path.resolve(path.dirname(filename), name);
                if (!path.extname(file)) file += '.js';
                if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
                return load(file);
            }
            return require(name);
        };
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, require: localRequire, __dirname: path.dirname(filename), console: quiet, Buffer, URL, URLSearchParams, AbortSignal, fetch: async () => { throw new Error('offline'); }, setInterval, clearInterval, process }, { filename });
        cache.set(filename, module.exports);
        return module.exports;
    }
    const settings = load('utils/settings.js');
    const factory = load('utils/ownerCommands.js');
    const client = {
        user: { id: '100000000000000009', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' },
        users: { fetch: async id => ({ id, tag: `User ${id}`, bot: false }) },
        commands: new Map([['ping', { name: 'ping', execute: async () => {} }], ['server', { name: 'server', execute: async () => {} }]]),
        ownerCommands: new Map(factory.names.map(name => [name, factory(name)])),
        guilds: { cache: new Map() }, channels: { cache: new Map() }
    };
    const replies = [];
    const message = { author: { id: primary }, guild: { id: 'guild', name: 'Test' }, channel: { send: async payload => replies.push(payload) }, reply: async payload => { replies.push(payload); return {}; } };
    return { load, settings, factory, client, message, files, confirmations, replies };
}
test('toutes les commandes owner sont documentées et réservées', async () => {
    const env = environment();
    assert.equal(env.factory.names.length, 38);
    for (const name of env.factory.names) {
        const command = env.factory(name);
        assert.equal(command.ownerOnly, true);
        assert.ok(command.helpEntries.length);
        env.message.author.id = outsider;
        await assert.rejects(command.execute(env.message, [], env.client), /owners/);
    }
});
test('réglages persistants, owners et protection du propriétaire principal', async () => {
    const env = environment();
    await env.factory('owner').execute(env.message, [secondary], env.client);
    assert.equal(env.settings.isOwner(secondary), true);
    await assert.rejects(env.factory('unowner').execute(env.message, [primary], env.client), /principal/);
    await env.factory('clear').execute(env.message, ['owners'], env.client);
    assert.equal(env.settings.isOwner(secondary), true); // aucune destruction avant confirmation
    await env.confirmations.pop()();
    assert.equal(env.settings.isOwner(secondary), false);
    assert.equal(env.settings.isOwner(primary), true);
    await env.factory('mainprefix').execute(env.message, ['?'], env.client);
    await env.factory('theme').execute(env.message, ['#123456'], env.client);
    const reloaded = env.load('utils/settings.js', true);
    assert.equal(reloaded.prefix(), '?');
    assert.equal(reloaded.theme(), 0x123456);
    assert.equal(reloaded.isOwner(primary), true);
    assert.equal(reloaded.read().fivem.joinCode, 'bddy34d');
});
test('permissions, alias et sous-commandes partagées ne contournent pas owner-only', async () => {
    const env = environment();
    const handler = env.load('events/messagecreate.js');
    let generalCalls = 0, ownerCalls = 0;
    env.client.commands.get('server').execute = async () => { generalCalls++; };
    const ownerServer = env.client.ownerCommands.get('server');
    ownerServer.execute = async () => { ownerCalls++; };
    env.message.author.id = outsider;
    env.message.content = '+server pic';
    await handler.execute(env.message, env.client);
    assert.equal(generalCalls, 1);
    env.message.content = '+server list';
    await handler.execute(env.message, env.client);
    assert.equal(ownerCalls, 0);
    env.message.author.id = primary;
    await env.factory('alias').execute(env.message, ['server', 'srv'], env.client);
    await env.factory('alias').execute(env.message, ['say', 'echo'], env.client);
    env.message.author.id = outsider;
    env.message.content = '+srv list';
    await handler.execute(env.message, env.client);
    assert.equal(ownerCalls, 0);
    const repliesBefore = env.replies.length;
    env.message.content = '+echo hello';
    await handler.execute(env.message, env.client);
    assert.equal(env.replies.length, repliesBefore + 1);
    assert.match(env.replies.at(-1).content, /owners/);
    env.message.author.id = primary;
    await assert.rejects(env.factory('change').execute(env.message, ['say', 'everyone'], env.client), /générale/);
    await env.factory('change').execute(env.message, ['ping', 'admin'], env.client);
    const permission = env.load('utils/permissions.js');
    env.message.author.id = outsider;
    env.message.member = { permissions: { has: () => false } };
    assert.equal(permission.allowed(env.message, env.client.commands.get('ping')), false);
    env.message.member.permissions.has = () => true;
    assert.equal(permission.allowed(env.message, env.client.commands.get('ping')), true);
});
test('blacklist persistante, erreurs de bannissement et bans sur nouveaux joins', async () => {
    const env = environment();
    let bans = 0;
    env.client.guilds.cache.set('a', { id: 'a', name: 'A', members: { ban: async () => { bans++; } } });
    env.client.guilds.cache.set('b', { id: 'b', name: 'B', members: { ban: async () => { throw new Error('Missing permissions'); } } });
    await env.factory('bl').execute(env.message, [outsider, 'Test'], env.client);
    assert.equal(bans, 1);
    assert.equal(env.settings.blacklisted(outsider), true);
    assert.match(env.replies.at(-1).embeds[0].toJSON().description, /Missing permissions/);
    await env.load('events/guildmemberadd.js').execute({ id: outsider, ban: async () => { bans++; } });
    assert.equal(bans, 2);
    await assert.rejects(env.factory('bl').execute(env.message, [primary], env.client), /owner/);
    await env.factory('unbl').execute(env.message, [outsider], env.client);
    assert.equal(env.settings.blacklisted(outsider), false);
});
test('secur invite quitte seulement quand l’absence du propriétaire est établie', async () => {
    const env = environment();
    env.settings.save({ secureInvite: true });
    let leaves = 0;
    const guild = { members: { fetch: async () => { throw Object.assign(new Error('Unknown member'), { code: 10007 }); } }, leave: async () => { leaves++; } };
    const event = env.load('events/guildcreate.js');
    await event.execute(guild);
    assert.equal(leaves, 1);
    guild.members.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(event.execute(guild), /offline/);
    assert.equal(leaves, 1);
});
test('sélecteur help et navigation au-delà de 25 pages', async () => {
    const env = environment();
    env.settings.save({ helpType: 'select' });
    env.client.commands = new Map(Array.from({ length: 30 }, (_, i) => [`test${i}`, { name: `test${i}`, category: `category${String(i).padStart(2, '0')}` }]));
    env.client.ownerCommands = new Map();
    const callbacks = {}; let payload;
    env.message.reply = async value => {
        payload = value;
        return { createMessageComponentCollector: () => ({ on: (event, callback) => { callbacks[event] = callback; }, stop() {} }), edit: async value => { payload = value; } };
    };
    await env.load('commands/general/help.js').execute(env.message, [], env.client, { prefix: '+' });
    assert.equal(payload.components[0].toJSON().components[0].options.length, 25);
    await callbacks.collect({ user: { id: primary }, customId: 'help:groupNext', update: async value => { payload = value; } });
    assert.equal(payload.components[0].toJSON().components[0].options.length, 5);
    await callbacks.collect({ user: { id: primary }, customId: 'help:select', values: ['29'], update: async value => { payload = value; } });
    assert.match(payload.embeds[0].toJSON().description, /test29/);
    await callbacks.end();
    assert.ok(payload.components.every(row => row.toJSON().components.every(component => component.disabled)));
});
test('FiveM accepte le lien fourni et le profil refuse un chemin local', () => {
    const env = environment();
    assert.equal(env.load('utils/fivem.js').parse('https://cfx.re/join/bddy34d').joinCode, 'bddy34d');
    assert.throws(() => env.factory.profile({ pic: 'C:/secret.png' }));
    assert.throws(() => env.factory.profile({ name: 'a' }));
    assert.equal(env.factory.profile({ name: 'Crow' }).username, 'Crow');
});

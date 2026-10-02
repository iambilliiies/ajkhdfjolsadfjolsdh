const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const Storage = require('../manager/storage');
const { Rentals, duration } = require('../manager/rentals');
const { Supervisor, prepare } = require('../manager/supervisor');
const { Controller } = require('../manager/controller');
const ownerId = '100000000000000001', customerId = '100000000000000002', botId = '100000000000000003';
function fixture(t, max = 10) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'protect-manager-test-'));
    t.after(() => { if (path.dirname(root) !== path.resolve(os.tmpdir())) throw new Error('Dossier temporaire inattendu'); fs.rmSync(root, { recursive: true, force: true }); });
    const runtime = path.join(root, 'runtime'), source = path.join(root, 'source'), store = new Storage(runtime);
    fs.mkdirSync(source);
    for (const file of ['index.js', 'package.json', 'package-lock.json']) fs.writeFileSync(path.join(source, file), file === 'index.js' ? '// source' : '{}');
    for (const dir of ['commands', 'events', 'utils', 'data', 'manager', '.git']) fs.mkdirSync(path.join(source, dir));
    fs.writeFileSync(path.join(source, 'data/changelogs.json'), '[]');
    fs.mkdirSync(path.join(source, 'data/lang'));
    fs.writeFileSync(path.join(source, 'data/lang/fr.json'), '{}');
    fs.writeFileSync(path.join(source, 'data/lang/en.json'), '{}');
    fs.writeFileSync(path.join(source, 'data/settings.json'), '{"private":true}');
    fs.writeFileSync(path.join(source, 'config.json'), '{"token":"ROOT_SECRET"}');
    fs.writeFileSync(path.join(source, 'manager/config.json'), '{"token":"MANAGER_SECRET"}');
    let now = Date.now();
    const rentals = new Rentals(store, max, () => now);
    const created = rentals.create(customerId, duration('1h'));
    const activate = () => rentals.activate(created.id, customerId, created.nonce, 'CLIENT_TEST_TOKEN_1234567890', ownerId, botId);
    return { root, source, runtime, store, rentals, created, activate, advance: ms => { now += ms; }, now: () => now };
}
test('tokens chiffrés persistants, clé requise et données altérées refusées', t => {
    const e = fixture(t), token = 'CLIENT_TEST_TOKEN_1234567890';
    const record = e.activate();
    assert.equal(fs.readFileSync(e.store.file, 'utf8').includes(token), false);
    assert.equal(new Storage(e.runtime).decrypt(record.tokenCipher), token);
    assert.throws(() => e.store.decrypt({ ...record.tokenCipher, tag: Buffer.alloc(16).toString('base64') }), /illisible/);
    fs.unlinkSync(path.join(e.runtime, 'tokens.key'));
    assert.throws(() => new Storage(e.runtime), /manquante/);
});
test('durées, quotas, client de l’invitation et usage unique contrôlés', t => {
    const e = fixture(t, 1);
    assert.equal(duration('30j'), 30 * 86400000);
    for (const value of ['0m', '366j', 'foo', '-2h']) assert.throws(() => duration(value));
    assert.throws(() => e.rentals.create(ownerId, duration('1h')), /maximal/);
    assert.throws(() => e.rentals.activate(e.created.id, ownerId, e.created.nonce, 'token', ownerId, botId), /invalide/);
    e.activate(); assert.throws(() => e.activate(), /utilisée/);
});
test('la durée commence à l’activation ; renouvellement actif et expiré conserve le token', t => {
    const e = fixture(t); e.advance(60000);
    const active = e.activate();
    assert.equal(active.expiresAt, e.now() + 3600000);
    const renewed = e.rentals.renew(active.id, duration('2h'));
    assert.equal(renewed.expiresAt, active.expiresAt + 7200000);
    e.advance(86400000);
    assert.equal(e.rentals.renew(active.id, duration('30m')).expiresAt, e.now() + 1800000);
    assert.equal(e.store.decrypt(e.store.read()[active.id].tokenCipher), 'CLIENT_TEST_TOKEN_1234567890');
});
test('une copie cliente exclut le Git, les données et tokens du propriétaire', t => {
    const e = fixture(t), active = e.activate(), folder = prepare(e.source, e.runtime, active);
    assert.equal(fs.existsSync(path.join(folder, '.git')), false);
    assert.equal(fs.existsSync(path.join(folder, 'manager')), false);
    assert.equal(fs.existsSync(path.join(folder, 'data/settings.json')), false);
    assert.equal(fs.existsSync(path.join(folder, 'data/lang/fr.json')), true);
    assert.equal(fs.existsSync(path.join(folder, 'data/lang/en.json')), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'config.json'))).owners, [ownerId]);
    assert.equal(fs.readFileSync(path.join(folder, 'config.json'), 'utf8').includes('TOKEN'), false);
    fs.writeFileSync(path.join(folder, 'data/settings.json'), '{"customer":true}');
    prepare(e.source, e.runtime, active);
    assert.equal(fs.readFileSync(path.join(folder, 'data/settings.json'), 'utf8'), '{"customer":true}');
    assert.throws(() => prepare(e.source, e.runtime, { ...active, id: '../../outside' }), /invalide/);
});

test('ancienne instance marquée prête : langues manquantes restaurées et données client conservées', t => {
    const e = fixture(t), active = e.activate(), folder = prepare(e.source, e.runtime, active);
    fs.rmSync(path.join(folder, 'data/lang'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'data/settings.json'), '{"client":true}');
    e.store.mutate(all => { all[active.id].state = 'failed'; all[active.id].retries = 3; });
    const supervisor = new Supervisor(e.store, e.source, e.runtime, async () => {}, undefined, e.now, () => {});
    supervisor.repairFailedInstances();
    assert.equal(fs.existsSync(path.join(folder, 'data/lang/fr.json')), true);
    assert.equal(fs.existsSync(path.join(folder, 'data/lang/en.json')), true);
    assert.equal(fs.readFileSync(path.join(folder, 'data/settings.json'), 'utf8'), '{"client":true}');
    assert.equal(e.store.read()[active.id].state, 'active');
    assert.equal(e.store.read()[active.id].retries, 0);
});

test('une copie de la vraie source charge ses commandes et exécute calc sans fichiers privés du parent', t => {
    const e = fixture(t), active = e.activate(), source = path.resolve(__dirname, '..');
    const folder = prepare(source, e.runtime, active);
    const script = `
        const { Collection } = require('discord.js');
        const client = { commands: new Collection(), ownerCommands: new Collection() };
        require('./utils/loadCommands')(client, require('node:path').join(process.cwd(), 'commands'));
        let result;
        client.commands.get('calc').execute({ guild: null, reply: async payload => { result = payload.embeds[0].toJSON().description; } }, ['2+2'], client)
            .then(() => console.log(JSON.stringify({ ping: client.commands.has('ping'), help: client.commands.has('help'), calc: result })))
            .catch(() => process.exit(1));
    `;
    const child = spawnSync(process.execPath, ['-e', script], { cwd: folder, env: { ...process.env, NODE_PATH: path.join(source, 'node_modules'), PROTECT_MANAGED_INSTANCE: '1' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, '');
    const result = JSON.parse(child.stdout.trim().split('\n').at(-1));
    assert.equal(result.ping, true); assert.equal(result.help, true); assert.match(result.calc, /Résultat :\*\* 4/);
});
test('superviseur : un lancement, arrêt à expiration, notification unique et reprise après renouvellement', async t => {
    const e = fixture(t), active = e.activate(), children = [], notices = [];
    const spawn = (file, args, options) => {
        const child = new EventEmitter(); child.kill = () => { queueMicrotask(() => child.emit('exit', 0)); return true; };
        children.push({ child, options }); return child;
    };
    const supervisor = new Supervisor(e.store, e.source, e.runtime, async r => { notices.push(r.id); }, spawn, e.now);
    await Promise.all([supervisor.tick(), supervisor.tick()]);
    assert.equal(children.length, 1);
    assert.equal(children[0].options.env.PROTECT_MANAGED_INSTANCE, '1');
    assert.equal(children[0].options.env.PROTECT_MANAGER_TOKEN, undefined);
    assert.equal(children[0].options.env.DISCORD_TOKEN, 'CLIENT_TEST_TOKEN_1234567890');
    e.advance(3600001); await supervisor.tick(); await supervisor.tick();
    assert.equal(supervisor.children.size, 0); assert.equal(notices.length, 1);
    assert.equal(e.store.read()[active.id].state, 'expired');
    e.rentals.renew(active.id, duration('1h')); await supervisor.tick();
    assert.equal(children.length, 2);
    await supervisor.shutdown(); assert.equal(supervisor.children.size, 0);
});
test('trois échecs de démarrage arrêtent les relances automatiques', async t => {
    const e = fixture(t), active = e.activate(), children = [];
    const supervisor = new Supervisor(e.store, e.source, e.runtime, async () => {}, () => { const child = new EventEmitter(); children.push(child); return child; }, e.now);
    for (let i = 0; i < 3; i++) { await supervisor.tick(); children.at(-1).emit('exit', 1); e.advance(60001); }
    await supervisor.tick();
    assert.equal(children.length, 3); assert.equal(e.store.read()[active.id].state, 'failed');
});
function controllerFixture(t) {
    const e = fixture(t), sent = [], replies = [];
    const client = { user: { id: '100000000000000009' }, users: { fetch: async userId => ({ id: userId, bot: false, send: async payload => { sent.push(payload); } }) } };
    const supervisor = { children: new Map(), tick: async () => {} };
    const controller = new Controller(client, { ownerId, prefix: '+' }, e.rentals, supervisor, async () => ({ id: botId, username: 'Test Bot' }), ['MANAGER_SECRET_TOKEN_123456789']);
    const message = (authorId, content) => ({ author: { id: authorId, bot: false }, content, reply: async payload => { replies.push(payload); } });
    return { ...e, controller, client, sent, replies, message };
}
test('create et renew réservés au gestionnaire, mybot limité au client', async t => {
    const e = controllerFixture(t);
    await e.controller.message(e.message(customerId, `+create <@${ownerId}> 30j`));
    await e.controller.message(e.message(customerId, `+renew ${e.created.id} 30j`));
    assert.equal(Object.keys(e.store.read()).length, 1); assert.equal(e.sent.length, 0);
    assert.match(e.replies[0].content, /réservée/);
    e.activate();
    await e.controller.message(e.message('100000000000000007', '+mybot'));
    assert.match(e.replies.at(-1).content, /Aucun/);
    await e.controller.message(e.message(customerId, '+mybot'));
    assert.equal(JSON.stringify(e.replies.at(-1)).includes('CLIENT_TEST_TOKEN'), false);
    assert.ok(e.replies.at(-1).embeds.length);
});

test('help du gestionnaire en embed avec !help et +help, commandes owner visibles seulement au propriétaire', async t => {
    const e = controllerFixture(t);
    await e.controller.message(e.message(customerId, '!help'));
    const customer = e.replies.at(-1).embeds[0].toJSON();
    assert.ok(customer.fields.some(f => f.name === '+mybot'));
    assert.ok(customer.fields.every(f => !f.name.includes('create') && !f.name.includes('renew')));
    await e.controller.message(e.message(ownerId, '+help'));
    const owner = e.replies.at(-1).embeds[0].toJSON();
    assert.ok(owner.fields.some(f => f.name.includes('create')));
    assert.ok(owner.fields.some(f => f.name.includes('renew')));
    assert.equal(owner.footer.text, 'Protect Gestion');
});
test('create envoie un formulaire privé et annule la location si les MP sont bloqués', async t => {
    const e = controllerFixture(t);
    await e.controller.message(e.message(ownerId, `+create <@${customerId}> 30j`));
    assert.equal(Object.keys(e.store.read()).length, 2); assert.equal(e.sent.length, 1);
    const button = e.sent[0].components[0].toJSON().components[0];
    assert.ok(button.custom_id.startsWith('mgr:setup:'));
    e.client.users.fetch = async () => ({ bot: false, send: async () => { throw new Error('MP bloqués'); } });
    await e.controller.message(e.message(ownerId, `+create <@${customerId}> 30j`));
    assert.equal(Object.keys(e.store.read()).length, 2);
});
test('formulaire lié au client et token enregistré sans réapparaître dans les réponses', async t => {
    const e = controllerFixture(t), replies = [];
    const token = 'CLIENT_TEST_TOKEN_1234567890';
    const interaction = { customId: `mgr:submit:${e.created.id}:${e.created.nonce}`, user: { id: customerId }, isButton: () => false, isModalSubmit: () => true, fields: { getTextInputValue: key => key === 'token' ? token : ownerId }, deferReply: async () => { interaction.deferred = true; }, editReply: async payload => { replies.push(payload); }, reply: async payload => { replies.push(payload); } };
    await e.controller.interaction({ ...interaction, user: { id: ownerId } });
    assert.equal(e.store.read()[e.created.id].state, 'pending');
    await e.controller.interaction(interaction);
    assert.equal(e.store.read()[e.created.id].state, 'active');
    assert.equal(JSON.stringify(replies).includes(token), false);
    assert.equal(fs.readFileSync(e.store.file, 'utf8').includes(token), false);
});

test('un vrai processus client démarre avec son environnement filtré et s’arrête à expiration', async t => {
    const e = fixture(t); e.activate();
    fs.writeFileSync(path.join(e.source, 'index.js'), "process.on('disconnect',()=>process.exit(0)); process.send({type:'protect:ready',managed:process.env.PROTECT_MANAGED_INSTANCE,hasToken:Boolean(process.env.DISCORD_TOKEN),hasManagerToken:Boolean(process.env.PROTECT_MANAGER_TOKEN)}); setInterval(()=>{},1000);");
    const logs = [];
    const supervisor = new Supervisor(e.store, e.source, e.runtime, async () => {}, undefined, e.now, line => logs.push(line));
    t.after(() => supervisor.shutdown());
    await supervisor.tick();
    const child = [...supervisor.children.values()][0];
    const ready = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Processus client non prêt')), 5000);
        child.once('message', value => { clearTimeout(timer); resolve(value); });
        child.once('error', error => { clearTimeout(timer); reject(error); });
    });
    assert.equal(ready.managed, '1'); assert.equal(ready.hasToken, true); assert.equal(ready.hasManagerToken, false);
    assert.ok(logs.some(line => line.includes('EN LIGNE sur Discord')));
    e.advance(3600001); await supervisor.tick();
    assert.equal(supervisor.children.size, 0);
    assert.ok(logs.some(line => line.includes('HORS LIGNE (location expirée)')));
    assert.ok(logs.every(line => !line.includes('CLIENT_TEST_TOKEN')));
});

test('remove arrête le processus, retire la location et conserve les données', async t => {
    const e = fixture(t), active = e.activate(), kills = [];
    const supervisor = new Supervisor(e.store, e.source, e.runtime, async () => {}, () => {
        const child = new EventEmitter(); child.kill = signal => { kills.push(signal); queueMicrotask(() => child.emit('exit', 0)); return true; }; return child;
    }, e.now, () => {});
    await supervisor.tick();
    const folder = path.join(e.runtime, 'instances', active.id);
    fs.writeFileSync(path.join(folder, 'data/settings.json'), '{"customer":true}');
    await supervisor.remove(active.id); await supervisor.tick();
    assert.equal(supervisor.children.size, 0); assert.deepEqual(kills, ['SIGTERM']);
    assert.equal(e.store.read()[active.id], undefined);
    assert.equal(fs.readFileSync(e.store.file, 'utf8').includes('tokenCipher'), false);
    assert.equal(fs.readFileSync(path.join(folder, 'data/settings.json'), 'utf8'), '{"customer":true}');
    assert.throws(() => e.rentals.renew(active.id, duration('1h')), /introuvable/);
});

test('!remove exige le propriétaire et sa confirmation avant le retrait', async t => {
    const e = controllerFixture(t), removed = [];
    e.controller.supervisor.remove = async recordId => { removed.push(recordId); e.store.mutate(all => { delete all[recordId]; }); };
    await e.controller.message(e.message(customerId, `!remove ${e.created.id}`));
    assert.match(e.replies.at(-1).content, /réservée/);
    await e.controller.message(e.message(ownerId, `!remove <@${customerId}>`));
    const customId = e.replies.at(-1).components[0].toJSON().components[0].custom_id;
    assert.equal(removed.length, 0);
    const interaction = { customId, user: { id: customerId }, isButton: () => true, update: async () => {}, editReply: async () => {}, reply: async () => {} };
    await e.controller.interaction(interaction); assert.equal(removed.length, 0);
    await e.controller.interaction({ ...interaction, user: { id: ownerId } });
    assert.deepEqual(removed, [e.created.id]); assert.equal(e.store.read()[e.created.id], undefined);
});

test('+remove fonctionne aussi ; annulation et expiration conservent le bot', async t => {
    const e = controllerFixture(t);
    e.controller.supervisor.remove = async () => { throw new Error('Retrait non attendu'); };
    await e.controller.message(e.message(ownerId, `+remove ${e.created.id}`));
    const buttons = e.replies.at(-1).components[0].toJSON().components;
    const interaction = { customId: buttons[1].custom_id, user: { id: ownerId }, isButton: () => true, update: async () => {}, reply: async () => {}, editReply: async () => {} };
    await e.controller.interaction(interaction); assert.ok(e.store.read()[e.created.id]);
    await e.controller.message(e.message(ownerId, `!remove ${e.created.id}`));
    interaction.customId = e.replies.at(-1).components[0].toJSON().components[0].custom_id;
    e.controller.removals.get(interaction.customId.split(':')[3]).expiresAt = Date.now() - 1;
    await e.controller.interaction(interaction); assert.ok(e.store.read()[e.created.id]);
});

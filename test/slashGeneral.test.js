const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Collection, ApplicationCommandType } = require('discord.js');
const slash = require('../utils/slashGeneral');
function generalClient() {
    return { commands: new Collection(fs.readdirSync(path.join(__dirname, '../commands/general')).filter(f => f.endsWith('.js')).map(file => {
        const command = require(`../commands/general/${file}`); return [command.name, { ...command, category: command.category || 'general' }];
    })) };
}
function setup() {
    let permitted = true, publicEnabled = true, blocked = false;
    const module = { exports: {} }, edits = [], followUps = [], calls = [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/slashGeneral.js'), 'utf8'), {
        module, console: { log() {}, error() {} },
        require: name => {
            if (name === './settings') return { prefix: () => '+', blacklisted: () => blocked };
            if (name === './permissions') return { allowed: () => permitted };
            if (name === './moderation') return { publicAllowed: () => publicEnabled };
            return require(name);
        }
    });
    const collector = { on() { return collector; }, stop() {} };
    const member = { id: 'user', roles: { cache: new Collection() } }, sent = { id: 'response', createMessageComponentCollector: () => collector, edit: async () => sent };
    const client = { commands: new Collection([['calc', { name: 'calc', category: 'general', description: 'Calcul', execute: async (message, args) => { calls.push(args); await message.reply({ content: args.join(' ') }); } }]]) };
    const interaction = { id: 'interaction', client, commandName: 'calc', guild: { members: { fetch: async () => member } }, channel: { id: 'channel' }, user: { id: 'user' }, createdTimestamp: Date.now(), isChatInputCommand: () => true,
        options: { getString: () => '2 + 3' }, deferReply: async () => {}, editReply: async payload => { edits.push(payload); return sent; }, followUp: async payload => { followUps.push(payload); return sent; }, reply: async payload => { edits.push(payload); } };
    return { api: module.exports, client, interaction, member, sent, edits, followUps, calls, deny: () => { permitted = false; }, disablePublic: () => { publicEnabled = false; }, block: () => { blocked = true; } };
}
test('27 commandes Général valides, options typées et aucun owner ni alias caché', () => {
    const client = generalClient(), commands = slash.commands(client);
    assert.equal(commands.size, 27);
    assert.equal(commands.has('crowbots'), false);
    for (const command of commands.values()) {
        const data = slash.definition(command);
        assert.equal(data.name, command.name);
        assert.ok(data.description.length <= 100);
        assert.deepEqual(data.contexts, [0]);
    }
    const role = slash.definition(commands.get('role')).options[0];
    assert.equal(role.type, 8); assert.equal(role.required, true);
    assert.deepEqual(slash.definition(commands.get('server')).options.map(o => o.name), ['pic', 'banner']);
    assert.equal(slash.definition(commands.get('suggestion')).options[0].max_length, 2000);
});
test('options slash traduites en arguments des commandes préfixées', () => {
    assert.deepEqual(slash.argumentsFor({ commandName: 'role', options: { getRole: () => ({ id: 'role123' }) } }), ['role123']);
    assert.deepEqual(slash.argumentsFor({ commandName: 'pic', options: { getUser: () => null } }), []);
    assert.deepEqual(slash.argumentsFor({ commandName: 'search', options: { getSubcommand: () => 'wiki', getString: () => 'Tour Eiffel' } }), ['wiki', 'Tour Eiffel']);
    assert.deepEqual(slash.argumentsFor({ commandName: 'tempvoc', options: { getSubcommand: () => 'limit', getInteger: () => 0 } }), ['limit', '0']);
    assert.deepEqual(slash.argumentsFor({ commandName: 'tempvoc', options: { getSubcommand: () => 'info' } }), []);
});
test('slash exécute la commande existante et renvoie un Message utilisable par les menus', async () => {
    const e = setup(), original = e.client.commands.get('calc');
    assert.equal(await e.api.handle(e.interaction), true);
    assert.equal(e.calls[0][0], '2 + 3');
    assert.equal(e.edits[0].content, '2 + 3');
    assert.equal(e.client.commands.get('calc'), original);
    const message = e.api.messageAdapter(e.interaction, e.member, []);
    assert.equal(await message.reply('Premier'), e.sent);
    assert.equal(await message.reply('Suite'), e.sent);
    assert.equal(e.followUps.length, 1);
});
test('permissions, commandes publiques désactivées et blacklist restent appliquées', async () => {
    for (const action of ['deny', 'disablePublic', 'block']) {
        const e = setup(); e[action](); await e.api.handle(e.interaction);
        assert.equal(e.calls.length, 0); assert.ok(e.edits.length);
    }
});
test('enregistrement conserve les commandes existantes et évite de réécrire celles déjà à jour', async () => {
    const created = [], e = setup();
    e.client.commands.set('ping', { name: 'ping', description: 'Ping', category: 'general', execute() {} });
    const entries = new Collection([['calc', { name: 'calc', type: ApplicationCommandType.ChatInput, equals: () => true }], ['report', { name: 'Signaler le message', type: ApplicationCommandType.Message }]]);
    e.client.application = { commands: { fetch: async () => entries, create: async data => { created.push(data); } } };
    await e.api.register(e.client);
    assert.deepEqual(created.map(c => c.name), ['ping']);
    assert.equal(entries.has('report'), true);
});
test('une commande sans réponse reçoit un accusé au lieu de rester en chargement', async () => {
    const e = setup(); e.client.commands.set('suggestion', { name: 'suggestion', category: 'general', execute: async () => {} });
    e.interaction.commandName = 'suggestion';
    await e.api.handle(e.interaction);
    assert.match(e.edits[0].content, /effectuée/);
});

test('help en slash conserve son menu interactif avec les flèches seules', async () => {
    const e = setup();
    e.client.commands.set('help', { ...require('../commands/general/help'), category: 'general' });
    e.interaction.commandName = 'help';
    await e.api.handle(e.interaction);
    assert.ok(e.edits[0].embeds.length);
    const buttons = e.edits[0].components.at(-1).toJSON().components;
    assert.deepEqual(buttons.slice(0, 2).map(button => button.emoji.name), ['⬅️', '➡️']);
    assert.ok(buttons.slice(0, 2).every(button => !button.label));
});

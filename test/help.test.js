const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Collection } = require('discord.js');
const load = require('../utils/loadCommands');
const pages = require('../utils/helpPages');

test('chargement récursif, catégories et visibilité owner', () => {
    const client = { commands: new Collection(), ownerCommands: new Collection() };
    load(client, path.join(__dirname, '../commands'));
    assert.ok(client.commands.has('help'));
    assert.ok(client.commands.has('ping'));
    assert.ok(client.ownerCommands.has('setprefix'));
    assert.equal(client.commands.get('ping').category, 'general');
    assert.equal(pages(client, false, '+')[0].category, 'general');
    assert.equal(pages(client, true, '+')[0].category, 'general');
    const expectedOrder = ['general', 'Antiraid', 'Gestion du serveur', 'Configuration du serveur', 'Logs', 'Paramètres de modération', 'Modération'];
    assert.deepEqual(pages(client, false, '+').map(page => page.category), expectedOrder);
    assert.deepEqual(pages(client, true, '+').map(page => page.category), [...expectedOrder, 'owners']);
    assert.ok(pages(client, false, '+').find(page => page.category === 'general').description.includes('+tempvoc'));
    assert.ok(!pages(client, false, '+').some(page => page.description.includes('+custom <')));
    const ownerPage = pages(client, true, '+').find(page => page.category === 'owners');
    assert.ok((ownerPage.attachment || ownerPage.description).includes('+custom <mot-clé>'));
    assert.ok(!pages(client, false, '?').some(page => page.description.includes('setprefix')));
    assert.ok(pages(client, true, '?').some(page => page.description.includes('?setprefix <préfixe>')));
    for (let i = 0; i < 60; i++) client.commands.set(`new${i}`, { name: `new${i}`, category: 'moderation', description: 'x'.repeat(500) });
    const result = pages(client, false, '?');
    assert.equal(result.filter(page => page.category === 'moderation').length, 1);
    assert.ok(result.every(page => page.description.length <= 3800));
    assert.ok(result.some(page => (page.attachment || page.description).includes('?new59')));
    const actual = pages(client, true, '?').filter(page => page.category !== 'moderation');
    assert.equal(actual.length, 8);
    assert.ok(actual.every(page => !page.attachment));
    assert.ok(actual.find(page => page.category === 'owners').description.includes('?resetall'));
});

test('boutons, préfixe personnalisé, autre utilisateur et fermeture', async t => {
    const settings = require('../utils/settings');
    const originalRead = settings.read;
    settings.read = () => ({ ...originalRead(), helpType: 'button' });
    t.after(() => { settings.read = originalRead; });
    const callbacks = {};
    let payload, update, denied;
    const collector = { on: (event, callback) => { callbacks[event] = callback; }, stop: () => {} };
    const message = {
        author: { id: 'test-user' },
        reply: async value => { payload = value; return { createMessageComponentCollector: () => collector, edit: async value => { payload = value; } }; }
    };
    const client = {
        commands: new Map([['help', { name: 'help', category: 'general' }], ['ban', { name: 'ban', category: 'moderation' }]]),
        ownerCommands: new Map()
    };
    await require('../commands/general/help').execute(message, [], client, { prefix: '?' });
    assert.ok(payload.embeds[0].toJSON().description.includes('?help'));
    const buttons = payload.components[0].toJSON().components;
    assert.equal(buttons.length, 3);
    assert.deepEqual(buttons.slice(0, 2).map(button => button.emoji.name), ['⬅️', '➡️']);
    assert.ok(buttons.slice(0, 2).every(button => !button.label));
    const interaction = { user: { id: 'test-user' }, customId: 'help:next', update: async value => { update = value; } };
    await callbacks.collect(interaction);
    assert.ok(update.embeds[0].toJSON().description.includes('?ban'));
    await callbacks.collect({ user: { id: 'other' }, reply: async value => { denied = value; } });
    assert.equal(denied.flags, 64);
    interaction.customId = 'help:previous';
    await callbacks.collect(interaction);
    assert.ok(update.embeds[0].toJSON().description.includes('?help'));
    interaction.customId = 'help:close';
    await callbacks.collect(interaction);
    assert.ok(update.components[0].toJSON().components.every(button => button.disabled));
    await callbacks.end();
    assert.ok(payload.components[0].toJSON().components.every(button => button.disabled));
});

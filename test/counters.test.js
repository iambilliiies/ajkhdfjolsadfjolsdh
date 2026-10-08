const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const discord = require('discord.js');
function setup(fail = false) {
    const state = {}, channels = new Map(); let sequence = 0;
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/counters.js'), 'utf8'), {
        module, require: name => name === 'discord.js' ? discord : { get: () => state, mutate: (id, change) => change(state) }, setInterval, console
    });
    const humans = [
        { user: { bot: false }, presence: { status: 'online' }, voice: { channelId: 'voice' } },
        { user: { bot: false }, presence: { status: 'offline' }, voice: {} },
        { user: { bot: true }, presence: { status: 'online' }, voice: { channelId: 'voice' } }
    ];
    const guild = { id: 'guild', memberCount: 3, members: { me: { id: 'bot', permissions: { has: () => true } }, cache: new Map(humans.map((member, i) => [i, member])), fetch: async () => {} }, channels: {
        fetch: async () => channels,
        create: async options => {
            if (fail && sequence === 2) throw new Error('Création refusée');
            const channel = { ...options, id: String(++sequence), setName: async name => { channel.name = name; }, delete: async () => { channels.delete(channel.id); } };
            channels.set(channel.id, channel); return channel;
        }
    } };
    return { counters: module.exports, guild, channels, state, humans };
}
test('counter crée une catégorie et trois vocaux, exclut les bots et réutilise les salons', async () => {
    const { counters, guild, channels, state, humans } = setup();
    await counters.update(guild, true);
    assert.equal(channels.size, 4);
    assert.equal(channels.get(state.counters.members).name, '👥 Membres : 2');
    assert.equal(channels.get(state.counters.active).name, '🟢 Membres actifs : 1');
    assert.equal(channels.get(state.counters.voice).name, '🔊 Membres en vocal : 1');
    assert.ok(channels.get(state.counters.voice).permissionOverwrites[0].deny.includes(discord.PermissionFlagsBits.Connect));
    humans[1].presence.status = 'idle';
    await counters.update(guild, true);
    assert.equal(channels.size, 4);
    assert.equal(channels.get(state.counters.active).name, '🟢 Membres actifs : 2');
    channels.delete(state.counters.voice);
    await counters.update(guild, true);
    assert.equal(channels.size, 4);
});
test('counter annule une création partielle sans enregistrer de configuration', async () => {
    const { counters, guild, channels, state } = setup(true);
    await assert.rejects(counters.update(guild, true), /Création refusée/);
    assert.equal(channels.size, 0);
    assert.equal(state.counters, undefined);
});

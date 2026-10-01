const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('annonces envoyées une fois par version, et réessayées après échec', async () => {
    const filename = path.join(__dirname, '../utils/updateAnnouncements.js');
    const notesFile = path.join(__dirname, '../data/changelogs.json');
    const files = new Map([[notesFile, JSON.stringify([{ version: '1.0', date: '2026-10-01', changes: ['Test'] }])]]);
    function load() {
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
            module, __dirname: path.dirname(filename), console: { error() {} },
            require: name => name === 'node:fs' ? {
                existsSync: file => files.has(file), readFileSync: file => files.get(file), mkdirSync() {},
                writeFileSync: (file, text) => files.set(file, text),
                renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); }
            } : name === '../config.json' ? { updateChannelId: 'target' } : name === './general' ? { embed: (title, text) => ({ title, text }) } : require(name)
        });
        return module.exports;
    }
    let sent = 0;
    const client = { channels: { fetch: async id => {
        assert.equal(id, 'target');
        return { isTextBased: () => true, send: async () => { sent++; } };
    } } };
    await load().publish(client);
    await load().publish(client);
    assert.equal(sent, 1);
    files.set(notesFile, JSON.stringify([{ version: '2.0', changes: ['Next'] }]));
    const failed = { channels: { fetch: async () => { throw new Error('offline'); } } };
    await load().publish(failed);
    await load().publish(client);
    assert.equal(sent, 2);
});

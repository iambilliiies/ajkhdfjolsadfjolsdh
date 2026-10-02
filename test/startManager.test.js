const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const start = require('../utils/startManager');
function setup(env = { PROTECT_MANAGER_TOKEN: 'MANAGER_TEST_TOKEN' }) {
    const host = new EventEmitter(), child = new EventEmitter(), calls = [], logs = [];
    host.env = env; host.exit = () => {};
    child.exitCode = null; child.signalCode = null;
    child.kill = signal => { child.signalCode = signal; calls.push(signal); child.emit('exit', null); return true; };
    const client = { destroy: () => calls.push('destroy') };
    return { host, child, client, calls, logs, options: { process: host, log: text => logs.push(text), spawn: (file, args, options) => { calls.push({ file, options }); return child; } } };
}
test('node index démarre le gestionnaire séparément et conserve les logs du terminal', () => {
    const e = setup();
    assert.equal(start('/protect', e.client, e.options), e.child);
    assert.ok(e.calls[0].file.endsWith('manager/index.js') || e.calls[0].file.endsWith('manager\\index.js'));
    assert.deepEqual(e.calls[0].options.stdio, ['ignore', 'inherit', 'inherit', 'ipc']);
    e.child.emit('exit', 1);
    assert.equal(e.calls.includes('destroy'), false);
    assert.ok(e.logs.at(-1).includes('manager/config.json'));
});
test('aucun gestionnaire démarré dans une copie cliente ni doublon avec start:both', () => {
    for (const env of [{ PROTECT_MANAGED_INSTANCE: '1' }, { PROTECT_MANAGER_EXTERNAL: '1' }]) {
        const e = setup(env); assert.equal(start('/protect', e.client, e.options), null); assert.equal(e.calls.length, 0);
    }
});
test('arrêter le processus principal arrête aussi son gestionnaire', () => {
    const e = setup(); start('/protect', e.client, e.options);
    e.host.emit('SIGTERM');
    assert.ok(e.calls.includes('destroy')); assert.ok(e.calls.includes('SIGTERM'));
});

test('sans token gestionnaire, aucun second processus ni arrêt de Protect', () => {
    const e = setup({});
    assert.equal(start('/dossier-inexistant-protect', e.client, e.options), null);
    assert.equal(e.calls.length, 0);
    assert.ok(e.logs[0].includes('Protect continue seul'));
});

test('hébergement refusant un second processus : Protect reste lancé', () => {
    const e = setup(); e.options.spawn = () => { throw new Error('EAGAIN'); };
    assert.equal(start('/protect', e.client, e.options), null);
    assert.equal(e.calls.includes('destroy'), false);
    assert.ok(e.logs.at(-1).includes('Protect continue'));
});

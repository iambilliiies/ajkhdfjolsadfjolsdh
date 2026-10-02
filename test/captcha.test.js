const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function setup() {
    let now = Date.now(), modal, grants = 0;
    const state = { captcha: { enabled: true, channelId: 'channel', roleId: 'verified', messageId: 'panel' } };
    const module = { exports: {} }, role = { id: 'verified', safe: true };
    const guild = { id: 'guild', roles: { fetch: async () => role }, members: { fetch: async () => ({ roles: { cache: new Map(), add: async () => { grants++; } } }) } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/captcha.js'), 'utf8'), {
        module, Date: class extends Date { static now() { return now; } },
        require: name => {
            if (name === './serverConfigStore') return { get: () => state };
            if (name === './managementTools') return { guard: () => { throw new Error('Administrateur requis'); } };
            if (name === './general') return {};
            if (name === './serverConfigInteractions') return { safeRole: r => r.safe };
            return require(name);
        }
    });
    const button = { customId: 'captcha:open', guild, channelId: 'channel', message: { id: 'panel' }, user: { id: 'alice' }, isButton: () => true, isModalSubmit: () => false, showModal: async value => { modal = value.toJSON(); } };
    const answer = (value, userId = 'alice') => ({ ...button, customId: modal.custom_id, user: { id: userId }, isButton: () => false, isModalSubmit: () => true, fields: { getTextInputValue: () => value }, deferReply: async () => {}, editReply: async () => {} });
    return { api: module.exports, state, role, button, answer, solution: () => String(modal.components[0].components[0].label.match(/\d+/g).reduce((sum, n) => sum + Number(n), 0)), grants: () => grants, advance: ms => { now += ms; } };
}
test('captcha lié au membre, utilisable une seule fois et rôle attribué après réussite', async () => {
    const e = setup(); await e.api.handle(e.button);
    await assert.rejects(e.api.handle(e.answer(e.solution(), 'bob')), /introuvable/);
    assert.equal(e.grants(), 0);
    await e.api.handle(e.answer(e.solution()));
    assert.equal(e.grants(), 1);
    await assert.rejects(e.api.handle(e.answer(e.solution())), /introuvable/);
});
test('mauvaise réponse, délai et expiration empêchent l’attribution', async () => {
    const e = setup(); await e.api.handle(e.button);
    await assert.rejects(e.api.handle(e.answer('0')), /incorrecte/);
    await assert.rejects(e.api.handle(e.button), /30 secondes/);
    e.advance(31000); await e.api.handle(e.button); e.advance(121000);
    await assert.rejects(e.api.handle(e.answer(e.solution())), /expiré/);
    assert.equal(e.grants(), 0);
});
test('captcha désactivé, panneau remplacé ou rôle devenu dangereux refusés', async () => {
    const e = setup();
    await assert.rejects(e.api.handle({ ...e.button, message: { id: 'old' } }), /remplacé/);
    await e.api.handle(e.button); e.role.safe = false;
    await assert.rejects(e.api.handle(e.answer(e.solution())), /attribuable/);
    e.state.captcha.enabled = false;
    await assert.rejects(e.api.handle(e.button), /désactivé/);
    assert.equal(e.grants(), 0);
    await assert.rejects(e.api.configure({}, []), /Administrateur/);
});

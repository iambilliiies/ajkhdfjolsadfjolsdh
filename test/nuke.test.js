const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { ChannelType } = require('discord.js');
function setup(options = {}) {
    let authorized = !options.nonOwner;
    const actions = [], confirmations = [], module = { exports: {} };
    const clone = { id: 'new', setPosition: async position => actions.push(['position', position]), delete: async () => actions.push(['rollback']), send: async payload => actions.push(['send', payload]) };
    const channel = { id: 'old', name: 'test', type: ChannelType.GuildText, rawPosition: 3, permissionsFor: () => ({ has: () => !options.noPermission }), clone: async () => { actions.push(['clone']); return clone; }, delete: async () => { if (options.deleteFailure) throw new Error('Suppression refusée'); actions.push(['delete']); } };
    const message = { author: { id: 'owner' }, channel, guild: { members: { me: {} }, channels: { fetch: async () => channel } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../commands/owners/nuke.js'), 'utf8'), { module, require: name => name === '../../utils/settings' ? { isOwner: () => authorized } : name === '../../utils/managementTools' ? { channel: async () => channel } : name === '../../utils/ownerUI' ? { confirm: async (m, text, action) => confirmations.push(action) } : name === '../../utils/general' ? { embed: (title, description) => ({ title, description }) } : require(name) });
    return { command: module.exports, message, actions, confirmations, revoke: () => { authorized = false; } };
}
test('nuke owner : aucune suppression avant confirmation, position conservée', async () => {
    const s = setup(); await s.command.execute(s.message, []); assert.equal(s.actions.length, 0);
    const result = await s.confirmations[0](); assert.equal(result.completionHandled, true); assert.deepEqual(s.actions.map(a => a[0]), ['clone', 'position', 'delete', 'send']); assert.equal(s.actions[1][1], 3);
});
test('nuke refuse les non-owners et revérifie le grade après confirmation', async () => {
    const denied = setup({ nonOwner: true }); await assert.rejects(denied.command.execute(denied.message, []), /owners/);
    const s = setup(); await s.command.execute(s.message, []); s.revoke(); await assert.rejects(s.confirmations[0](), /retiré/); assert.equal(s.actions.length, 0);
});
test('nuke annule le clone si l’ancien salon ne peut pas être supprimé', async () => {
    const s = setup({ deleteFailure: true }); await s.command.execute(s.message, []); await assert.rejects(s.confirmations[0](), /Suppression refusée/); assert.ok(s.actions.some(a => a[0] === 'rollback')); assert.ok(!s.actions.some(a => a[0] === 'send'));
});

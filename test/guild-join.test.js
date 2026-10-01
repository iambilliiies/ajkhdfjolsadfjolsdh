const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EmbedBuilder, Collection } = require('discord.js');
function setup(options = {}) {
    const module = { exports: {} }, sent = [], invites = [];
    const channel = { id: 'channel', permissionsFor: () => ({ has: () => !options.noPermission }), createInvite: async args => { invites.push(args); return { url: 'https://discord.gg/test' }; } };
    const guild = { id: 'guild', name: 'Test', ownerId: 'guild-owner', memberCount: 42, members: { me: {} }, channels: { fetch: async () => new Collection([['channel', channel]]) }, iconURL: () => 'https://example.com/icon.png', client: { users: { fetch: async id => { assert.equal(id, 'bot-owner'); return { send: async payload => { if (options.closed) throw new Error('MP fermés'); sent.push(payload); } }; } } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/guildJoinNotification.js'), 'utf8'), {
        module, console: { error() {} }, require: name => name === './settings' ? { primaryOwner: () => 'bot-owner', read: () => ({ dmEnabled: !options.disabled }) } : name === './general' ? { embed: (title, description) => new EmbedBuilder().setTitle(title).setDescription(description).setFooter({ text: 'Protect' }) } : require(name)
    });
    return { notification: module.exports, guild, sent, invites };
}
test('MP au propriétaire avec couronne, serveur et invitation limitée', async () => {
    const s = setup(); await s.notification.notify(s.guild);
    const embed = s.sent[0].embeds[0].toJSON(); assert.match(embed.title, /👑 Protect/); assert.match(embed.description, /Test/); assert.ok(embed.fields.some(f => f.value.includes('https://discord.gg/test'))); assert.equal(embed.footer.text, 'Protect'); assert.equal(s.invites[0].maxAge, 86400); assert.equal(s.invites[0].maxUses, 1);
});
test('permission manquante : notification conservée sans inventer de lien', async () => {
    const s = setup({ noPermission: true }); await s.notification.notify(s.guild); assert.equal(s.invites.length, 0); assert.ok(s.sent[0].embeds[0].toJSON().fields.some(f => f.value.includes('Invitation indisponible')));
});
test('URL personnalisée utilisée et MP fermés sans bloquer le bot', async () => {
    const s = setup(); s.guild.vanityURLCode = 'serveur'; await s.notification.notify(s.guild); assert.equal(s.invites.length, 0); assert.ok(s.sent[0].embeds[0].toJSON().fields.some(f => f.value.includes('https://discord.gg/serveur')));
    const closed = setup({ closed: true }); await assert.doesNotReject(closed.notification.notify(closed.guild));
});
test('MP désactivés : aucune invitation créée et aucun envoi', async () => {
    const s = setup({ disabled: true }); await s.notification.notify(s.guild); assert.equal(s.sent.length, 0); assert.equal(s.invites.length, 0);
});

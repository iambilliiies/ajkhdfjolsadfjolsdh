const store = require('./serverConfigStore');
const triggers = ['antispam', 'antilink', 'antimassmention', 'badwords', 'piconly'];
const defaultPunishments = () => [
    { id: 'default-1', count: 3, window: 600000, action: 'mute', duration: 600000 },
    { id: 'default-2', count: 6, window: 600000, action: 'mute', duration: 3600000 },
    { id: 'default-3', count: 10, window: 3600000, action: 'kick', duration: 0 }
];
const defaults = () => ({ timeout: true, clearLimit: 100, muteRoleId: null, antispam: false, spamLimit: { count: 5, duration: 5000 }, antilink: false, linkMode: 'invite', antimassmention: false, mentionLimit: 5, badwordsEnabled: false, words: [], spamChannels: {}, linkChannels: {}, ancientAge: 7 * 86400000, strikes: Object.fromEntries(triggers.map(key => [key, { ancien: 1, nouveau: 2 }])), punishments: defaultPunishments(), noderank: [], picChannels: [], publicEnabled: true, publicChannels: {}, history: {}, applied: {} });
function get(id) { return { ...defaults(), ...store.get(id).moderation }; }
function mutate(id, action) { store.mutate(id, state => { const config = get(id); action(config); state.moderation = config; }); }
function enabled(global, overrides, id) { return Object.hasOwn(overrides, id) ? overrides[id] : global; }
module.exports = { get, mutate, enabled, defaults, triggers, defaultPunishments };

const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/server-config.json');
const defaults = () => ({ grants: {}, customCommands: {}, reminders: {}, roleMenus: {}, tickets: { enabled: false, categoryId: null, staffRoleId: null, panelChannelId: null, logChannelId: null }, openTickets: {}, tempVoice: { enabled: false, hubId: null, categoryId: null }, tempChannels: {}, joins: { enabled: false, channelId: null, message: 'Bienvenue {member} sur {server} !', roleId: null }, leaves: { enabled: false, channelId: null, message: '{user} a quitté {server}.', roleId: null }, twitch: { enabled: false, channelId: null, usernames: [], liveIds: {} }, soutien: { enabled: false, roleId: null, text: '' }, autodelete: {}, autopublish: false, suggestions: { enabled: true, channelId: null }, modmail: { enabled: false, categoryId: null }, report: { enabled: false, logChannelId: null, commandId: null }, showPics: { enabled: false, channelId: null, interval: 3600000, nextAt: 0 } });
function read() {
    if (!fs.existsSync(file)) return { guilds: {}, modmailGuildId: null };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || !data.guilds || Array.isArray(data.guilds)) throw new Error('server-config.json invalide');
    return data;
}
function get(id) { const base = defaults(), saved = read().guilds[id] || {}; return { ...base, ...saved }; }
function write(data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2)); fs.renameSync(`${file}.tmp`, file); }
function mutate(id, action) { const data = read(), state = { ...defaults(), ...data.guilds[id] }; action(state, data); data.guilds[id] = state; write(data); return state; }
function reset(id) { const data = read(); delete data.guilds[id]; if (data.modmailGuildId === id) data.modmailGuildId = null; write(data); }
function granted(message, commandName, permission) {
    if (!message.guild) return false;
    const grants = get(message.guild.id).grants;
    return [`command:${commandName}`, `permission:${permission}`].some(key => {
        const grant = grants[key];
        return grant && (grant.users.includes(message.author.id) || grant.roles.some(id => message.member?.roles.cache.has(id)));
    });
}
module.exports = { defaults, read, get, mutate, reset, granted };

const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/management.json');
const defaults = () => ({ giveaways: {}, lastGiveaway: null, tempRoles: {}, backups: { serveur: {}, emoji: {} }, autoBackups: {}, autoReacts: {}, forms: {}, tickets: {} });
function read() {
    if (!fs.existsSync(file)) return {};
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('management.json invalide');
    return data;
}
function get(guildId) { return { ...defaults(), ...read()[guildId] }; }
function mutate(guildId, change) {
    const data = read(), state = { ...defaults(), ...data[guildId] };
    change(state); data[guildId] = state;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
    return state;
}
function reset(guildId) {
    // Les backups et tâches déjà promises sont conservés : un rôle temporaire
    // ne doit pas devenir permanent à cause d’une réinitialisation de réglages.
    mutate(guildId, state => Object.assign(state, { ...defaults(), backups: state.backups, giveaways: state.giveaways, lastGiveaway: state.lastGiveaway, tempRoles: state.tempRoles }));
}
module.exports = { read, get, mutate, reset, defaults };

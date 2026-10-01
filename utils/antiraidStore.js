const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../data/antiraid.json');
const features = ['antitoken', 'antiupdate', 'antichannel', 'antirole', 'antiwebhook', 'antiunban', 'antibot', 'antiban', 'antieveryone', 'antideco', 'blrank'];
const defaults = () => ({ modes: Object.fromEntries(features.map(name => [name, 'off'])), punishments: Object.fromEntries(features.map(name => [name, 'derank'])), limits: { antitoken: { count: 5, duration: 10000 }, antiban: { count: 3, duration: 10000 }, antieveryone: { count: 3, duration: 10000 }, antideco: { count: 3, duration: 10000 } }, logEnabled: false, logChannelId: null, pingRoleIds: [], whitelist: [], rankBlacklist: [], roleScope: 'danger', rankScope: 'danger', creationAge: 0, joinLock: false, blockedUntil: 0 });
function readAll() {
    if (!fs.existsSync(file)) return {};
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('antiraid.json invalide');
    return data;
}
function get(id) {
    const base = defaults(), stored = readAll()[id] || {};
    return { ...base, ...stored, modes: { ...base.modes, ...stored.modes }, punishments: { ...base.punishments, ...stored.punishments }, limits: { ...base.limits, ...stored.limits } };
}
function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
}
function save(id, patch) { const data = readAll(); data[id] = { ...get(id), ...patch }; write(data); return data[id]; }
function reset(id) { const data = readAll(); delete data[id]; write(data); }
function resetAll() { write({}); }
function duration(value) {
    const match = String(value || '').match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|j)?$/i);
    if (!match) throw new Error('Durée invalide : utilise 10s, 5m, 2h, 7j. Sans unité, la durée est en secondes.');
    const units = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, j: 86400000 };
    const result = Number(match[1]) * units[match[2]?.toLowerCase() || 's'];
    if (!Number.isSafeInteger(result) || result < 0 || result > 365 * 86400000) throw new Error('La durée doit être comprise entre 0 et 365 jours.');
    return result;
}
function limit(value) {
    const [countText, time, extra] = String(value).split('/');
    const count = Number(countText), timeMs = duration(time);
    if (extra || !/^\d+$/.test(countText) || count < 1 || count > 1000 || timeMs < 1000 || timeMs > 3600000) throw new Error('Sensibilité : nombre/durée, de 1 à 1000 événements sur 1s à 1h. Exemple : 5/10s.');
    return { count, duration: timeMs };
}
module.exports = { features, defaults, get, save, reset, resetAll, duration, limit, file };

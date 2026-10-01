const fs = require('node:fs');
const path = require('node:path');
const management = require('./managementStore');
const file = path.join(__dirname, '../data/backups.json');
function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
}
function read() {
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { backups: { serveur: {}, emoji: {} }, migrated: [] };
    if (!data?.backups?.serveur || !data.backups.emoji || !Array.isArray(data.migrated)) throw new Error('backups.json invalide');
    let changed = false;
    for (const [guildId, state] of Object.entries(management.read())) {
        for (const kind of ['serveur', 'emoji']) for (const [name, record] of Object.entries(state.backups?.[kind] || {})) {
            const key = JSON.stringify([guildId, kind, name]);
            if (data.migrated.includes(key)) continue;
            let target = name, suffix = 1;
            while (Object.hasOwn(data.backups[kind], target)) target = `${name.slice(0, 40)} ${guildId} ${suffix++}`.slice(0, 64);
            Object.defineProperty(data.backups[kind], target, { value: record, enumerable: true, writable: true, configurable: true });
            data.migrated.push(key); changed = true;
        }
    }
    if (changed) write(data);
    return data;
}
function get(kind) { return read().backups[kind]; }
function mutate(kind, change) { const data = read(); change(data.backups[kind]); write(data); }
module.exports = { get, mutate };

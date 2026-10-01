const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.json');
const file = path.join(__dirname, '../data/settings.json');
const defaults = () => ({ theme: 0xED1515, owners: null, blacklist: {}, permissions: {}, aliases: {}, helpAlias: true, helpType: 'button', mainPrefix: null, status: 'online', activity: { type: 0, messages: ['EN DEV'] }, dmEnabled: true, secureInvite: false, language: 'fr', customLanguageEnabled: false, customLanguage: {}, autoUpdate: false, fivem: null });
let state;
function read() {
    if (!state) {
        state = defaults();
        if (config.fivemServer) {
            const url = new URL(config.fivemServer);
            const join = url.hostname === 'cfx.re' && url.pathname.match(/^\/join\/([a-z0-9]+)\/?$/i);
            state.fivem = join ? { joinCode: join[1], url: url.href } : { endpoint: url.origin, url: url.origin };
        }
        if (fs.existsSync(file)) {
            const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('settings.json invalide');
            state = { ...state, ...stored };
        }
    }
    return state;
}
function save(change) {
    const next = { ...read(), ...change };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
    fs.renameSync(`${file}.tmp`, file);
    state = next;
    return state;
}
const primaryOwner = () => config.owners?.[0];
const owners = () => [...new Set([primaryOwner(), ...(read().owners ?? config.owners ?? [])].filter(Boolean))];
const isOwner = id => owners().includes(id);
const theme = () => read().theme;
const prefix = () => read().mainPrefix || config.defaultPrefix || '+';
const blacklisted = id => Object.hasOwn(read().blacklist, id);
module.exports = { read, save, defaults, owners, isOwner, primaryOwner, theme, prefix, blacklisted, file };

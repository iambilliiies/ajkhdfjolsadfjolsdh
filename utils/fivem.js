const settings = require('./settings');
const { json } = require('./general');
function parse(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Adresse HTTP(S) invalide.');
    const join = url.hostname === 'cfx.re' && url.pathname.match(/^\/join\/([a-z0-9]+)\/?$/i);
    if (join) return { joinCode: join[1], url: `https://cfx.re/join/${join[1]}` };
    if (url.hostname === 'cfx.re') throw new Error('Lien Cfx invalide. Utilise https://cfx.re/join/code.');
    return { endpoint: url.origin, url: url.origin };
}
async function status(target = settings.read().fivem) {
    if (!target) throw new Error('Aucun serveur connecté. Utilise fivem <adresse ou lien Cfx>.');
    if (target.joinCode) {
        // L’API de la liste Cfx peut refuser l’accès ; une adresse directe reste utilisable.
        const result = await json(`https://frontend.cfx-services.net/api/servers/single/${encodeURIComponent(target.joinCode)}`);
        const data = result.Data;
        if (!data) throw new Error('Serveur Cfx introuvable.');
        return { name: data.hostname || data.vars?.sv_projectName || target.joinCode, players: data.clients ?? data.players?.length ?? '?', max: data.sv_maxclients ?? data.vars?.sv_maxClients ?? '?', url: target.url };
    }
    const [info, dynamic] = await Promise.all([json(`${target.endpoint}/info.json`), json(`${target.endpoint}/dynamic.json`)]);
    return { name: dynamic.hostname || info.vars?.sv_projectName || 'FiveM', players: dynamic.clients ?? '?', max: dynamic.sv_maxclients ?? info.vars?.sv_maxClients ?? '?', url: target.url };
}
module.exports = { parse, status };

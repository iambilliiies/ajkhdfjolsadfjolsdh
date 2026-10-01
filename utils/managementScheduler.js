const store = require('./managementStore');
let busy = false;
async function tick(client) {
    if (busy) return;
    busy = true;
    try {
        for (const [guildId, state] of Object.entries(store.read())) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;
            for (const [id, record] of Object.entries(state.giveaways || {})) if (!record.ended && record.endsAt <= Date.now() && (!record.retryAt || record.retryAt <= Date.now())) {
                try { await require('./giveaways').finish(guild, id); }
                catch (error) {
                    console.error(`Giveaway ${id} :`, error.message);
                    store.mutate(guildId, current => { if (current.giveaways[id]) current.giveaways[id].retryAt = Date.now() + 60000; });
                }
            }
            for (const [key, record] of Object.entries(state.tempRoles || {})) if (record.expiresAt <= Date.now() && (!record.retryAt || record.retryAt <= Date.now())) {
                try {
                    // Re-vérifie pour ne pas retirer un rôle dont la durée vient d’être prolongée.
                    const current = store.get(guildId).tempRoles[key];
                    if (!current || current.expiresAt > Date.now()) continue;
                    let member;
                    try { member = await guild.members.fetch(record.userId); }
                    catch (error) { if (error.code !== 10007) throw error; }
                    if (member && member.roles.cache.has(record.roleId)) await member.roles.remove(record.roleId, 'Expiration rôle temporaire');
                    store.mutate(guildId, current => { delete current.tempRoles[key]; });
                } catch (error) {
                    console.error('Expiration rôle temporaire :', error.message);
                    store.mutate(guildId, current => { if (current.tempRoles[key]) current.tempRoles[key].retryAt = Date.now() + 60000; });
                }
            }
            for (const [kind, schedule] of Object.entries(state.autoBackups || {})) if (schedule.nextAt <= Date.now()) {
                try {
                    await require('./backups').create(guild, kind, `automatique ${guild.id}`, true);
                    store.mutate(guildId, current => { if (current.autoBackups[kind]) current.autoBackups[kind].nextAt = Date.now() + schedule.days * 86400000; });
                } catch (error) {
                    console.error('Backup automatique :', error.message);
                    store.mutate(guildId, current => { if (current.autoBackups[kind]) current.autoBackups[kind].nextAt = Date.now() + 3600000; });
                }
            }
        }
    } finally { busy = false; }
}
function start(client) {
    for (const guildId of Object.keys(store.read())) store.mutate(guildId, state => {
        for (const record of Object.values(state.giveaways)) record.ending = false;
    });
    if (client.managementTimer) clearInterval(client.managementTimer);
    client.managementTimer = setInterval(() => tick(client).catch(error => console.error('Planificateur gestion :', error.message)), 15000);
    client.managementTimer.unref();
    return tick(client);
}
module.exports = { start, tick };

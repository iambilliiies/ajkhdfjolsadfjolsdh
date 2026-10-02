const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const sourceFiles = ['index.js', 'package.json', 'package-lock.json'];
function prepare(source, runtime, record) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(record.id) || !/^\d{15,22}$/.test(record.ownerId)) throw new Error('Identité de location invalide.');
    const folder = path.join(runtime, 'instances', record.id);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    // Une copie neuve n’inclut jamais les données, tokens ni le Git du propriétaire.
    if (!fs.existsSync(path.join(folder, '.source-ready'))) {
        for (const file of sourceFiles) fs.copyFileSync(path.join(source, file), path.join(folder, file));
        for (const dir of ['commands', 'events', 'utils']) fs.cpSync(path.join(source, dir), path.join(folder, dir), { recursive: true, dereference: false });
        fs.mkdirSync(path.join(folder, 'data'), { recursive: true, mode: 0o700 });
        fs.copyFileSync(path.join(source, 'data/changelogs.json'), path.join(folder, 'data/changelogs.json'));
        fs.writeFileSync(path.join(folder, '.source-ready'), '1', { mode: 0o600 });
    }
    const config = { token: '', defaultPrefix: '+', owners: [record.ownerId], supportInvite: 'https://discord.gg/KX5bGypTVh' };
    fs.writeFileSync(path.join(folder, 'config.json'), JSON.stringify(config, null, 2), { mode: 0o600 });
    return folder;
}
class Supervisor {
    constructor(store, source, runtime, notify, spawn = fork, now = Date.now) {
        Object.assign(this, { store, source, runtime, notify, spawn, now });
        this.children = new Map(); this.stopping = false; this.busy = false;
    }
    async stop(id) {
        const child = this.children.get(id);
        if (!child) return;
        await new Promise(resolve => {
            const timer = setTimeout(() => { child.kill('SIGKILL'); }, 5000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
            child.kill('SIGTERM');
        });
    }
    launch(record) {
        const folder = prepare(this.source, this.runtime, record);
        const token = this.store.decrypt(record.tokenCipher);
        // Le processus client ne reçoit ni token gestionnaire ni secrets Google/Twitch du parent.
        const env = {};
        for (const key of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'SystemRoot', 'TEMP', 'TMP', 'LANG', 'TZ']) if (process.env[key]) env[key] = process.env[key];
        env.DISCORD_TOKEN = token;
        env.PROTECT_MANAGED_INSTANCE = '1';
        const child = this.spawn(path.join(folder, 'index.js'), [], { cwd: folder, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        this.children.set(record.id, child);
        child.on('message', message => {
            if (message?.type !== 'protect:ready') return;
            this.store.mutate(all => { if (all[record.id]?.state === 'active') Object.assign(all[record.id], { lastReadyAt: this.now(), retries: 0 }); });
        });
        const failed = () => {
            if (this.children.get(record.id) !== child) return;
            this.children.delete(record.id);
            if (this.stopping) return;
            this.store.mutate(all => {
                const r = all[record.id];
                if (!r || r.state !== 'active' || r.expiresAt <= this.now()) return;
                r.retries = (r.retries || 0) + 1; r.retryAt = this.now() + 60000;
                if (r.retries >= 3) r.state = 'failed';
            });
        };
        child.on('error', failed); child.on('exit', failed);
    }
    async tick() {
        if (this.busy || this.stopping) return;
        this.busy = true;
        const notices = [];
        try {
            for (const snapshot of Object.values(this.store.read())) {
                if (this.stopping) break;
                const record = this.store.read()[snapshot.id];
                if (!record) continue;
                if (!record.tokenCipher) continue;
                if (record.expiresAt <= this.now()) {
                    this.store.mutate(all => { if (all[record.id]) all[record.id].state = 'expired'; });
                    await this.stop(record.id);
                    const latest = this.store.read()[record.id];
                    if (latest?.expiresAt > this.now()) continue;
                    if (!latest?.expiryNotified) {
                        this.store.mutate(all => { all[record.id].expiryNotified = true; });
                        notices.push(record);
                    }
                } else if (record.state === 'active' && !this.children.has(record.id) && (!record.retryAt || record.retryAt <= this.now())) {
                    try { this.launch(record); }
                    catch { this.store.mutate(all => { all[record.id].state = 'failed'; }); }
                }
            }
        } finally { this.busy = false; }
        // Une panne des MP ne retarde pas le contrôle des autres échéances.
        await Promise.allSettled(notices.map(record => this.notify(record)));
    }
    async shutdown() { this.stopping = true; await Promise.all([...this.children.keys()].map(id => this.stop(id))); }
}
module.exports = { Supervisor, prepare };

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const run = promisify(execFile);
const root = path.join(__dirname, '..');
let running = false;
async function update(client) {
    if (running) throw new Error('Une mise à jour est déjà en cours.');
    running = true;
    const git = async args => (await run('git', args, { cwd: root, timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout.trim();
    try {
        await git(['rev-parse', '--is-inside-work-tree']);
        if (await git(['status', '--porcelain'])) throw new Error('Des modifications locales existent. Enregistre-les avant de mettre à jour.');
        const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
        if (branch === 'HEAD') throw new Error('Le dépôt doit être sur une branche.');
        const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
        await git(['fetch', '--prune']);
        const before = await git(['rev-parse', 'HEAD']);
        await git(['merge', '--ff-only', upstream]);
        const after = await git(['rev-parse', 'HEAD']);
        if (before !== after && client) await require('./updateAnnouncements').publish(client);
        return before === after ? 'Le bot est déjà à jour.' : 'Mise à jour installée. Relance npm install si les dépendances ont changé, puis redémarre le bot.';
    } catch (error) {
        if (error.code === 'ENOENT') throw new Error('Git est introuvable. Installe Git pour utiliser les mises à jour.');
        if (String(error.stderr || '').includes('not a git repository')) throw new Error('Ce dossier n’est pas un dépôt Git. Un dépôt de mise à jour doit être configuré avant utilisation.');
        throw new Error(error.stderr?.trim().slice(0, 1000) || error.message);
    } finally { running = false; }
}
function schedule(client) {
    if (client.updateTimer) clearInterval(client.updateTimer);
    client.updateTimer = null;
    if (require('./settings').read().autoUpdate) {
        client.updateTimer = setInterval(() => update(client).then(result => console.log('Auto-update :', result)).catch(error => console.error('Auto-update :', error.message)), 3600000);
        client.updateTimer.unref();
    }
}
module.exports = { update, schedule };

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const run = promisify(execFile);
const root = path.join(__dirname, '..');
let running = false;
function gitRuntime() {
    const candidates = [process.env.PROTECT_GIT_PATH];
    if (process.platform === 'win32') {
        if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'));
        for (const folder of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) if (folder) candidates.push(path.join(folder, 'Git/cmd/git.exe'));
    }
    const executable = candidates.find(file => file && fs.existsSync(file)) || 'git';
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    if (executable !== 'git' && process.platform === 'win32') {
        const bin = path.resolve(path.dirname(executable), '../mingw64/bin');
        if (fs.existsSync(path.join(bin, 'git-remote-https.exe'))) {
            env.GIT_EXEC_PATH = bin;
            env.PATH = `${bin}${path.delimiter}${env.PATH || env.Path || ''}`;
        }
    }
    return { executable, env };
}
async function update(client) {
    if (running) throw new Error('Une mise à jour est déjà en cours.');
    running = true;
    const runtime = gitRuntime();
    const git = async args => (await run(runtime.executable, args, { cwd: root, env: runtime.env, timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout.trim();
    try {
        await git(['rev-parse', '--is-inside-work-tree']);
        const localChanges = await git(['status', '--porcelain']);
        if (localChanges) {
            const files = localChanges.split('\n').slice(0, 12).map(line => line.trim()).join('\n').replace(/`/g, 'ˋ');
            throw new Error(`Des modifications locales existent sur l’hébergeur :\n${files}\n\nMise à jour arrêtée pour conserver tes fichiers. Vérifie git status --short dans /home/container avant de les enregistrer ou de les restaurer.`);
        }
        const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
        if (branch === 'HEAD') throw new Error('Le dépôt doit être sur une branche.');
        let upstream;
        try { upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']); }
        catch { throw new Error('La branche ne suit aucun dépôt distant. Configure origin/main avec git branch --set-upstream-to=origin/main.'); }
        await git(['fetch', '--prune']);
        const before = await git(['rev-parse', 'HEAD']);
        await git(['merge', '--ff-only', upstream]);
        const after = await git(['rev-parse', 'HEAD']);
        if (before !== after && client) await require('./updateAnnouncements').publish(client);
        return before === after ? 'Protect est déjà à jour.' : `Mise à jour installée depuis ${upstream} (${after.slice(0, 7)}). Redémarre le bot pour activer le nouveau code. Si les dépendances ont changé, lance npm install avant le redémarrage.`;
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
module.exports = { update, schedule, gitRuntime };

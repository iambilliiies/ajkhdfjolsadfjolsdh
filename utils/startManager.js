const path = require('node:path');
const { fork } = require('node:child_process');
module.exports = function startManager(root, client, options = {}) {
    const host = options.process || process, spawn = options.spawn || fork, log = options.log || console.log;
    if (host.env.PROTECT_MANAGED_INSTANCE === '1' || host.env.PROTECT_MANAGER_EXTERNAL === '1') return null;
    log('🟠 Démarrage automatique de Protect Gestion avec Protect…');
    const child = spawn(path.join(root, 'manager/index.js'), [], { cwd: root, env: { ...host.env }, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('error', () => log('🔴 Protect Gestion : lancement impossible. Protect principal reste lancé.'));
    child.on('exit', code => {
        if (code) log('🔴 Protect Gestion : arrêté en erreur. Vérifie manager/config.json et Message Content Intent.');
    });
    let stopping = false;
    const stop = () => {
        if (stopping) return; stopping = true; client.destroy();
        if (child.exitCode !== null || child.signalCode !== null) { host.exit(0); return; }
        const timer = setTimeout(() => { child.kill('SIGKILL'); host.exit(0); }, 10000);
        child.once('exit', () => { clearTimeout(timer); host.exit(0); });
        child.kill('SIGTERM');
    };
    host.once('SIGTERM', stop); host.once('SIGINT', stop);
    host.once('exit', () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
    return child;
};

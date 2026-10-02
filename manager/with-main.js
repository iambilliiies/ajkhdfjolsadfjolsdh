const { fork } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const children = ['index.js', 'manager/index.js'].map(file => fork(path.join(root, file), [], { cwd: root, env: { ...process.env, ...(file === 'index.js' ? { PROTECT_MANAGER_EXTERNAL: '1' } : {}) }, windowsHide: true, stdio: 'inherit' }));
let ending = false;
function stop(code = 0) {
    if (ending) return; ending = true;
    process.exitCode = code;
    for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
    const timeout = setTimeout(() => { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); }, 10000);
    timeout.unref();
}
for (const child of children) { child.on('error', () => stop(1)); child.on('exit', code => { if (!ending) stop(code || 1); }); }
process.on('SIGTERM', () => stop()); process.on('SIGINT', () => stop());

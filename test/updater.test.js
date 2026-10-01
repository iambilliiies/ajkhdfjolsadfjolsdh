const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function setup(options={}) {
    const calls=[], published=[];
    const module={exports:{}};
    let head=0;
    const run=async(executable,args,settings)=>{
        calls.push({executable,args,settings});
        const key=args.join(' ');
        if(options.fail===key)throw Object.assign(new Error('échec'),{stderr:options.stderr||'échec Git'});
        if(key==='status --porcelain')return{stdout:options.dirty?' M index.js':''};
        if(key==='rev-parse --abbrev-ref HEAD')return{stdout:'main'};
        if(key==='rev-parse --abbrev-ref --symbolic-full-name @{upstream}')return{stdout:'origin/main'};
        if(key==='rev-parse HEAD')return{stdout:++head===1||!options.changed?'aaaaaaaa':'bbbbbbbb'};
        return{stdout:''};
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/updater.js'),'utf8'),{
        module,__dirname:path.join(__dirname,'../utils'),process:{platform:'win32',env:{USERPROFILE:'C:/Users/Test',PATH:'original'}},setInterval,clearInterval,console,
        require:name=>name==='node:child_process'?{execFile(){}}:name==='node:util'?{promisify:()=>run}:name==='node:fs'?{existsSync:file=>/git\.exe$|git-remote-https\.exe$/.test(file)}:name==='./updateAnnouncements'?{publish:async client=>published.push(client)}:require(name)
    });
    return{updater:module.exports,calls,published};
}
test('updatebot détecte le Git Windows et configure son helper HTTPS',async()=>{
    const s=setup();assert.match(await s.updater.update({}),/déjà à jour/);
    assert.ok(s.calls.every(c=>c.executable.endsWith('git.exe')&&c.settings.env.GIT_EXEC_PATH.endsWith(path.join('mingw64','bin'))));
    assert.ok(s.calls.every(c=>c.settings.env.GIT_TERMINAL_PROMPT==='0'));
});
test('updatebot installe en avance rapide et annonce les changements',async()=>{
    const s=setup({changed:true});assert.match(await s.updater.update({}),/origin\/main.*bbbbbbb/);
    assert.ok(s.calls.some(c=>c.args.join(' ')==='merge --ff-only origin/main'));assert.equal(s.published.length,1);
});
test('modifications locales protégées et nouvelle tentative possible après erreur',async()=>{
    const s=setup({dirty:true});await assert.rejects(s.updater.update(),/modifications locales/);await assert.rejects(s.updater.update(),/modifications locales/);
    assert.ok(!s.calls.some(c=>c.args[0]==='fetch'));
});
test('branche sans suivi et historique divergent donnent une erreur sans reset',async()=>{
    const s=setup({fail:'rev-parse --abbrev-ref --symbolic-full-name @{upstream}'});await assert.rejects(s.updater.update(),/ne suit aucun/);
    const divergence=setup({fail:'merge --ff-only origin/main',stderr:'Not possible to fast-forward'});await assert.rejects(divergence.updater.update(),/fast-forward/);assert.ok(!divergence.calls.some(c=>c.args[0]==='reset'));
});

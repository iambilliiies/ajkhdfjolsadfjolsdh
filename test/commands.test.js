const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

test("setprefix écrit dans le fichier lu par messageCreate et protège les commandes owner", async () => {
    const files = new Map();
    const fakeFs = {
        existsSync: file => files.has(file),
        mkdirSync() {},
        readFileSync: file => files.get(file),
        writeFileSync: (file, content) => files.set(file, content)
    };
    function load(relative) {
        const filename = path.join(root, relative);
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
            module, __dirname: path.dirname(filename), console,
            require: name => ['fs', 'node:fs'].includes(name) ? fakeFs : name === '../utils/settings'
                ? { blacklisted: () => false, prefix: () => '!', read: () => ({ aliases: {} }), isOwner: id => id === 'owner' }
                : name === '../utils/permissions' ? { allowed: () => true }
                : name === '../utils/antiraid' ? { message: async () => {} }
                : name === '../utils/moderation' ? { message: async () => false, publicAllowed: () => true }
                : name === '../utils/managementInteractions' ? { onMessage: async () => {} }
                : name === '../utils/serverConfigRuntime' ? { onMessage: async () => {}, custom: async () => {}, trackReplies: () => () => {} }
                : name.endsWith("config.json") ? { defaultPrefix: "!", owners: ["owner"] } : require(name)
        }, { filename });
        return module.exports;
    }
    const setprefix = load("commands/owners/setprefix.js");
    const handler = load("events/messagecreate.js");
    const replies = [];
    let pingCalls = 0;
    const client = {
        ownerCommands: new Map([["setprefix", setprefix]]),
        commands: new Map([["ping", { execute: async () => { pingCalls++; } }]])
    };
    const message = {
        author: { id: "visitor", bot: false }, guild: { id: "guild", name: "Test" },
        content: "!setprefix ?", reply: async text => replies.push(text)
    };
    await handler.execute(message, client);
    assert.equal(files.size, 0);
    message.author.id = "owner";
    await handler.execute(message, client);
    assert.equal(JSON.parse(files.get(path.join(root, "data/prefixes.json"))).guild, "?");
    message.content = "?ping\targument";
    await handler.execute(message, client);
    assert.equal(pingCalls, 1);
    message.content = "!ping";
    await handler.execute(message, client);
    assert.equal(pingCalls, 1);
    const prefixPath = path.join(root, "data/prefixes.json");
    files.set(prefixPath, "broken json");
    await setprefix.execute(message, ["$"]);
    assert.equal(files.get(prefixPath), "broken json");
});

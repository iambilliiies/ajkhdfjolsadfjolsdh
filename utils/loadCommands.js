const fs = require('node:fs');
const path = require('node:path');
module.exports = function loadCommands(client, root) {
    if (!client.commandRoutes) client.commandRoutes = new Map();
    function visit(folder, restricted = false) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) { visit(file, restricted || /^owners?$/i.test(entry.name)); continue; }
            if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
            try {
                const command = require(file);
                if (typeof command.name !== 'string' || !command.name.trim() || typeof command.execute !== 'function') throw new Error('Commande invalide');
                const name = command.name.toLowerCase();
                const ownerOnly = restricted || command.ownerOnly === true;
                const collection = ownerOnly ? client.ownerCommands : client.commands;
                if (ownerOnly && collection.has(name)) throw new Error(`Commande en double : ${name}`);
                if (!ownerOnly && collection.has(name) && typeof command.matches !== 'function' && typeof collection.get(name).matches !== 'function') throw new Error(`Commande en double : ${name}`);
                if (ownerOnly && client.commands.has(name) && typeof command.matches !== 'function') throw new Error(`La commande owner ${name} doit définir matches pour partager un nom général.`);
                const category = command.category || path.relative(root, folder).split(path.sep).join(' / ') || 'general';
                const loaded = { ...command, category, ownerOnly };
                if (!ownerOnly) {
                    const routes = client.commandRoutes.get(name) || [];
                    if (typeof loaded.matches !== 'function' && routes.some(route => typeof route.matches !== 'function')) throw new Error(`Commande par défaut en double : ${name}`);
                    routes.push(loaded); client.commandRoutes.set(name, routes);
                    if (!collection.has(name) || typeof loaded.matches !== 'function') collection.set(name, loaded);
                } else collection.set(name, loaded);
                console.log(`✅ Commande chargée : ${name} (${category})`);
            } catch (error) { console.error(`❌ Commande ${file} :`, error); }
        }
    }
    visit(root);
};

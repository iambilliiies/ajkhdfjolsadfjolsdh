const settings = require('./settings');
const { t } = require('./language');
const categoryOrder = new Map([
    ['general', 0], ['antiraid', 1], ['gestion du serveur', 2],
    ['configuration du serveur', 3], ['logs', 4],
    ['parametres de moderation', 5], ['moderation', 6],
    ['owner', 8], ['owners', 8]
]);
const categoryRank = category => categoryOrder.get(category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()) ?? 7;
module.exports = function buildPages(client, isOwner, prefix) {
    const categories = new Map();
    const visible = [...new Set([...client.commands.values(), ...[...(client.commandRoutes?.values() || [])].flat(), ...(isOwner ? client.ownerCommands.values() : [])])];
    for (const command of visible.flatMap(command => command.helpEntries?.length ? command.helpEntries.map(entry => ({ ...command, ...entry })) : [command])) {
        if (command.hidden) continue;
        const category = String(command.category || 'general');
        if (!categories.has(category)) categories.set(category, []);
        categories.get(category).push(command);
    }
    const pages = [];
    for (const [category, commands] of [...categories].sort(([a], [b]) => {
        return categoryRank(a) - categoryRank(b) || a.localeCompare(b, 'fr');
    })) {
        const entries = [];
        for (const command of commands.sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
            const usage = String(command.usage || command.name).replace(/`/g, 'ˋ').slice(0, 200);
            const aliases = settings.read().helpAlias ? Object.entries(settings.read().aliases).filter(([, target]) => target === command.name).map(([alias]) => `\`${prefix.replace(/`/g, 'ˋ')}${alias}\``).join(', ').slice(0, 500) : '';
            const entry = `\`${prefix.replace(/`/g, 'ˋ')}${usage}\`\n${t(String(command.description || 'Aucune description disponible.')).slice(0, 500)}${aliases ? `\n${t('Alias')} : ${aliases}` : ''}`;
            entries.push(entry);
        }
        const fullDescription = entries.join('\n\n');
        let description = fullDescription;
        let attachment;
        // Discord limite la description d’un embed à 4096 caractères.
        // Une catégorie garde sa page ; le fichier joint contient tout en cas de dépassement.
        if (description.length > 3800) {
            const preview = [];
            let length = 0;
            for (const entry of entries) {
                if (length + entry.length + 2 > 3500) break;
                preview.push(entry); length += entry.length + 2;
            }
            description = `${preview.join('\n\n')}\n\n📎 La liste complète de cette catégorie est dans le fichier joint.`;
            attachment = fullDescription;
        }
        const intro = ['Antiraid', 'Gestion du serveur', 'Configuration du serveur', 'Logs', 'Paramètres de modération', 'Modération'].includes(category) ? '*Les paramètres peuvent être des noms, des mentions ou des IDs. Sans mentions, sépare-les par `,,`.*' : '';
        pages.push({ category, description, intro, count: commands.length, section: 1, sections: 1, attachment });
    }
    return pages;
};

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.json');
const storeFile = path.join(__dirname, '../data/suggestions.json');
const embed = (title, description) => new EmbedBuilder().setColor(require('./settings').theme()).setTitle(require('./language').t(title).slice(0, 256)).setDescription(require('./language').t(String(description || 'Aucune information disponible.')).slice(0, 4096)).setFooter({ text: 'Protect' });
const reply = (message, value) => message.reply({ embeds: [value], allowedMentions: { parse: [], repliedUser: false } });
const date = value => value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>` : 'Indisponible';
const id = value => String(value || '').replace(/[<@!#&>]/g, '');
async function member(message, args) {
    if (!args.length) return message.member;
    const query = args.join(' ');
    if (/^\d+$/.test(id(query))) return message.guild.members.fetch(id(query)).catch(() => null);
    const members = await message.guild.members.fetch();
    const matches = members.filter(m => [m.displayName, m.user.username, m.user.tag].some(n => n.toLowerCase() === query.toLowerCase()));
    return matches.size === 1 ? matches.first() : null;
}
async function user(message, args, client) {
    if (!args.length) return message.author;
    if (/^\d+$/.test(id(args[0]))) return client.users.fetch(id(args[0])).catch(() => null);
    return (await member(message, args))?.user;
}
async function role(message, args) {
    const roles = await message.guild.roles.fetch();
    const query = args.join(' ');
    if (!query) return null;
    const matches = roles.filter(r => r.id === id(query) || r.name.toLowerCase() === query.toLowerCase());
    return matches.size === 1 ? matches.first() : null;
}
async function list(message, title, lines) {
    const pages = []; let chunk = '';
    for (const line of lines) {
        const entry = String(line).slice(0, 1000);
        if (chunk.length + entry.length + 1 > 3500) { pages.push(chunk); chunk = ''; }
        chunk += `${entry}\n`;
    }
    pages.push(chunk || 'Aucun résultat.');
    let index = 0;
    const render = (disabled = false) => ({ embeds: [embed(title, pages[index]).setFooter({ text: `Protect • Page ${index + 1}/${pages.length}` })], components: pages.length > 1 ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('list:previous').setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(disabled || index === 0),
        new ButtonBuilder().setCustomId('list:next').setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || index === pages.length - 1)
    )] : [], allowedMentions: { parse: [], repliedUser: false } });
    const sent = await message.reply(render());
    if (pages.length < 2) return sent;
    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });
    collector.on('collect', async interaction => {
        try {
            if (interaction.user.id !== message.author.id) return await interaction.reply({ content: 'Ouvre ta propre liste pour naviguer.', flags: MessageFlags.Ephemeral });
            index = Math.max(0, Math.min(pages.length - 1, index + (interaction.customId === 'list:next' ? 1 : -1)));
            await interaction.update(render());
        } catch (error) { console.error('Navigation liste :', error.message); }
    });
    collector.on('end', () => sent.edit(render(true)).catch(() => {}));
    return sent;
}
function readSuggestions() {
    if (!fs.existsSync(storeFile)) return {};
    const data = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Fichier suggestions invalide');
    return data;
}
function writeSuggestions(data) {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(`${storeFile}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${storeFile}.tmp`, storeFile);
}
function suggestionEmbed(record) {
    const votes = Object.values(record.votes);
    return embed('💡 Suggestion', record.text).addFields(
        { name: 'Auteur', value: `<@${record.authorId}>` },
        { name: '👍 Pour', value: String(votes.filter(v => v === 1).length), inline: true },
        { name: '👎 Contre', value: String(votes.filter(v => v === -1).length), inline: true }
    );
}
async function json(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Protect/1.0' } });
    if (!response.ok) throw new Error(`Service indisponible (HTTP ${response.status})`);
    return response.json();
}
module.exports = { embed, reply, date, id, member, user, role, list, readSuggestions, writeSuggestions, suggestionEmbed, json, config, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle };

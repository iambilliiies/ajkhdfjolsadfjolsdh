const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.json');
const { embed } = require('./general');
const stateFile = path.join(__dirname, '../data/update-announcements.json');
let running = false;
async function publish(client) {
    if (!config.updateChannelId || running) return;
    running = true;
    try {
        const notes = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/changelogs.json'), 'utf8'));
        const latest = notes[0];
        if (!latest?.version || !Array.isArray(latest.changes)) return;
        const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
        if (state[config.updateChannelId] === latest.version) return;
        const channel = await client.channels.fetch(config.updateChannelId);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') throw new Error('Salon de mises à jour introuvable ou non textuel.');
        const content = latest.changes.map(change => `• ${change}`).join('\n');
        await channel.send({ embeds: [embed(`📋 Mise à jour • ${latest.version}`, `**${latest.date}**\n\n${content}`)], allowedMentions: { parse: [] } });
        state[config.updateChannelId] = latest.version;
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2));
        fs.renameSync(`${stateFile}.tmp`, stateFile);
    } catch (error) { console.error('Annonce de mise à jour :', error.message); }
    finally { running = false; }
}
module.exports = { publish };

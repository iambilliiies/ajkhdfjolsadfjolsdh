const { PermissionFlagsBits: P } = require('discord.js');
const settings = require('./settings');
const { embed } = require('./general');
async function invitation(guild) {
    if (guild.vanityURLCode) return `https://discord.gg/${guild.vanityURLCode}`;
    const me = guild.members.me || await guild.members.fetchMe();
    const channels = await guild.channels.fetch();
    const candidates = [...channels.values()].filter(channel => channel && typeof channel.createInvite === 'function' && channel.permissionsFor(me)?.has([P.ViewChannel, P.CreateInstantInvite]));
    candidates.sort((a, b) => Number(b.id === guild.systemChannelId) - Number(a.id === guild.systemChannelId));
    for (const channel of candidates) {
        try {
            const invite = await channel.createInvite({ maxAge: 86400, maxUses: 1, unique: true, reason: 'Notification privée au propriétaire de Protect' });
            return invite.url;
        } catch { /* Un autre salon peut autoriser la création d’une invitation. */ }
    }
    return null;
}
async function notify(guild) {
    const ownerId = settings.primaryOwner();
    if (!ownerId || !guild.client || !settings.read().dmEnabled) return;
    try {
        let link = null;
        try { link = await invitation(guild); }
        catch (error) { console.error(`Invitation pour notification ${guild.id} :`, error.message); }
        const notification = embed('👑 Protect a rejoint un serveur', `**Serveur :** ${guild.name}\n**ID :** ${guild.id}`)
            .addFields(
                { name: '👑 Propriétaire du serveur', value: guild.ownerId ? `<@${guild.ownerId}>\n${guild.ownerId}` : 'Indisponible', inline: true },
                { name: '👥 Membres', value: String(guild.memberCount ?? 'Indisponible'), inline: true },
                { name: '🔗 Invitation', value: link ? `[Rejoindre le serveur](${link})${guild.vanityURLCode ? '' : '\nValable 24 heures, pour une utilisation.'}` : 'Invitation indisponible : aucune invitation ne peut être créée avec les permissions actuelles.' }
            ).setTimestamp();
        const icon = guild.iconURL?.({ size: 256 });
        if (icon) notification.setThumbnail(icon);
        const owner = await guild.client.users.fetch(ownerId);
        await owner.send({ embeds: [notification], allowedMentions: { parse: [] } });
    } catch (error) { console.error(`Notification MP du nouveau serveur ${guild.id} :`, error.message); }
}
module.exports = { notify, invitation };

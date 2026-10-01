const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const settings = require('../../utils/settings');
const tools = require('../../utils/managementTools');
const ui = require('../../utils/ownerUI');
const g = require('../../utils/general');
function check(channel, guild) {
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Nuke nécessite un salon textuel classique.');
    if (!channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.ManageChannels, P.SendMessages, P.EmbedLinks])) throw new Error('Le bot doit avoir ViewChannel, ManageChannels, SendMessages et EmbedLinks dans ce salon.');
}
module.exports = {
    name: 'nuke', category: 'owners', ownerOnly: true, defaultPermission: 'owner',
    usage: 'nuke [salon]', description: 'Supprime et recrée un salon textuel après confirmation',
    async execute(message, args) {
        if (!settings.isOwner(message.author.id)) throw new Error('Commande réservée aux owners du bot.');
        if (!message.guild) throw new Error('Utilise cette commande sur un serveur.');
        const channel = await tools.channel(message, args.join(' '));
        check(channel, message.guild);
        return ui.confirm(message, `💥 Supprimer et recréer **${channel.name}** ? Tous ses messages seront perdus. Son ID changera : les réglages utilisant cet ID devront être mis à jour.`, async () => {
            if (!settings.isOwner(message.author.id)) throw new Error('Accès owner retiré.');
            const current = await message.guild.channels.fetch(channel.id);
            check(current, message.guild);
            const clone = await current.clone({ reason: `Nuke par ${message.author.id}` });
            try {
                await clone.setPosition(current.rawPosition, { reason: 'Conservation de la position du salon' });
                await current.delete(`Nuke par ${message.author.id}`);
            } catch (error) {
                await clone.delete('Annulation du nuke').catch(() => {});
                throw error;
            }
            await clone.send({ embeds: [g.embed('💥 Salon recréé', `Salon recréé par <@${message.author.id}>.\n**Ancien ID :** ${current.id}\n**Nouveau ID :** ${clone.id}`)], allowedMentions: { parse: [] } });
            return { completionHandled: current.id === message.channel.id };
        });
    }
};

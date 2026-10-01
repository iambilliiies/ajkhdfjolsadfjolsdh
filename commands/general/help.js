const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const buildPages = require('../../utils/helpPages');
const settings = require('../../utils/settings');
const { t } = require('../../utils/language');

module.exports = {
    name: 'help',
    description: 'Affiche les commandes par catégorie avec des boutons de navigation.',
    async execute(message, args, client, context = {}) {
        const prefix = context.prefix || settings.prefix();
        const owner = settings.isOwner(message.author.id);
        const pages = buildPages(client, owner, prefix);
        if (!pages.length) return message.reply('Aucune commande disponible.');
        let current = 0, closed = false;
        function render(disabled = false) {
            const page = pages[current];
            const title = page.category.split(' / ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' •');
            const embed = new EmbedBuilder().setColor(settings.theme())
                .setAuthor({ name: `Protect • ${t('Commandes')}`, ...(client.user ? { iconURL: client.user.displayAvatarURL() } : {}) })
                .setTitle(`${title.slice(0, 200)} • ${page.count} commande${page.count > 1 ? 's' : ''}`)
                .setDescription(`${t('*<paramètre> : obligatoire • [paramètre] : facultatif*')}${page.intro ? `\n${page.intro}` : ''}\n\n${page.description}`)
                .setFooter({ text: `${t('Page')} ${current + 1}/${pages.length} • ${t('Préfixe')} : ${prefix}${page.sections > 1 ? ` • ${t('Catégorie')} ${page.section}/${page.sections}` : ''}${disabled ? ` • ${t('Menu terminé')}` : ''}` });
            const button = (id, label, style, unavailable = false, emoji) => {
                const component = new ButtonBuilder().setCustomId(`help:${id}`).setStyle(style).setDisabled(disabled || unavailable);
                if (label) component.setLabel(label);
                if (emoji) component.setEmoji(emoji);
                return component;
            };
            const row = new ActionRowBuilder().addComponents(
                button('previous', null, ButtonStyle.Secondary, current === 0, '⬅️'),
                button('next', null, ButtonStyle.Secondary, current === pages.length - 1, '➡️'),
                button('close', t('Fermer'), ButtonStyle.Danger)
            );
            const components = [];
            const mode = settings.read().helpType;
            if (mode !== 'button') {
                const start = Math.floor(current / 25) * 25;
                const options = pages.slice(start, start + 25).map((page, index) => ({ label: `${page.category} • ${page.count} commandes`.slice(0, 100), value: String(start + index), default: start + index === current }));
                components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:select').setPlaceholder(t('Choisir une page')).setDisabled(disabled).addOptions(options)));
            }
            if (mode !== 'select') components.push(row);
            else components.push(new ActionRowBuilder().addComponents(
                button('groupPrevious', null, ButtonStyle.Secondary, current < 25, '⬅️'),
                button('groupNext', null, ButtonStyle.Secondary, Math.floor(current / 25) === Math.floor((pages.length - 1) / 25), '➡️'),
                button('close', t('Fermer'), ButtonStyle.Danger)
            ));
            return {
                embeds: [embed], components,
                attachments: [],
                files: page.attachment ? [new AttachmentBuilder(Buffer.from(page.attachment), { name: 'commandes.txt' })] : [],
                allowedMentions: { parse: [], repliedUser: false }
            };
        }
        const sent = await message.reply(render());
        const collector = sent.createMessageComponentCollector({ time: 180_000 });
        collector.on('collect', async interaction => {
            try {
                if (interaction.user.id !== message.author.id) {
                    await interaction.reply({ content: `Ouvre ton propre menu avec ${prefix}help.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }); return;
                }
                if (closed) { await interaction.deferUpdate(); return; }
                if (owner && !settings.isOwner(message.author.id)) {
                    closed = true;
                    await interaction.update({ content: 'Accès owner retiré. Relance help.', embeds: [], components: [] });
                    collector.stop('revoked'); return;
                }
                const action = interaction.customId.split(':')[1];
                if (action === 'previous') current = Math.max(0, current - 1);
                if (action === 'next') current = Math.min(pages.length - 1, current + 1);
                if (action === 'groupPrevious') current = Math.max(0, (Math.floor(current / 25) - 1) * 25);
                if (action === 'groupNext') current = Math.min(pages.length - 1, (Math.floor(current / 25) + 1) * 25);
                if (action === 'select') {
                    const index = Number(interaction.values?.[0]);
                    if (Number.isInteger(index) && index >= 0 && index < pages.length) current = index;
                }
                if (action === 'close') closed = true;
                await interaction.update(render(closed));
                if (closed) collector.stop('closed');
            } catch (error) { console.error('❌ Navigation help :', error); }
        });
        collector.on('end', async (collected, reason) => {
            closed = true;
            if (reason === 'revoked') return;
            try { await sent.edit(render(true)); }
            catch (error) { console.error('❌ Fermeture help :', error.message); }
        });
    }
};

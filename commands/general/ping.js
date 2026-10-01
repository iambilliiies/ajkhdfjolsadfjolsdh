const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "ping",
    description: "Affiche la latence du bot",

    async execute(message, args, client) {
        const embed = new EmbedBuilder()
            .setColor(require("../../utils/settings").theme())
            .setTitle("🏓 Ping")
            .setDescription("Calcul du ping...");

        const sent = await message.reply({
            embeds: [embed],
            allowedMentions: { repliedUser: false }
        });

        const latency = sent.createdTimestamp - message.createdTimestamp;
        const apiPing = Math.round(client.ws.ping);

        embed.setTitle("🏓 Pong !")
            .setDescription(null)
            .addFields(
                { name: "📡 Latence", value: `\`${latency} ms\``, inline: true },
                { name: "💻 API Discord", value: apiPing >= 0 ? `\`${apiPing} ms\`` : "Indisponible", inline: true }
            )
            .setFooter({ text: "Protect" });

        await sent.edit({ embeds: [embed] });
    }
};

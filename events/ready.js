const { PermissionFlagsBits } = require("discord.js");

module.exports = {
    name: "clientReady",
    once: true,

    async execute(client) {

        console.log("");
        console.log("==========================================");
        console.log("✅ Bot connecté avec succès !");
        console.log(`🤖 Bot : ${client.user.tag}`);
        if (process.send && process.connected) process.send({ type: 'protect:ready', botId: client.user.id }, () => {});
        console.log(`🆔 ID : ${client.user.id}`);
        console.log(`🌐 Serveurs : ${client.guilds.cache.size}`);
        console.log(`👥 Utilisateurs : ${client.users.cache.size}`);
        console.log("==========================================");

        // ==========================================
        //          LIEN D'INVITATION
        // ==========================================

        const inviteLink = client.generateInvite({
            scopes: [
                "bot",
                "applications.commands"
            ],

            permissions: [
                PermissionFlagsBits.Administrator
            ]
        });

        console.log("");
        console.log("🔗 LIEN D'INVITATION DU BOT :");
        console.log(inviteLink);
        console.log("");

        // ==========================================
        //              PRÉSENCE
        // ==========================================

        require("../utils/presence").apply(client);
        await require("../utils/slashGeneral").register(client);
        require("../utils/updater").schedule(client);
        await require("../utils/updateAnnouncements").publish(client);
        await require("../utils/managementScheduler").start(client);
        await require("../utils/serverConfigRuntime").start(client);
        await require("../utils/moderationActions").start(client);
    }
};

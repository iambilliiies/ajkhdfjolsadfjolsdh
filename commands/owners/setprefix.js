const fs = require("fs");
const path = require("path");

const prefixFile = path.join(
    __dirname,
    "../../data/prefixes.json"
);

module.exports = {
    name: "setprefix",
    usage: "setprefix <préfixe>",
    description: "Change le préfixe du bot sur le serveur",

    async execute(message, args) {
        if (!message.guild) return message.reply("❌ Cette commande nécessite un serveur.");
        const newPrefix = args[0];

        if (!newPrefix) {
            return message.reply(
                "❌ Tu dois indiquer un nouveau préfixe.\n" +
                "Exemple : `!setprefix ?`"
            );
        }

        if (newPrefix.length > 5) {
            return message.reply(
                "❌ Le préfixe ne peut pas dépasser **5 caractères**."
            );
        }

        let prefixes = {};

        // Crée le dossier data s'il n'existe pas
        const dataFolder = path.dirname(prefixFile);

        if (!fs.existsSync(dataFolder)) {
            fs.mkdirSync(dataFolder, {
                recursive: true
            });
        }

        // Charge les préfixes existants
        if (fs.existsSync(prefixFile)) {
            try {
                prefixes = JSON.parse(
                    fs.readFileSync(prefixFile, "utf8")
                );
            } catch (error) {
                console.error("❌ Impossible de lire prefixes.json :", error);
                return message.reply("❌ Impossible de lire les préfixes enregistrés. Aucun changement effectué.");
            }
        }

        if (!prefixes || typeof prefixes !== "object" || Array.isArray(prefixes)) {
            return message.reply("❌ Le fichier des préfixes est invalide. Aucun changement effectué.");
        }

        // Enregistre le préfixe du serveur
        prefixes[message.guild.id] = newPrefix;

        fs.writeFileSync(
            prefixFile,
            JSON.stringify(prefixes, null, 4)
        );

        return message.reply(
            `✅ Le préfixe de **${message.guild.name}** est maintenant \`${newPrefix}\`\n\n` +
            `Exemple : \`${newPrefix}ping\``
        );
    }
};

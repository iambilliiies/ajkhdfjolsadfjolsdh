// ==========================================
//              DISCORD BOT
// ==========================================

const fs = require("fs");
const path = require("path");

const {
    Client,
    GatewayIntentBits,
    Collection,
    Partials
} = require("discord.js");

const config = require("./config.json");

// ==========================================
//              CLIENT DISCORD
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildPresences
    ],

    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});

// ==========================================
//              COLLECTIONS
// ==========================================

client.commands = new Collection();
if (process.env.PROTECT_MANAGED_INSTANCE === '1') {
    process.on('disconnect', () => { client.destroy(); process.exit(0); });
}
client.ownerCommands = new Collection();

// ==========================================
//          CHARGEMENT DES COMMANDES
// ==========================================

require("./utils/loadCommands")(client, path.join(__dirname, "commands"));

// ==========================================
//            CHARGEMENT EVENTS
// ==========================================

const eventsPath = path.join(
    __dirname,
    "events"
);

if (fs.existsSync(eventsPath)) {

    const eventFiles = fs
        .readdirSync(eventsPath)
        .filter(file => file.endsWith(".js"));

    for (const file of eventFiles) {

        const filePath = path.join(
            eventsPath,
            file
        );

        try {

            const event = require(filePath);

            if (!event.name || typeof event.execute !== "function") {
                console.log(
                    `❌ Event invalide : ${file}`
                );

                continue;
            }

            const executeEvent = async (...args) => {
                try {
                    await event.execute(...args, client);
                } catch (error) {
                    console.error(`❌ Erreur event ${event.name} :`, error);
                }
            };

            if (event.once) {

                client.once(
                    event.name,
                    executeEvent
                );

            } else {

                client.on(
                    event.name,
                    executeEvent
                );
            }

            console.log(
                `📡 Event chargé : ${event.name}`
            );

        } catch (error) {

            console.error(
                `❌ Erreur avec l'event ${file}:`,
                error
            );
        }
    }
}

// ==========================================
//              GESTION ERREURS
// ==========================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ Unhandled Rejection :",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ Uncaught Exception :",
            error
        );
    }
);

// ==========================================
//              CONNEXION
// ==========================================

const token = process.env.DISCORD_TOKEN || config.token;

if (!token) {
    console.error(
        "❌ Aucun token trouvé dans config.json !"
    );

    process.exit(1);
}

client.login(token).catch(error => {
    console.error("❌ Connexion à Discord impossible :", error.message);
    process.exitCode = 1;
    client.destroy();
});


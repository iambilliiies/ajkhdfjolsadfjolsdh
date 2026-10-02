const fs = require('node:fs'), path = require('node:path');
const { Client, GatewayIntentBits: I, Partials } = require('discord.js');
const Storage = require('./storage');
const { Rentals } = require('./rentals');
const { Supervisor } = require('./supervisor');
const { Controller, embed } = require('./controller');
async function main() {
    const source = path.resolve(__dirname, '..'), runtime = path.join(__dirname, 'runtime');
    const file = path.join(__dirname, 'config.json');
    const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const sourceFile = path.join(source, 'config.json'), sourceConfig = fs.existsSync(sourceFile) ? JSON.parse(fs.readFileSync(sourceFile, 'utf8')) : {};
    config.token = process.env.PROTECT_MANAGER_TOKEN || config.token;
    config.ownerId = process.env.PROTECT_MANAGER_OWNER || config.ownerId || sourceConfig.owners?.[0];
    config.prefix ??= '+'; config.maxBots ??= 10;
    if (!config.token || config.token === 'TOKEN_DU_BOT_GESTION_SEPARE') throw new Error('Configure le token du bot gestion séparé dans manager/config.json ou PROTECT_MANAGER_TOKEN.');
    if (!/^\d{15,22}$/.test(config.ownerId)) throw new Error('Configure ton ID Discord dans ownerId ou PROTECT_MANAGER_OWNER.');
    if (config.token === sourceConfig.token || config.token === process.env.DISCORD_TOKEN) throw new Error('Le gestionnaire doit utiliser un token différent du bot principal.');
    if (!Number.isInteger(config.maxBots) || config.maxBots < 1 || config.maxBots > 100 || !/^\S{1,16}$/.test(config.prefix)) throw new Error('maxBots : 1 à 100 ; préfixe : 1 à 16 caractères sans espace.');
    const store = new Storage(runtime), rentals = new Rentals(store, config.maxBots);
    const client = new Client({ intents: [I.Guilds, I.GuildMessages, I.MessageContent, I.DirectMessages], partials: [Partials.Channel] });
    const supervisor = new Supervisor(store, source, runtime, async record => {
        await (await client.users.fetch(record.clientId)).send({ embeds: [embed('Location expirée', `Ton bot personnel a été arrêté car sa durée est terminée.\n**Location :** \`${record.id}\`\nContacte le gestionnaire pour un renouvellement.`)], allowedMentions: { parse: [] } });
    });
    const controller = new Controller(client, config, rentals, supervisor, undefined, [config.token, sourceConfig.token, process.env.DISCORD_TOKEN].filter(Boolean));
    client.on('messageCreate', message => controller.message(message).catch(() => console.error('Erreur commande gestion.')));
    client.on('interactionCreate', interaction => controller.interaction(interaction).catch(() => console.error('Erreur formulaire gestion.')));
    let timer, exiting = false;
    client.once('clientReady', async () => {
        console.log(`🟢 Protect Gestion : EN LIGNE sur Discord (${client.user.tag}).`);
        supervisor.repairFailedInstances();
        await supervisor.tick().catch(() => console.error('Erreur de reprise des locations.'));
        timer = setInterval(() => supervisor.tick().catch(() => console.error('Erreur de contrôle des locations.')), 15000);
    });
    const shutdown = async () => {
        if (exiting) return; exiting = true; clearInterval(timer);
        await supervisor.shutdown(); client.destroy(); console.log('🔴 Protect Gestion : HORS LIGNE — arrêté.'); process.exit(0);
    };
    process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
    if (process.send) process.on('disconnect', shutdown);
    console.log('🟠 Protect Gestion : connexion en cours…');
    await client.login(config.token).catch(() => { client.destroy(); throw new Error('Connexion du gestionnaire impossible. Vérifie son token et Message Content Intent.'); });
}
if (require.main === module) main().catch(error => { console.error(`🔴 Protect Gestion : HORS LIGNE — ${error.message}`); process.exitCode = 1; });
module.exports = main;

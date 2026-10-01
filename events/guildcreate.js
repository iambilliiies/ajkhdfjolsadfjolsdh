const settings = require('../utils/settings');
module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        if (settings.read().secureInvite) {
            const ownerId = settings.primaryOwner();
            if (!ownerId) throw new Error('secur invite nécessite un propriétaire principal dans config.json.');
            try { await guild.members.fetch(ownerId); }
            catch (error) {
                if (error.code === 10007) { await guild.leave(); return; }
                throw error;
            }
        }
        for (const [id, record] of Object.entries(settings.read().blacklist)) {
            try { await guild.members.ban(id, { reason: `Blacklist : ${record.reason}`.slice(0, 512) }); }
            catch (error) { console.error(`Blacklist ${id} sur ${guild.id} :`, error.message); }
        }
    }
};

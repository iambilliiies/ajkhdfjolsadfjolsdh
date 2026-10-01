module.exports = {
    name: 'guildAuditLogEntryCreate',
    execute(entry, guild) { return require('../utils/antiraid').audit(entry, guild); }
};

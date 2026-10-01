module.exports = {
    name: 'guildMemberUpdate',
    execute(oldMember, member) { return require('../utils/antiraid').stripRank(member); }
};

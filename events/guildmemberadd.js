const settings = require('../utils/settings');
module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        if (settings.blacklisted(member.id)) {
            await member.ban({ reason: `Blacklist : ${settings.read().blacklist[member.id].reason}`.slice(0, 512) });
            return;
        }
        await require('../utils/antiraid').join(member);
        await require('../utils/antiraid').stripRank(member);
        if (await member.guild.members.fetch(member.id).catch(() => null)) await require('../utils/serverConfigRuntime').welcome(member);
    }
};

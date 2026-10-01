module.exports = {
    name: 'channelDelete',
    execute(channel) { if (channel.guild && channel.permissionOverwrites) require('../utils/antiraid').remember('channel', channel); }
};

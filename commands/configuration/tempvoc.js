const command = require('../../utils/serverConfigCommands')('tempvoc');
module.exports = {
    ...command,
    matches: args => args[0] === 'settings',
    usage: 'tempvoc settings',
    helpEntries: [{ usage: 'tempvoc settings', description: 'Configure le vocal de création et la catégorie des vocaux temporaires' }],
    defaultPermission: 'Administrator',
    lockedPermission: true,
    execute: (message, args, client) => command.execute(message, args.slice(1), client)
};

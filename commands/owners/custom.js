module.exports = {
    ...require('../../utils/serverConfigCommands')('custom', { ownerOnly: true }),
    category: 'owners', ownerOnly: true, matches: () => true,
    defaultPermission: 'owner'
};

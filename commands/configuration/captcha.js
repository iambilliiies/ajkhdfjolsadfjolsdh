module.exports = {
    name: 'captcha', category: 'Configuration du serveur', defaultPermission: 'Administrator', lockedPermission: true,
    usage: 'captcha [settings/off]', description: 'Configure la vérification par calcul et le rôle attribué après réussite.',
    execute: (message, args) => require('../../utils/captcha').configure(message, args)
};

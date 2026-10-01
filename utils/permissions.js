const { PermissionFlagsBits } = require('discord.js');
const settings = require('./settings');
function normalize(value) {
    const aliases = { '0': 'everyone', 'public': 'everyone', 'everyone': 'everyone', 'admin': 'Administrator', 'administrator': 'Administrator', 'owner': 'owner' };
    if (Object.hasOwn(aliases, value.toLowerCase())) return aliases[value.toLowerCase()];
    const roleId = value.replace(/[<@&>]/g, '');
    if (/^\d{15,22}$/.test(roleId)) return `role:${roleId}`;
    if (/^role:\d{15,22}$/.test(value)) return value;
    const flag = Object.keys(PermissionFlagsBits).find(key => key.toLowerCase() === value.toLowerCase());
    if (!flag) throw new Error('Permission invalide : everyone, admin, owner, nom Discord (ex. ManageMessages) ou ID de rôle.');
    return flag;
}
function allowed(message, command) {
    if (settings.isOwner(message.author.id)) return true;
    if (command.ownerOnly) return false;
    if (command.lockedPermission) return message.guild?.ownerId === message.author.id || Boolean(message.member?.permissions.has(PermissionFlagsBits.Administrator));
    const permission = settings.read().permissions[command.name] || command.defaultPermission || 'everyone';
    if (permission !== 'owner' && require('./serverConfigStore').granted(message, command.name, permission)) return true;
    if (permission === 'everyone') return true;
    if (permission === 'owner') return false;
    if (permission.startsWith('role:')) return Boolean(message.member?.roles.cache.has(permission.slice(5)));
    return Boolean(message.member?.permissions.has(PermissionFlagsBits[permission]));
}
module.exports = { normalize, allowed };

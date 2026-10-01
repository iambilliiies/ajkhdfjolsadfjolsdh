module.exports = {
    name: 'roleDelete',
    execute(role) { require('../utils/antiraid').remember('role', role); }
};

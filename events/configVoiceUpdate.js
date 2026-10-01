module.exports = { name: 'voiceStateUpdate', execute: (before, after) => require('../utils/serverConfigRuntime').voice(before, after) };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const calculate = require('../utils/calculate');
const factory = require('../utils/generalCommands');
const { suggestionEmbed } = require('../utils/general');
test('calculs et équations sans exécution de code', () => {
    assert.equal(calculate('2 + 3 * 4'), '14');
    assert.equal(calculate('(2 + 3)^2'), '25');
    assert.equal(calculate('-2^2'), '-4');
    assert.equal(calculate('2^3^2'), '512');
    assert.equal(calculate('2x + 3 = 11'), 'x = 4');
    assert.equal(calculate('2*(x+1)=10'), 'x = 4');
    assert.equal(calculate('x=x'), 'Une infinité de solutions.');
    assert.equal(calculate('x=x+1'), 'Aucune solution.');
    for (const expression of ['1/0', 'x*x=2', 'process.exit()', '2+abc', '2^9999', '1=1=1']) assert.throws(() => calculate(expression));
});
test('chaque commande générale est exposée et documentée', () => {
    assert.equal(factory.names.length, 24);
    for (const name of factory.names) {
        const command = require(`../commands/general/${name}`);
        assert.equal(command.name, name);
        assert.equal(typeof command.execute, 'function');
        assert.ok(command.usage && command.description);
    }
    assert.equal(factory('server').helpEntries.length, 2);
});
test('scores des suggestions dans les embeds', () => {
    const fields = suggestionEmbed({ text: 'Test', authorId: '123', votes: { a: 1, b: -1, c: 1 } }).toJSON().fields;
    assert.equal(fields[1].value, '2');
    assert.equal(fields[2].value, '1');
});
test('wiki gère un service indisponible et image propose un lien sans clé', async () => {
    const original = global.fetch;
    let payload;
    const message = { guild: {}, reply: async value => { payload = value; } };
    global.fetch = async () => { throw new Error('offline'); };
    try {
        await factory('wiki').execute(message, ['test'], {});
        assert.match(payload.embeds[0].toJSON().description, /indisponible/);
    } finally { global.fetch = original; }
});

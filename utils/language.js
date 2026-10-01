const settings = require('./settings');
const dictionaries = { fr: require('../data/lang/fr.json'), en: require('../data/lang/en.json') };
function t(text) {
    const state = settings.read();
    if (state.customLanguageEnabled && Object.hasOwn(state.customLanguage, text)) return state.customLanguage[text];
    const dictionary = dictionaries[state.language] || dictionaries.fr;
    return Object.hasOwn(dictionary, text) ? dictionary[text] : text;
}
module.exports = { t, dictionaries };

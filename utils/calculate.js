// Parseur arithmétique : aucun code fourni par l'utilisateur n'est exécuté.
module.exports = function calculate(input) {
    if (!input || input.length > 300) throw new Error('Indique un calcul de 300 caractères maximum.');
    const source = input.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s/g, '').toLowerCase();
    let cursor = 0;
    const pair = (a, b = 0) => [a, b]; // constante + coefficient de x
    function primary() {
        if (source[cursor] === '(') { cursor++; const result = sum(); if (source[cursor++] !== ')') throw new Error('Parenthèse manquante.'); return result; }
        if (source[cursor] === 'x') { cursor++; return pair(0, 1); }
        const match = source.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
        if (!match) throw new Error('Expression invalide. Utilise +, -, *, /, %, ^ et les parenthèses.');
        cursor += match[0].length; return pair(Number(match[0]));
    }
    function unary() {
        if (source[cursor] === '+') { cursor++; return unary(); }
        if (source[cursor] === '-') { cursor++; return unary().map(v => -v); }
        return power();
    }
    function power() {
        let left = primary();
        if (source[cursor] === '^') {
            cursor++; const right = unary();
            if (left[1] || right[1]) throw new Error('Seules les équations linéaires en x sont prises en charge.');
            left = pair(left[0] ** right[0]);
        }
        return left;
    }
    function product() {
        let left = unary();
        while (['*', '/', '%'].includes(source[cursor]) || (source[cursor] && /[x(]/.test(source[cursor]))) {
            const implicit = /[x(]/.test(source[cursor]);
            const op = implicit ? '*' : source[cursor++];
            const right = unary();
            if (op === '*') {
                if (left[1] && right[1]) throw new Error('Seules les équations linéaires en x sont prises en charge.');
                left = pair(left[0] * right[0], left[0] * right[1] + left[1] * right[0]);
            } else {
                if (right[1] || (op === '%' && left[1])) throw new Error('Opération non linéaire non prise en charge.');
                if (right[0] === 0) throw new Error('Division par zéro.');
                left = op === '/' ? left.map(v => v / right[0]) : pair(left[0] % right[0]);
            }
        }
        return left;
    }
    function sum() {
        let left = product();
        while (source[cursor] === '+' || source[cursor] === '-') {
            const sign = source[cursor++] === '+' ? 1 : -1; const right = product();
            left = pair(left[0] + sign * right[0], left[1] + sign * right[1]);
        }
        return left;
    }
    const left = sum(); let result;
    if (source[cursor] === '=') {
        cursor++; const right = sum(); const a = left[1] - right[1], b = right[0] - left[0];
        result = a === 0 ? (b === 0 ? 'Une infinité de solutions.' : 'Aucune solution.') : `x = ${b / a}`;
        if (a !== 0 && !Number.isFinite(b / a)) throw new Error('Résultat trop grand.');
    } else {
        if (left[1]) throw new Error('Ajoute = pour résoudre une équation en x.');
        if (!Number.isFinite(left[0])) throw new Error('Résultat trop grand ou invalide.');
        result = String(left[0]);
    }
    if (cursor !== source.length) throw new Error('Expression invalide.');
    return result;
};

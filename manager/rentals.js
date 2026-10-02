const { randomUUID } = require('node:crypto');
const id = value => String(value || '').replace(/^<@!?|>$/g, '');
function duration(value) {
    const match = String(value || '').match(/^(\d+)(m|h|d|j)$/i);
    const time = match ? Number(match[1]) * ({ m: 60000, h: 3600000, d: 86400000, j: 86400000 }[match[2].toLowerCase()]) : 0;
    if (!Number.isSafeInteger(time) || time < 60000 || time > 365 * 86400000) throw new Error('Durée de 1 minute à 365 jours : 30m, 2h, 7j, 30j.');
    return time;
}
class Rentals {
    constructor(store, maxBots = 10, now = Date.now) { this.store = store; this.maxBots = maxBots; this.now = now; }
    available(record) { return record.state === 'pending' && record.signupExpiresAt > this.now() || Boolean(record.tokenCipher && record.expiresAt > this.now()); }
    create(clientId, time) {
        if (!/^\d{15,22}$/.test(clientId)) throw new Error('Mention ou ID du client requis.');
        const record = { id: randomUUID(), clientId, durationMs: time, createdAt: this.now(), signupExpiresAt: this.now() + 86400000, nonce: randomUUID(), state: 'pending' };
        this.store.mutate(all => {
            if (Object.values(all).filter(r => this.available(r)).length >= this.maxBots) throw new Error('Nombre maximal de bots et invitations en cours atteint.');
            all[record.id] = record;
        });
        return record;
    }
    activate(recordId, clientId, nonce, token, ownerId, botId) {
        let active;
        this.store.mutate(all => {
            const r = all[recordId];
            if (!r || r.state !== 'pending' || r.clientId !== clientId || r.nonce !== nonce || r.signupExpiresAt <= this.now()) throw new Error('Invitation invalide, expirée ou déjà utilisée.');
            if (Object.values(all).some(other => other.id !== r.id && this.available(other) && other.botId === botId)) throw new Error('Ce bot possède déjà une location active.');
            active = Object.assign(r, { state: 'active', botId, ownerId, tokenCipher: this.store.encrypt(token), activatedAt: this.now(), expiresAt: this.now() + r.durationMs, retries: 0 });
            delete r.nonce;
        });
        return active;
    }
    find(query) {
        const all = this.store.read();
        if (Object.hasOwn(all, query)) return all[query];
        const matches = Object.values(all).filter(r => r.clientId === id(query));
        if (matches.length !== 1) throw new Error(matches.length ? 'Ce client a plusieurs bots : utilise l’ID de location indiqué par mybot.' : 'Location introuvable.');
        return matches[0];
    }
    renew(query, time) {
        const target = this.find(query);
        this.store.mutate(all => {
            const record = all[target.id];
            if (record.state === 'removing') throw new Error('Cette location est en cours de retrait.');
            if (!record.tokenCipher) {
                if (record.signupExpiresAt <= this.now()) throw new Error('Invitation expirée : crée une nouvelle location.');
                record.durationMs += time;
            } else {
                if (Object.values(all).some(other => other.id !== record.id && this.available(other) && other.botId === record.botId)) throw new Error('Ce bot possède déjà une autre location active.');
                if (record.expiresAt <= this.now() && Object.values(all).filter(r => this.available(r)).length >= this.maxBots) throw new Error('Nombre maximal de bots atteint.');
                record.expiresAt = Math.max(this.now(), record.expiresAt) + time;
                record.state = 'active'; record.retries = 0; delete record.retryAt; delete record.expiryNotified;
            }
        });
        return this.store.read()[target.id];
    }
}
module.exports = { Rentals, duration, id };

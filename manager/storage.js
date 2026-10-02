const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
class Storage {
    constructor(root) {
        this.root = root; this.file = path.join(root, 'rentals.json');
        fs.mkdirSync(root, { recursive: true, mode: 0o700 });
        const keyFile = path.join(root, 'tokens.key');
        if (!fs.existsSync(keyFile)) {
            if (fs.existsSync(this.file)) throw new Error('Clé de chiffrement manquante. Restaure tokens.key avec rentals.json.');
            fs.writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 });
        }
        this.key = fs.readFileSync(keyFile);
        if (this.key.length !== 32) throw new Error('Clé de chiffrement invalide.');
    }
    read() {
        const data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : {};
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Base des locations invalide.');
        return data;
    }
    mutate(action) {
        const data = this.read(); action(data);
        fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
        fs.renameSync(`${this.file}.tmp`, this.file);
        return data;
    }
    encrypt(token) {
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
        return { iv: iv.toString('base64'), data: Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]).toString('base64'), tag: cipher.getAuthTag().toString('base64') };
    }
    decrypt(record) {
        try {
            const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(record.iv, 'base64'));
            cipher.setAuthTag(Buffer.from(record.tag, 'base64'));
            return Buffer.concat([cipher.update(Buffer.from(record.data, 'base64')), cipher.final()]).toString('utf8');
        } catch { throw new Error('Token chiffré illisible.'); }
    }
}
module.exports = Storage;

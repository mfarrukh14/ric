/**
 * Keeps staff passwords recoverable for the superadmin without storing them in plain text:
 * users.password holds the bcrypt hash used for sign-in, users.password_sealed an
 * AES-256-GCM copy that only this server's key can open.
 */
const crypto = require('crypto');
const { CREDENTIALS_KEY, JWT_SECRET } = require('../config/env');

const KEY = Buffer.from(crypto.hkdfSync('sha256', CREDENTIALS_KEY || JWT_SECRET, 'ric-eproc', 'staff-credentials', 32));
const VERSION = 'v1';

/** @returns {string} "v1.<iv>.<tag>.<ciphertext>" in base64url */
function seal(password) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const data = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

/** @returns {string|null} the password, or null if missing or sealed with another key */
function unseal(sealed) {
    if (!sealed) return null;
    try {
        const [version, iv, tag, data] = sealed.split('.');
        if (version !== VERSION) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

module.exports = { seal, unseal };

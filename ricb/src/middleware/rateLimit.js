/**
 * Tiny fixed-window rate limiter for credential endpoints (login, OTP, 2FA).
 * In-memory is enough for a single-instance deployment; it resets on restart.
 */
const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 10, key = (req) => req.ip, message } = {}) => {
    const hits = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
    }, windowMs).unref();

    return (req, res, next) => {
        const now = Date.now();
        const k = key(req);
        let entry = hits.get(k);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(k, entry);
        }
        entry.count += 1;
        if (entry.count > max) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ error: message || 'Too many attempts. Please wait a few minutes and try again.' });
        }
        next();
    };
};

// Keyed by IP and the account being tried, so one noisy client can't lock out everyone behind a proxy.
const byIpAndAccount = (...fields) => (req) =>
    `${req.ip}|${fields.map((f) => String(req.body?.[f] ?? '').toLowerCase()).join('|')}`;

module.exports = { rateLimit, byIpAndAccount };

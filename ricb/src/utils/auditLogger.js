/**
 * Audit trail: every entry goes to the audit_logs table (when the database is
 * up) and to a daily text file under audit_logs/.
 */
const fs = require('fs');
const path = require('path');
const { dbAll, dbRun, isDatabaseConnected } = require('../db');
const { parseInstant } = require('./time');

const AUDIT_DIR = path.join(__dirname, '../../audit_logs');
const FILE_PATTERN = /^audit_log_\d{4}_\d{2}_\d{2}\.txt$/;

fs.mkdirSync(AUDIT_DIR, { recursive: true });

const SYSTEM_ACTOR = { id: 0, role: 'system', name: 'System' };

const actorName = (actor) => actor?.name || actor?.username || actor?.businessEmail || 'Unknown';

const formatLine = ({ timestamp, userId, role, name, action, details, ip, userAgent }) =>
    `[${timestamp}] ${name} (ID: ${userId}) [${String(role).toUpperCase()}] - ${action} | Details: ${details} | IP: ${ip} | User-Agent: ${userAgent}`;

async function write(actor, action, details, ip, userAgent) {
    const entry = {
        timestamp: new Date().toISOString(),
        userId: Number.isInteger(Number(actor?.id)) ? Number(actor.id) : 0,
        role: actor?.role || 'unknown',
        name: actorName(actor),
        action,
        details: details || '',
        ip: ip || 'unknown',
        userAgent: userAgent || 'unknown',
    };
    try {
        if (isDatabaseConnected()) {
            await dbRun(
                'INSERT INTO audit_logs (user_id, user_role, user_name, action, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [entry.userId, entry.role, entry.name, action, entry.details, entry.ip, entry.userAgent],
            );
        }
        const day = entry.timestamp.slice(0, 10).replace(/-/g, '_');
        await fs.promises.appendFile(path.join(AUDIT_DIR, `audit_log_${day}.txt`), `${formatLine(entry)}\n`);
    } catch (err) {
        console.error('Could not write audit entry:', err.message);
    }
}

/**
 * Records an action taken during a request. The actor defaults to the signed-in
 * user; pass one explicitly before sign-in completes (e.g. a failed login).
 */
const record = (req, action, details = '', actor = req?.user) =>
    write(actor, action, details, req?.ip || req?.socket?.remoteAddress, req?.get?.('User-Agent'));

/** Records an action taken by the server itself (scheduled jobs). */
const system = (action, details = '') => write(SYSTEM_ACTOR, action, details);

/** Audit rows in a date range, as an array or as text lines. */
async function report({ startDate, endDate, userId, action, format = 'json' }) {
    const where = ['created_at >= ?', 'created_at <= ?'];
    const params = [parseInstant(startDate), parseInstant(endDate)];
    if (userId) { where.push('user_id = ?'); params.push(Number(userId)); }
    if (action) { where.push('action LIKE ?'); params.push(`%${action}%`); }
    const rows = await dbAll(`SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params);
    if (format === 'json') return rows;
    return rows.map((row) => formatLine({
        timestamp: new Date(row.created_at).toISOString(),
        userId: row.user_id,
        role: row.user_role,
        name: row.user_name,
        action: row.action,
        details: row.details,
        ip: row.ip_address,
        userAgent: row.user_agent,
    })).join('\n');
}

const logFiles = () => {
    try {
        return fs.readdirSync(AUDIT_DIR).filter((file) => FILE_PATTERN.test(file));
    } catch {
        return [];
    }
};

/** Daily log files, newest first. */
const getAuditFiles = () =>
    logFiles()
        .map((filename) => {
            const stats = fs.statSync(path.join(AUDIT_DIR, filename));
            return { filename, size: stats.size, modified: stats.mtime };
        })
        .sort((a, b) => b.modified - a.modified);

/** Deletes daily files older than `retentionDays`; returns how many. */
function cleanupOldLogs(retentionDays) {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    let deleted = 0;
    for (const file of logFiles()) {
        const filePath = path.join(AUDIT_DIR, file);
        if (fs.statSync(filePath).mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted += 1;
        }
    }
    return deleted;
}

module.exports = { record, system, report, getAuditFiles, cleanupOldLogs, auditDir: AUDIT_DIR, FILE_PATTERN };

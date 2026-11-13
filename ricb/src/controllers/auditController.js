// Audit trail endpoints. The router limits all of them to the superadmin.
const fs = require('fs');
const path = require('path');
const auditLogger = require('../utils/auditLogger');
const auditCleanupService = require('../services/auditCleanupService');
const { dbAll, dbGet } = require('../db');
const { parseInstant } = require('../utils/time');

const DAY_MS = 86_400_000;
const MIN_RETENTION_DAYS = 30;

const positiveInt = (value, fallback, max = Infinity) => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};

// Filter boxes are datetime-local inputs: Pakistan time.
const validDate = (value) => !value || Boolean(parseInstant(value));

/** WHERE clause and parameters for the filters shared by list and search. */
function buildFilters({ startDate, endDate, userId, action, query }) {
    const where = [];
    const params = [];
    if (startDate) { where.push('created_at >= ?'); params.push(parseInstant(startDate)); }
    if (endDate) { where.push('created_at <= ?'); params.push(parseInstant(endDate)); }
    if (userId) { where.push('user_id = ?'); params.push(Number(userId)); }
    if (action) { where.push('action LIKE ?'); params.push(`%${action}%`); }
    if (query) {
        where.push('(action LIKE ? OR details LIKE ? OR user_name LIKE ?)');
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const getAuditLogs = async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!validDate(startDate) || !validDate(endDate)) return res.status(400).json({ error: 'Invalid date' });

    const page = positiveInt(req.query.page, 1);
    const limit = positiveInt(req.query.limit, 50, 500);
    try {
        const { where, params } = buildFilters(req.query);
        const logs = await dbAll(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
        const { count } = await dbGet(`SELECT COUNT(*) AS count FROM audit_logs ${where}`, params);
        res.json({
            logs,
            pagination: { currentPage: page, totalPages: Math.ceil(count / limit), totalRecords: count, recordsPerPage: limit },
        });
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
};

const downloadAuditLogs = async (req, res) => {
    const { userId, action } = req.query;
    const startDate = req.query.startDate || new Date(Date.now() - 30 * DAY_MS).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();
    if (!validDate(startDate) || !validDate(endDate)) return res.status(400).json({ error: 'Invalid date' });

    try {
        const report = await auditLogger.report({ startDate, endDate, userId, action, format: 'txt' });
        await auditLogger.record(req, 'AUDIT_LOGS_DOWNLOADED', `Range: ${startDate} to ${endDate}`);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="audit_trail_${stamp}.txt"`);
        res.send(report);
    } catch (err) {
        console.error('Error downloading audit logs:', err);
        res.status(500).json({ error: 'Failed to generate audit report' });
    }
};

const getAuditStatistics = async (req, res) => {
    const days = positiveInt(req.query.days, 30, 3650);
    const since = [new Date(Date.now() - days * DAY_MS)];
    try {
        const [{ count: totalActions }, actionsByRole, mostActiveUsers, topActions, dailyActivity] = await Promise.all([
            dbGet('SELECT COUNT(*) AS count FROM audit_logs WHERE created_at >= ?', since),
            dbAll('SELECT user_role, COUNT(*) AS count FROM audit_logs WHERE created_at >= ? GROUP BY user_role', since),
            dbAll('SELECT user_name, user_role, COUNT(*) AS count FROM audit_logs WHERE created_at >= ? GROUP BY user_id, user_name, user_role ORDER BY count DESC LIMIT 10', since),
            dbAll('SELECT action, COUNT(*) AS count FROM audit_logs WHERE created_at >= ? GROUP BY action ORDER BY count DESC LIMIT 10', since),
            dbAll('SELECT CAST(created_at AS DATE) AS date, COUNT(*) AS count FROM audit_logs WHERE created_at >= ? GROUP BY CAST(created_at AS DATE) ORDER BY date DESC', since),
        ]);
        res.json({ period: `${days} days`, totalActions, actionsByRole, mostActiveUsers, topActions, dailyActivity });
    } catch (err) {
        console.error('Error fetching audit statistics:', err);
        res.status(500).json({ error: 'Failed to fetch audit statistics' });
    }
};

const getAuditFiles = (req, res) => {
    try {
        res.json(auditLogger.getAuditFiles());
    } catch (err) {
        console.error('Error listing audit files:', err);
        res.status(500).json({ error: 'Failed to fetch audit files' });
    }
};

const downloadAuditFile = async (req, res) => {
    const { filename } = req.params;
    if (!auditLogger.FILE_PATTERN.test(filename)) return res.status(400).json({ error: 'Invalid filename' });

    const filePath = path.join(auditLogger.auditDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    await auditLogger.record(req, 'AUDIT_FILE_DOWNLOADED', filename);
    res.download(filePath, filename);
};

const searchAuditLogs = async (req, res) => {
    const { query, startDate, endDate } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    if (!validDate(startDate) || !validDate(endDate)) return res.status(400).json({ error: 'Invalid date' });

    try {
        const { where, params } = buildFilters({ query, startDate, endDate });
        const results = await dbAll(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ?`, [...params, positiveInt(req.query.limit, 100, 1000)]);
        res.json({ query, results, count: results.length });
    } catch (err) {
        console.error('Error searching audit logs:', err);
        res.status(500).json({ error: 'Failed to search audit logs' });
    }
};

const cleanupAuditLogs = async (req, res) => {
    const retentionDays = positiveInt(req.body.retentionDays, 365);
    if (retentionDays < MIN_RETENTION_DAYS) {
        return res.status(400).json({ success: false, error: `Retention period cannot be less than ${MIN_RETENTION_DAYS} days` });
    }
    try {
        await auditLogger.record(req, 'MANUAL_AUDIT_CLEANUP_REQUESTED', `Retention: ${retentionDays} days`);
        const result = await auditCleanupService.performCleanup(retentionDays);
        res.json({ success: true, message: `Audit logs older than ${retentionDays} days removed`, ...result });
    } catch (err) {
        console.error('Error cleaning up audit logs:', err);
        res.status(500).json({ success: false, error: 'Failed to clean up audit logs' });
    }
};

const getCleanupStats = async (req, res) => {
    try {
        res.json({ success: true, data: await auditCleanupService.getCleanupStats() });
    } catch (err) {
        console.error('Error getting cleanup stats:', err);
        res.status(500).json({ success: false, error: 'Failed to get cleanup statistics' });
    }
};

const updateRetentionPolicy = async (req, res) => {
    const retentionDays = positiveInt(req.body.retentionDays, 0);
    if (retentionDays < MIN_RETENTION_DAYS) {
        return res.status(400).json({ success: false, error: `Retention period must be at least ${MIN_RETENTION_DAYS} days` });
    }
    await auditLogger.record(req, 'AUDIT_RETENTION_POLICY_UPDATED', `Retention: ${auditCleanupService.retentionDays} -> ${retentionDays} days`);
    auditCleanupService.retentionDays = retentionDays;
    res.json({ success: true, message: `Retention policy updated to ${retentionDays} days`, retentionDays });
};

module.exports = {
    getAuditLogs,
    downloadAuditLogs,
    getAuditStatistics,
    getAuditFiles,
    downloadAuditFile,
    searchAuditLogs,
    cleanupAuditLogs,
    getCleanupStats,
    updateRetentionPolicy,
};

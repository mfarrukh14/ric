// Removes audit entries (database rows and daily files) past the retention period.
const cron = require('node-cron');
const auditLogger = require('../utils/auditLogger');
const { dbGet, dbRun, isDatabaseConnected } = require('../db');

class AuditCleanupService {
    constructor() {
        this.retentionDays = 365;
        this.isRunning = false;
    }

    /** Schedules the nightly cleanup (02:00). */
    initialize(retentionDays = 365) {
        this.retentionDays = retentionDays;
        cron.schedule('0 2 * * *', () => this.performCleanup().catch(() => {}));
    }

    async performCleanup(retentionDays = this.retentionDays) {
        if (this.isRunning) return { skipped: true };
        this.isRunning = true;
        try {
            const deletedFiles = auditLogger.cleanupOldLogs(retentionDays);
            let deletedRecords = 0;
            if (isDatabaseConnected()) {
                const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
                deletedRecords = (await dbRun('DELETE FROM audit_logs WHERE created_at < ?', [cutoff])).changes;
            }
            await auditLogger.system('AUDIT_CLEANUP_COMPLETED', `Files: ${deletedFiles} | Rows: ${deletedRecords} | Retention: ${retentionDays} days`);
            return { deletedFiles, deletedRecords };
        } catch (err) {
            console.error('Audit cleanup failed:', err);
            await auditLogger.system('AUDIT_CLEANUP_ERROR', err.message);
            throw err;
        } finally {
            this.isRunning = false;
        }
    }

    async getCleanupStats() {
        const database = isDatabaseConnected()
            ? await dbGet('SELECT COUNT(*) AS totalRecords, MIN(created_at) AS oldestRecord, MAX(created_at) AS newestRecord FROM audit_logs')
            : null;
        const files = auditLogger.getAuditFiles();
        return {
            database,
            files: {
                totalFiles: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0),
                oldestFile: files.at(-1)?.filename ?? null,
                newestFile: files[0]?.filename ?? null,
            },
            retentionDays: this.retentionDays,
            isCleanupRunning: this.isRunning,
        };
    }
}

module.exports = new AuditCleanupService();

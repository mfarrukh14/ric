const auditLogger = require('../utils/auditLogger');
const cron = require('node-cron');

class AuditCleanupService {
    constructor() {
        this.retentionDays = 365; // Default retention period
        this.isRunning = false;
    }

    // Initialize the cleanup service with scheduled tasks
    initialize(retentionDays = 365) {
        this.retentionDays = retentionDays;
        
        // Schedule cleanup to run daily at 2 AM
        cron.schedule('0 2 * * *', () => {
            this.performCleanup();
        });

        // Schedule weekly disk space check
        cron.schedule('0 3 * * 0', () => {
            this.checkDiskSpace();
        });

        console.log('🧹 Audit cleanup service initialized');
        console.log(`📅 Retention period: ${this.retentionDays} days`);
        console.log('⏰ Scheduled cleanup: Daily at 2:00 AM');
        console.log('💽 Disk space check: Weekly on Sunday at 3:00 AM');
    }

    // Perform cleanup of old audit logs
    async performCleanup() {
        if (this.isRunning) {
            console.log('⚠️ Cleanup already in progress, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('🧹 Starting audit log cleanup...');

        try {
            // Clean up old text files
            const deletedFiles = auditLogger.cleanupOldLogs(this.retentionDays);
            
            // Clean up old database records
            const deletedRecords = await this.cleanupDatabaseRecords();
            
            console.log(`✅ Cleanup completed: ${deletedFiles} files, ${deletedRecords} database records removed`);
            
            // Log the cleanup activity
            await auditLogger.writeAuditEntry(
                'SYSTEM',
                'system',
                'Audit Cleanup Service',
                'AUDIT_CLEANUP_COMPLETED',
                `Files deleted: ${deletedFiles} | DB records deleted: ${deletedRecords} | Retention: ${this.retentionDays} days`,
                null,
                null
            );

        } catch (error) {
            console.error('❌ Error during audit cleanup:', error);
            
            // Log the cleanup error
            await auditLogger.writeAuditEntry(
                'SYSTEM',
                'system',
                'Audit Cleanup Service',
                'AUDIT_CLEANUP_ERROR',
                `Error: ${error.message}`,
                null,
                null
            );
        } finally {
            this.isRunning = false;
        }
    }

    // Clean up old database records
    async cleanupDatabaseRecords() {
        const { getDatabase } = require('../config/database');
        const db = getDatabase();
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
        const cutoffDateString = cutoffDate.toISOString();

        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM audit_logs WHERE created_at < ?',
                [cutoffDateString],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                }
            );
        });
    }

    // Check disk space usage for audit logs
    async checkDiskSpace() {
        const fs = require('fs');
        const path = require('path');

        try {
            const auditDir = auditLogger.auditDir;
            let totalSize = 0;
            let fileCount = 0;

            if (fs.existsSync(auditDir)) {
                const files = fs.readdirSync(auditDir);
                
                for (const file of files) {
                    if (file.startsWith('audit_log_') && file.endsWith('.txt')) {
                        const filePath = path.join(auditDir, file);
                        const stats = fs.statSync(filePath);
                        totalSize += stats.size;
                        fileCount++;
                    }
                }
            }

            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(3);

            console.log('💽 Audit Log Disk Usage Report:');
            console.log(`📁 Files: ${fileCount}`);
            console.log(`📊 Total Size: ${totalSizeMB} MB (${totalSizeGB} GB)`);
            console.log(`📈 Average File Size: ${fileCount > 0 ? (totalSize / fileCount / 1024).toFixed(2) : 0} KB`);

            // Log disk space check
            await auditLogger.writeAuditEntry(
                'SYSTEM',
                'system',
                'Audit Cleanup Service',
                'DISK_SPACE_CHECK',
                `Files: ${fileCount} | Size: ${totalSizeMB} MB | Avg: ${fileCount > 0 ? (totalSize / fileCount / 1024).toFixed(2) : 0} KB`,
                null,
                null
            );

            // Warn if size is getting large (> 1GB)
            if (totalSize > 1024 * 1024 * 1024) {
                console.log('⚠️ WARNING: Audit logs are consuming more than 1GB of disk space');
                
                await auditLogger.writeAuditEntry(
                    'SYSTEM',
                    'system',
                    'Audit Cleanup Service',
                    'DISK_SPACE_WARNING',
                    `Audit logs size: ${totalSizeGB} GB - Consider reducing retention period`,
                    null,
                    null
                );
            }

        } catch (error) {
            console.error('❌ Error checking disk space:', error);
        }
    }

    // Manual cleanup trigger (for admin use)
    async manualCleanup(retentionDays = this.retentionDays) {
        console.log(`🧹 Manual cleanup triggered with ${retentionDays} days retention`);
        
        const originalRetention = this.retentionDays;
        this.retentionDays = retentionDays;
        
        await this.performCleanup();
        
        this.retentionDays = originalRetention;
    }

    // Get cleanup statistics
    async getCleanupStats() {
        const { getDatabase } = require('../config/database');
        const db = getDatabase();
        const fs = require('fs');
        const path = require('path');

        // Get database stats
        const dbStats = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as totalRecords,
                    MIN(created_at) as oldestRecord,
                    MAX(created_at) as newestRecord
                 FROM audit_logs`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Get file stats
        let fileStats = {
            totalFiles: 0,
            totalSize: 0,
            oldestFile: null,
            newestFile: null
        };

        try {
            const auditDir = auditLogger.auditDir;
            if (fs.existsSync(auditDir)) {
                const files = fs.readdirSync(auditDir).filter(f => 
                    f.startsWith('audit_log_') && f.endsWith('.txt')
                );

                fileStats.totalFiles = files.length;

                if (files.length > 0) {
                    files.sort();
                    fileStats.oldestFile = files[0];
                    fileStats.newestFile = files[files.length - 1];

                    for (const file of files) {
                        const filePath = path.join(auditDir, file);
                        const stats = fs.statSync(filePath);
                        fileStats.totalSize += stats.size;
                    }
                }
            }
        } catch (error) {
            console.error('Error getting file stats:', error);
        }

        return {
            database: dbStats,
            files: fileStats,
            retentionDays: this.retentionDays,
            isCleanupRunning: this.isRunning
        };
    }

    // Update retention policy
    updateRetentionPolicy(newRetentionDays) {
        const oldRetention = this.retentionDays;
        this.retentionDays = newRetentionDays;
        
        console.log(`📅 Retention policy updated: ${oldRetention} → ${newRetentionDays} days`);
        
        // Log the policy change
        auditLogger.writeAuditEntry(
            'SYSTEM',
            'system',
            'Audit Cleanup Service',
            'RETENTION_POLICY_UPDATED',
            `Old: ${oldRetention} days | New: ${newRetentionDays} days`,
            null,
            null
        );
    }

    // Stop the cleanup service
    stop() {
        console.log('🛑 Audit cleanup service stopped');
    }
}

// Create singleton instance
const auditCleanupService = new AuditCleanupService();

module.exports = auditCleanupService;

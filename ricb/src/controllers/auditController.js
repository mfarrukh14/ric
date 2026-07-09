const auditLogger = require('../utils/auditLogger');
const { getDatabase } = require('../config/database');
const auditCleanupService = require('../services/auditCleanupService');
const fs = require('fs');
const path = require('path');

// Get audit logs with filtering options
const getAuditLogs = async (req, res) => {
    const { startDate, endDate, userId, action, page = 1, limit = 50 } = req.query;
    
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }

    try {
        const db = getDatabase();
        let query = `SELECT * FROM audit_logs WHERE 1=1`;
        let params = [];
        
        // Apply filters
        if (startDate) {
            query += ` AND created_at >= ?`;
            params.push(startDate);
        }
        
        if (endDate) {
            query += ` AND created_at <= ?`;
            params.push(endDate);
        }
        
        if (userId) {
            query += ` AND user_id = ?`;
            params.push(userId);
        }
        
        if (action) {
            query += ` AND action LIKE ?`;
            params.push(`%${action}%`);
        }
        
        // Add pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);
        
        const logs = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) as count FROM audit_logs WHERE 1=1`;
        let countParams = [];
        
        if (startDate) {
            countQuery += ` AND created_at >= ?`;
            countParams.push(startDate);
        }
        
        if (endDate) {
            countQuery += ` AND created_at <= ?`;
            countParams.push(endDate);
        }
        
        if (userId) {
            countQuery += ` AND user_id = ?`;
            countParams.push(userId);
        }
        
        if (action) {
            countQuery += ` AND action LIKE ?`;
            countParams.push(`%${action}%`);
        }
        
        const totalCount = await new Promise((resolve, reject) => {
            db.get(countQuery, countParams, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        // Log the audit log access
        await auditLogger.logDataAccess(
            req.user.id,
            req.user.role,
            req.user.name,
            'AUDIT_LOGS_ACCESSED',
            'audit_logs',
            'multiple',
            `Filters: ${JSON.stringify({ startDate, endDate, userId, action })} | Results: ${logs.length}`,
            req
        );

        res.json({
            logs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalRecords: totalCount,
                recordsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch audit logs', detail: error.message });
    }
};

// Download audit logs as text file
const downloadAuditLogs = async (req, res) => {
    const { startDate, endDate, userId, action, format = 'txt' } = req.query;
    
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }

    try {
        // Set default date range if not provided (last 30 days)
        const defaultEndDate = new Date().toISOString();
        const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const actualStartDate = startDate || defaultStartDate;
        const actualEndDate = endDate || defaultEndDate;

        const report = await auditLogger.generateAuditReport(
            actualStartDate,
            actualEndDate,
            userId || null,
            action || null
        );

        // Log the audit log download
        await auditLogger.logDataAccess(
            req.user.id,
            req.user.role,
            req.user.name,
            'AUDIT_LOGS_DOWNLOADED',
            'audit_logs',
            'export',
            `Format: ${format} | Date Range: ${actualStartDate} to ${actualEndDate} | Filters: ${JSON.stringify({ userId, action })}`,
            req
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `audit_trail_${timestamp}.${format}`;

        res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(report);

    } catch (error) {
        console.error('Error downloading audit logs:', error);
        res.status(500).json({ error: 'Failed to generate audit report' });
    }
};

// Get audit statistics
const getAuditStatistics = async (req, res) => {
    const { days = 30 } = req.query;
    
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }

    try {
        const db = getDatabase();
        const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString();
        
        // Get total actions count
        const totalActions = await new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as count FROM audit_logs WHERE created_at >= ?',
                [daysAgo],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });

        // Get actions by user role
        const actionsByRole = await new Promise((resolve, reject) => {
            db.all(
                'SELECT user_role, COUNT(*) as count FROM audit_logs WHERE created_at >= ? GROUP BY user_role',
                [daysAgo],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get most active users
        const mostActiveUsers = await new Promise((resolve, reject) => {
            db.all(
                'SELECT user_name, user_role, COUNT(*) as count FROM audit_logs WHERE created_at >= ? GROUP BY user_id, user_name, user_role ORDER BY count DESC LIMIT 10',
                [daysAgo],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get top actions
        const topActions = await new Promise((resolve, reject) => {
            db.all(
                'SELECT action, COUNT(*) as count FROM audit_logs WHERE created_at >= ? GROUP BY action ORDER BY count DESC LIMIT 10',
                [daysAgo],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get daily activity count
        const dailyActivity = await new Promise((resolve, reject) => {
            db.all(
                `SELECT CAST(created_at AS DATE) as date, COUNT(*) as count 
                 FROM audit_logs 
                 WHERE created_at >= ? 
                 GROUP BY CAST(created_at AS DATE) 
                 ORDER BY date DESC`,
                [daysAgo],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Log the statistics access
        await auditLogger.logDataAccess(
            req.user.id,
            req.user.role,
            req.user.name,
            'AUDIT_STATISTICS_ACCESSED',
            'audit_statistics',
            'dashboard',
            `Period: ${days} days`,
            req
        );

        res.json({
            period: `${days} days`,
            totalActions,
            actionsByRole,
            mostActiveUsers,
            topActions,
            dailyActivity
        });

    } catch (error) {
        console.error('Error fetching audit statistics:', error);
        res.status(500).json({ error: 'Failed to fetch audit statistics' });
    }
};

// Get available audit log files
const getAuditFiles = async (req, res) => {
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }

    try {
        const files = auditLogger.getAuditFiles();
        
        // Get file stats
        const filesWithStats = files.map(filename => {
            const filePath = path.join(auditLogger.auditDir, filename);
            try {
                const stats = fs.statSync(filePath);
                return {
                    filename,
                    size: stats.size,
                    modified: stats.mtime,
                    created: stats.birthtime
                };
            } catch (error) {
                return {
                    filename,
                    size: 0,
                    modified: null,
                    created: null,
                    error: 'Unable to read file stats'
                };
            }
        });

        // Log the file list access
        await auditLogger.logDataAccess(
            req.user.id,
            req.user.role,
            req.user.name,
            'AUDIT_FILES_LIST_ACCESSED',
            'audit_files',
            'list',
            `Files count: ${files.length}`,
            req
        );

        res.json(filesWithStats);

    } catch (error) {
        console.error('Error fetching audit files:', error);
        res.status(500).json({ error: 'Failed to fetch audit files' });
    }
};

// Download specific audit log file
const downloadAuditFile = async (req, res) => {
    const { filename } = req.params;
    
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }

    try {
        // Validate filename to prevent directory traversal
        if (!/^audit_log_\d{4}_\d{2}_\d{2}\.txt$/.test(filename)) {
            return res.status(400).json({ error: 'Invalid filename format' });
        }

        const filePath = path.join(auditLogger.auditDir, filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Log the file download
        await auditLogger.logDataAccess(
            req.user.id,
            req.user.role,
            req.user.name,
            'AUDIT_FILE_DOWNLOADED',
            'audit_file',
            filename,
            'Direct file download',
            req
        );

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Error downloading audit file:', error);
        res.status(500).json({ error: 'Failed to download audit file' });
    }
};

// Search audit logs
const searchAuditLogs = async (req, res) => {
    const { query, startDate, endDate, limit = 100 } = req.query;
    
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }

    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    try {
        const db = getDatabase();
        let sql = `
            SELECT * FROM audit_logs 
            WHERE (action LIKE ? OR details LIKE ? OR user_name LIKE ?)
        `;
        let params = [`%${query}%`, `%${query}%`, `%${query}%`];
        
        if (startDate) {
            sql += ` AND created_at >= ?`;
            params.push(startDate);
        }
        
        if (endDate) {
            sql += ` AND created_at <= ?`;
            params.push(endDate);
        }
        
        sql += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(parseInt(limit));
        
        const results = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Log the search
        await auditLogger.logDataAccess(
            req.user.id,
            req.user.role,
            req.user.name,
            'AUDIT_LOGS_SEARCHED',
            'audit_logs',
            'search',
            `Query: "${query}" | Results: ${results.length}`,
            req
        );

        res.json({
            query,
            results,
            count: results.length
        });

    } catch (error) {
        console.error('Error searching audit logs:', error);
        res.status(500).json({ error: 'Failed to search audit logs' });
    }
};

// Manual cleanup of old audit logs (Superadmin only)
const cleanupAuditLogs = async (req, res) => {
    try {
        const { retentionDays = 365 } = req.body;
        
        if (retentionDays < 30) {
            return res.status(400).json({
                success: false,
                error: 'Retention period cannot be less than 30 days'
            });
        }

        // Log the cleanup request
        await auditLogger.logSystemConfig(
            req.user,
            req.ip,
            req.get('User-Agent'),
            'MANUAL_AUDIT_CLEANUP_REQUESTED',
            `Retention period: ${retentionDays} days`
        );

        // Perform manual cleanup
        await auditCleanupService.manualCleanup(retentionDays);

        res.json({
            success: true,
            message: `Audit logs cleanup completed with ${retentionDays} days retention`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error cleaning up audit logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup audit logs'
        });
    }
};

// Get cleanup service statistics (Superadmin only)
const getCleanupStats = async (req, res) => {
    try {
        const stats = await auditCleanupService.getCleanupStats();
        
        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Error getting cleanup stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get cleanup statistics'
        });
    }
};

// Update retention policy (Superadmin only)
const updateRetentionPolicy = async (req, res) => {
    try {
        const { retentionDays } = req.body;
        
        if (!retentionDays || retentionDays < 30) {
            return res.status(400).json({
                success: false,
                error: 'Retention period must be at least 30 days'
            });
        }

        // Log the policy change
        await auditLogger.logSystemConfig(
            req.user,
            req.ip,
            req.get('User-Agent'),
            'AUDIT_RETENTION_POLICY_UPDATED',
            `New retention period: ${retentionDays} days`
        );

        // Update the policy
        auditCleanupService.updateRetentionPolicy(retentionDays);

        res.json({
            success: true,
            message: `Retention policy updated to ${retentionDays} days`,
            retentionDays
        });

    } catch (error) {
        console.error('Error updating retention policy:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update retention policy'
        });
    }
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
    updateRetentionPolicy
};

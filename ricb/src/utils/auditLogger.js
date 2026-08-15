const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../config/database');

class AuditLogger {
    constructor() {
        this.auditDir = path.join(__dirname, '../../audit_logs');
        
        // Ensure audit directory exists
        if (!fs.existsSync(this.auditDir)) {
            fs.mkdirSync(this.auditDir, { recursive: true });
        }
    }

    // Core logging function that writes to both database and file
    async writeAuditEntry(userId, userRole, userName, action, details, ipAddress, userAgent, requestData = null) {
        const timestamp = new Date().toISOString();
        
        try {
            // Write to database
            await this.logToDatabase(userId, userRole, userName, action, details, ipAddress, userAgent);
            
            // Write to daily log file
            await this.logToFile(userId, userRole, userName, action, details, ipAddress, userAgent, timestamp);
            
        } catch (error) {
            console.error('Error writing audit log:', error);
        }
    }

    // Write to database
    async logToDatabase(userId, userRole, userName, action, details, ipAddress, userAgent) {
        return new Promise((resolve, reject) => {
            const db = getDatabase();
            const query = `
                INSERT INTO audit_logs (user_id, user_role, user_name, action, details, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(query, [userId, userRole, userName, action, details, ipAddress, userAgent], (err) => {
                if (err) {
                    console.error('Database audit log error:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Write to daily log file
    async logToFile(userId, userRole, userName, action, details, ipAddress, userAgent, timestamp) {
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
        const logFile = path.join(this.auditDir, `audit_log_${today}.txt`);
        
        // Format: [timestamp] Username (ID: userId) [ROLE] - ACTION | Details: details | IP: ipAddress | User-Agent: userAgent
        const logEntry = `[${timestamp}] ${userName} (ID: ${userId}) [${userRole.toUpperCase()}] - ${action} | Details: ${details} | IP: ${ipAddress} | User-Agent: ${userAgent}\n`;
        
        return new Promise((resolve, reject) => {
            fs.appendFile(logFile, logEntry, (err) => {
                if (err) {
                    console.error('File audit log error:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Authentication related logging
    async logAuth(userId, userRole, userName, action, details, req) {
        const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
        const userAgent = (req.get && req.get('User-Agent')) || req.headers?.['user-agent'] || 'unknown';
        
        // Only add department/committee info if not already present in details
        let formattedDetails = details;
        if (!details.includes('Department:') && !details.includes('Committee:')) {
            formattedDetails = `${details} | Department: ${req.user?.department || 'None'} | Committee: ${req.user?.committee || 'None'}`;
        }
        
        await this.writeAuditEntry(
            userId,
            userRole,
            userName,
            action,
            formattedDetails,
            ipAddress,
            userAgent
        );
    }

    // Two-factor authentication logging
    async log2FA(userId, userRole, userName, action, details, req) {
        const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
        const userAgent = (req.get && req.get('User-Agent')) || req.headers?.['user-agent'] || 'unknown';
        
        await this.writeAuditEntry(
            userId,
            userRole,
            userName,
            action,
            `2FA: ${details}`,
            ipAddress,
            userAgent
        );
    }

    // User management logging
    async logUserManagement(userId, userRole, userName, action, targetData, req) {
        const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
        const userAgent = (req.get && req.get('User-Agent')) || req.headers?.['user-agent'] || 'unknown';
        
        let details = '';
        if (targetData && typeof targetData === 'object') {
            details = `Target: ${targetData.name || targetData.username || 'unknown'} | Role: ${targetData.role || 'unknown'}`;
            if (targetData.department) details += ` | Department: ${targetData.department}`;
            if (targetData.committee) details += ` | Committee: ${targetData.committee}`;
        } else {
            details = targetData || 'No target data provided';
        }
        
        await this.writeAuditEntry(
            userId,
            userRole,
            userName,
            action,
            details,
            ipAddress,
            userAgent
        );
    }

    // Data access logging
    async logDataAccess(userId, userRole, userName, action, dataType, dataId, details, req) {
        const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
        const userAgent = (req.get && req.get('User-Agent')) || req.headers?.['user-agent'] || 'unknown';
        
        const formattedDetails = `Data Type: ${dataType} | ID: ${dataId} | ${details}`;
        
        await this.writeAuditEntry(
            userId,
            userRole,
            userName,
            action,
            formattedDetails,
            ipAddress,
            userAgent
        );
    }

    // Demand management logging
    async logDemandManagement(userId, userRole, userName, action, demandData, req) {
        const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
        const userAgent = (req.get && req.get('User-Agent')) || req.headers?.['user-agent'] || 'unknown';
        
        let details = '';
        if (typeof demandData === 'object' && demandData !== null) {
            details = `Demand ID: ${demandData.id || 'new'} | Department: ${demandData.department || 'unknown'}`;
            if (demandData.title) details += ` | Title: ${demandData.title}`;
            if (demandData.status) details += ` | Status: ${demandData.status}`;
        } else {
            details = demandData || 'No demand data provided';
        }
        
        await this.writeAuditEntry(
            userId,
            userRole,
            userName,
            action,
            details,
            ipAddress,
            userAgent
        );
    }

    // System configuration logging
    async logSystemConfig(userId, userRole, userName, action, configDetails, req) {
        const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
        const userAgent = (req.get && req.get('User-Agent')) || req.headers?.['user-agent'] || 'unknown';
        
        await this.writeAuditEntry(
            userId,
            userRole,
            userName,
            action,
            `System Config: ${configDetails}`,
            ipAddress,
            userAgent
        );
    }

    // Generate audit report
    async generateAuditReport(startDate, endDate, format = 'json') {
        return new Promise((resolve, reject) => {
            const db = getDatabase();
            let query = `
                SELECT * FROM audit_logs 
                WHERE created_at >= ? AND created_at <= ?
                ORDER BY created_at DESC
            `;
            
            db.all(query, [startDate, endDate], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    if (format === 'txt') {
                        const textReport = rows.map(row => 
                            `[${row.created_at}] ${row.user_name} (ID: ${row.user_id}) [${row.user_role.toUpperCase()}] - ${row.action} | Details: ${row.details} | IP: ${row.ip_address} | User-Agent: ${row.user_agent}`
                        ).join('\n');
                        resolve(textReport);
                    } else {
                        resolve(rows);
                    }
                }
            });
        });
    }

    // Get audit files in the audit directory
    getAuditFiles() {
        try {
            const files = fs.readdirSync(this.auditDir);
            return files
                .filter(file => file.startsWith('audit_log_') && file.endsWith('.txt'))
                .map(file => {
                    const filePath = path.join(this.auditDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        size: stats.size,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => b.modified - a.modified);
        } catch (error) {
            console.error('Error getting audit files:', error);
            return [];
        }
    }

    // Clean up old log files
    cleanupOldLogs(retentionDays) {
        try {
            const files = fs.readdirSync(this.auditDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            
            let deletedCount = 0;
            
            files.forEach(file => {
                if (file.startsWith('audit_log_') && file.endsWith('.txt')) {
                    const filePath = path.join(this.auditDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                        console.log(`Deleted old audit log: ${file}`);
                    }
                }
            });
            
            return deletedCount;
        } catch (error) {
            console.error('Error cleaning up old logs:', error);
            return 0;
        }
    }

    // Search audit logs
    async searchLogs(query, startDate = null, endDate = null) {
        return new Promise((resolve, reject) => {
            const db = getDatabase();
            let sqlQuery = `
                SELECT * FROM audit_logs 
                WHERE (action LIKE ? OR details LIKE ? OR user_name LIKE ?)
            `;
            let params = [`%${query}%`, `%${query}%`, `%${query}%`];
            
            if (startDate) {
                sqlQuery += ` AND created_at >= ?`;
                params.push(startDate);
            }
            
            if (endDate) {
                sqlQuery += ` AND created_at <= ?`;
                params.push(endDate);
            }
            
            sqlQuery += ` ORDER BY created_at DESC LIMIT 1000`;
            
            db.all(sqlQuery, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        results: rows,
                        count: rows.length
                    });
                }
            });
        });
    }
}

// Export singleton instance
module.exports = new AuditLogger();

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const auditController = require('../controllers/auditController');

// Middleware to check if user is superadmin
const isSuperAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }
};

// Get audit logs with filtering and pagination
router.get('/logs', auth, isSuperAdmin, auditController.getAuditLogs);

// Download audit logs as text file
router.get('/download', auth, isSuperAdmin, auditController.downloadAuditLogs);

// Get audit statistics
router.get('/statistics', auth, isSuperAdmin, auditController.getAuditStatistics);

// Get available audit log files
router.get('/files', auth, isSuperAdmin, auditController.getAuditFiles);

// Download specific audit log file
router.get('/files/:filename', auth, isSuperAdmin, auditController.downloadAuditFile);

// Search audit logs
router.get('/search', auth, isSuperAdmin, auditController.searchAuditLogs);

// Manual cleanup of old audit logs
router.post('/cleanup', auth, isSuperAdmin, auditController.cleanupAuditLogs);

// Get cleanup service statistics
router.get('/cleanup/stats', auth, isSuperAdmin, auditController.getCleanupStats);

// Update retention policy
router.put('/retention-policy', auth, isSuperAdmin, auditController.updateRetentionPolicy);

module.exports = router;

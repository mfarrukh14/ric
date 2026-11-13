const express = require('express');
const { superAdminOnly } = require('../middleware/auth');
const audit = require('../controllers/auditController');

const router = express.Router();

router.use(superAdminOnly);
router.get('/logs', audit.getAuditLogs);
router.get('/download', audit.downloadAuditLogs);
router.get('/statistics', audit.getAuditStatistics);
router.get('/files', audit.getAuditFiles);
router.get('/files/:filename', audit.downloadAuditFile);
router.get('/search', audit.searchAuditLogs);
router.post('/cleanup', audit.cleanupAuditLogs);
router.get('/cleanup/stats', audit.getCleanupStats);
router.put('/retention-policy', audit.updateRetentionPolicy);

module.exports = router;

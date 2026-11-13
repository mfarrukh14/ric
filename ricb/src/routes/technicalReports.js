const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const reports = require('../controllers/technicalReportController');

const router = express.Router();

router.use(staffOnly, allow('technicalEvaluation', 'purchase'));
router.get('/archived', reports.getArchivedEvaluations);
router.get('/tender/:tenderId/suppliers', reports.getTenderSuppliers);
router.get('/tender/:tenderId/supplier/:supplierName/comparative-analysis', reports.downloadComparativeAnalysis);
router.get('/tender/:tenderId/supplier/:supplierName/technical-evaluation', reports.downloadTechnicalEvaluation);
router.post('/tender/:tenderId/complete', reports.markEvaluationCompleted);

module.exports = router;

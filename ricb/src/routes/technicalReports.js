const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getArchivedEvaluations,
    getTenderSuppliers,
    downloadComparativeAnalysis,
    downloadTechnicalEvaluation,
    markEvaluationCompleted
} = require('../controllers/technicalReportController');

// Get archived technical evaluations
router.get('/archived', auth, getArchivedEvaluations);

// Get suppliers for a specific tender
router.get('/tender/:tenderId/suppliers', auth, getTenderSuppliers);

// Download comparative analysis Excel report
router.get('/tender/:tenderId/supplier/:supplierName/comparative-analysis', auth, downloadComparativeAnalysis);

// Download technical evaluation DOCX report
router.get('/tender/:tenderId/supplier/:supplierName/technical-evaluation', auth, downloadTechnicalEvaluation);

// Mark evaluation as completed
router.post('/tender/:tenderId/complete', auth, markEvaluationCompleted);

module.exports = router;

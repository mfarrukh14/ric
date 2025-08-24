const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    initiateFinancialGrievance,
    uploadFinancialGrievanceMinutes,
    getFinancialGrievanceStatus
} = require('../controllers/financialGrievanceController');

// Initiate financial grievance process
router.post('/initiate/:tenderId', authenticateToken, initiateFinancialGrievance);

// Upload meeting minutes and distribute
router.post('/upload-minutes/:tenderId', authenticateToken, uploadFinancialGrievanceMinutes);

// Get financial grievance status for a tender
router.get('/status/:tenderId', authenticateToken, getFinancialGrievanceStatus);

module.exports = router;

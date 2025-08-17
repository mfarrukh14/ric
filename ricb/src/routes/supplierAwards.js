const express = require('express');
const router = express.Router();
const {
    getSupplierAwards,
    getAwardDetails,
    downloadAwardLetter,
    updateAwardStatus,
    getSupplierAwardStats
} = require('../controllers/supplierAwardController');
const { authenticateToken } = require('../middleware/auth');

// Get supplier's won bids (awards)
router.get('/', authenticateToken, getSupplierAwards);

// Get award statistics for supplier dashboard
router.get('/stats', authenticateToken, getSupplierAwardStats);

// Get award details by ID
router.get('/:awardId', authenticateToken, getAwardDetails);

// Download award letter
router.get('/:awardId/download', authenticateToken, downloadAwardLetter);

// Update award status (contract signing, completion, etc.)
router.put('/:awardId/status', authenticateToken, updateAwardStatus);

module.exports = router;

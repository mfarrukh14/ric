const express = require('express');
const router = express.Router();
const {
    getTendersReadyForFinancialOpening,
    scheduleFinancialOpening,
    getScheduledFinancialOpenings,
    openFinancialBids,
    awardTenderManually,
    downloadFinancialBid,
    downloadBidCdrDocument,
    downloadFinancialOpeningReport
} = require('../controllers/financialOpeningController');
const { authenticateToken } = require('../middleware/auth');

// Get tenders ready for financial opening
router.get('/ready-tenders', authenticateToken, getTendersReadyForFinancialOpening);

// Schedule financial opening for a tender
router.post('/schedule/:tenderId', authenticateToken, scheduleFinancialOpening);

// Get scheduled financial openings
router.get('/scheduled', authenticateToken, getScheduledFinancialOpenings);

// Open financial bids and display comparative analysis (no automatic award)
router.post('/open/:tenderId', authenticateToken, openFinancialBids);

// Manually award tender after reviewing comparative analysis
router.post('/award/:tenderId', authenticateToken, awardTenderManually);

// Download financial bid document
router.get('/bids/:bidId/financial-document', authenticateToken, downloadFinancialBid);

// Download bid CDR document
router.get('/bids/:bidId/bid-cdr-document', authenticateToken, downloadBidCdrDocument);

// Download financial opening report
router.get('/reports/:fileName', authenticateToken, downloadFinancialOpeningReport);

module.exports = router;

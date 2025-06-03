const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getExpiredTenders,
    getTenderDetails,
    downloadTechnicalBid,
    awardTender
} = require('../controllers/technicalEvaluationController');

// Get expired tenders for technical evaluation
router.get('/expired-tenders', auth, getExpiredTenders);

// Get specific tender details with all bids
router.get('/tenders/:tenderId', auth, getTenderDetails);

// Download technical bid document
router.get('/bids/:bidId/technical-document', auth, downloadTechnicalBid);

// Award tender to selected supplier
router.post('/tenders/:tenderId/award', auth, awardTender);

module.exports = router;
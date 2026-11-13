const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const opening = require('../controllers/financialOpeningController');

const router = express.Router();

router.use(staffOnly, allow('purchase'));
router.get('/ready-tenders', opening.getTendersReadyForFinancialOpening);
router.get('/scheduled', opening.getScheduledFinancialOpenings);
router.post('/schedule/:tenderId', opening.scheduleFinancialOpening);
router.post('/open/:tenderId', opening.openFinancialBids); // comparative analysis only, no auto-award
router.get('/bids/:bidId/financial-document', opening.downloadFinancialBid);
router.get('/bids/:bidId/bid-cdr-document', opening.downloadBidCdrDocument);
router.get('/reports/:fileName', opening.downloadFinancialOpeningReport);

module.exports = router;

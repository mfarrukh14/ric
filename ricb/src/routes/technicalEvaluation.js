const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const evaluation = require('../controllers/technicalEvaluationController');

const router = express.Router();

router.use(staffOnly);
router.get('/expired-tenders', allow('technicalEvaluation'), evaluation.getExpiredTenders);
router.get('/tenders/:tenderId', allow('technicalEvaluation'), evaluation.getTenderDetails);
router.get('/bids/:bidId/technical-document', allow('technicalEvaluation', 'purchase'), evaluation.downloadTechnicalBid);
router.post('/tenders/:tenderId/item-wise-evaluation', allow('technicalEvaluation'), evaluation.submitItemWiseEvaluation);
router.post('/tenders/:tenderId/award', allow('technicalEvaluation'), evaluation.awardTender);
router.get('/reports/:fileName', allow('technicalEvaluation', 'purchase'), evaluation.downloadEvaluationReport);

module.exports = router;

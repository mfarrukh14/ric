const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const vettingController = require('../controllers/vettingController');

// Existing demand vetting routes
router.get('/demands', auth, vettingController.getVettingDemands);
router.put('/demands/:id/evaluate', auth, vettingController.evaluateDemandVetting);

// New tender vetting routes
router.get('/tenders/pending', auth, vettingController.getPendingTenders);
router.get('/tenders/all', auth, vettingController.getAllVettingTenders);
router.get('/tenders/:tenderId', auth, vettingController.getTenderForVetting);
router.post('/tenders/:tenderId/evaluate', auth, vettingController.submitTenderVettingEvaluation);
router.get('/committee/members', auth, vettingController.getVettingCommitteeMembers);

module.exports = router;

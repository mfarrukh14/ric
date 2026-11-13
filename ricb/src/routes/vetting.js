const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const vetting = require('../controllers/vettingController');

const router = express.Router();

router.use(staffOnly, allow('vetting'));
router.get('/tenders/pending', vetting.getPendingTenders);
router.get('/tenders/all', vetting.getAllVettingTenders);
router.get('/tenders/:tenderId', vetting.getTenderForVetting);
router.post('/tenders/:tenderId/evaluate', vetting.submitTenderVettingEvaluation);
router.put('/tenders/:tenderId/update-items', vetting.updateTenderItems);
router.get('/committee/members', vetting.getVettingCommitteeMembers);

module.exports = router;

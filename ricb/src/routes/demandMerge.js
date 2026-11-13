const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const merge = require('../controllers/demandMergeController');

const router = express.Router();

router.use(staffOnly, allow('store'));
router.get('/eligible', merge.getDemandsForMerging);
router.post('/validate', merge.validateDemandMerging);
router.post('/merge', merge.mergeDemands);
router.get('/history', merge.getMergeHistory);

module.exports = router;

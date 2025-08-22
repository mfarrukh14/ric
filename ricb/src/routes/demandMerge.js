const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
    getDemandsForMerging,
    validateDemandMerging,
    mergeDemands,
    getMergeHistory
} = require('../controllers/demandMergeController');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get demands eligible for merging (store department only)
router.get('/eligible', getDemandsForMerging);

// Validate if selected demands can be merged
router.post('/validate', validateDemandMerging);

// Merge selected demands into a new demand
router.post('/merge', mergeDemands);

// Get merge history
router.get('/history', getMergeHistory);

module.exports = router;

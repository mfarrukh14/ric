const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const {
    getSupplierRejectedItems,
    submitGrievanceApplication,
    getSupplierGrievances,
    getAllGrievances,
    scheduleGrievanceMeeting,
    updateGrievanceStatus
} = require('../controllers/grievanceController');

// Routes for suppliers
router.get('/supplier/rejected-items', authenticateToken, getSupplierRejectedItems);
router.post('/supplier/submit', authenticateToken, submitGrievanceApplication);
router.get('/supplier/my-grievances', authenticateToken, getSupplierGrievances);

// Routes for grievance committee
router.get('/committee/all', authenticateToken, getAllGrievances);
router.post('/committee/:grievanceId/schedule-meeting', authenticateToken, scheduleGrievanceMeeting);
router.patch('/committee/:grievanceId/status', authenticateToken, updateGrievanceStatus);

module.exports = router;
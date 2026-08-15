const express = require('express');
const router = express.Router();
const purchaseGrievanceController = require('../controllers/purchaseGrievanceController');

// Get all pending grievances for purchase department
router.get('/pending', purchaseGrievanceController.getPendingGrievances);

// Get all grievances (pending, approved, rejected)
router.get('/all', purchaseGrievanceController.getAllGrievances);

// Approve a grievance and send notification to supplier
router.post('/:grievanceId/approve', purchaseGrievanceController.approveGrievance);

// Reject a grievance (supplier will not be notified)
router.post('/:grievanceId/reject', purchaseGrievanceController.rejectGrievance);

// Bulk approve grievances
router.post('/bulk-approve', purchaseGrievanceController.bulkApproveGrievances);

module.exports = router;

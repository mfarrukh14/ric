const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const controller = require('../controllers/purchaseGrievanceController');

const router = express.Router();

// Previously mounted with no authentication at all: anyone could approve or reject grievances.
router.use(staffOnly, allow('purchase'));

router.get('/pending', controller.getPendingGrievances);
router.get('/all', controller.getAllGrievances);
router.post('/bulk-approve', controller.bulkApproveGrievances);
router.post('/:grievanceId/approve', controller.approveGrievance);
router.post('/:grievanceId/reject', controller.rejectGrievance);

module.exports = router;

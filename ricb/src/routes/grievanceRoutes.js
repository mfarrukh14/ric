const express = require('express');
const { staffOnly, approvedSupplierOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const { createUpload, MIME } = require('../middleware/uploads');
const grievance = require('../controllers/grievanceController');

const router = express.Router();

const grievanceLetter = createUpload({
    dir: 'grievance-letters',
    prefix: 'grievance-letter',
    accept: MIME.pdf,
    typeError: 'Only PDF files are allowed for grievance letters.',
}).single('grievanceLetter');

const minutesOfMeeting = createUpload({
    dir: 'uploads/grievance-minutes',
    prefix: 'grievance-minutes',
    accept: MIME.pdf,
    typeError: 'Only PDF files are allowed for minutes of meeting.',
}).single('minutesOfMeeting');

// Suppliers
router.get('/supplier/rejected-items', approvedSupplierOnly, grievance.getSupplierRejectedItems);
router.post('/supplier/submit', approvedSupplierOnly, grievance.submitGrievanceApplication);
router.get('/supplier/my-grievances', approvedSupplierOnly, grievance.getSupplierGrievances);
router.get('/supplier/deadline-status', approvedSupplierOnly, grievance.checkGrievanceDeadlineExpired);

// Grievance committee
router.get('/committee/all', staffOnly, allow('grievance'), grievance.getAllGrievances);
router.post('/committee/upload-minutes', staffOnly, allow('grievance'), minutesOfMeeting, grievance.uploadMinutesOfMeeting);
router.post('/committee/schedule-bulk-meeting', staffOnly, allow('grievance'), grievanceLetter, grievance.scheduleBulkGrievanceMeeting);
router.post('/committee/:grievanceId/schedule-meeting', staffOnly, allow('grievance'), grievanceLetter, grievance.scheduleGrievanceMeeting);
router.patch('/committee/:grievanceId/status', staffOnly, allow('grievance'), grievance.updateGrievanceStatus);
router.patch('/committee/:grievanceId/approve', staffOnly, allow('grievance'), grievance.approveGrievance);
router.patch('/committee/:grievanceId/reject', staffOnly, allow('grievance'), grievance.rejectGrievance);

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middleware/auth');
const {
    getSupplierRejectedItems,
    submitGrievanceApplication,
    getSupplierGrievances,
    getAllGrievances,
    scheduleGrievanceMeeting,
    scheduleBulkGrievanceMeeting,
    updateGrievanceStatus,
    approveGrievance,
    rejectGrievance,
    checkGrievanceDeadlineExpired,
    uploadMinutesOfMeeting,
    uploadMinutes
} = require('../controllers/grievanceController');

// Create grievance-letters directory if it doesn't exist
const grievanceLettersDir = path.join(__dirname, '../../grievance-letters');
if (!fs.existsSync(grievanceLettersDir)) {
    fs.mkdirSync(grievanceLettersDir, { recursive: true });
}

// Configure multer for grievance letter uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, grievanceLettersDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'grievance-letter-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed for grievance letters'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    }
});

// Routes for suppliers
router.get('/supplier/rejected-items', authenticateToken, getSupplierRejectedItems);
router.post('/supplier/submit', authenticateToken, submitGrievanceApplication);
router.get('/supplier/my-grievances', authenticateToken, getSupplierGrievances);
router.get('/supplier/deadline-status', authenticateToken, checkGrievanceDeadlineExpired);

// Routes for grievance committee
router.get('/committee/all', authenticateToken, getAllGrievances);
router.post('/committee/upload-minutes', authenticateToken, uploadMinutes.single('minutesOfMeeting'), uploadMinutesOfMeeting);
router.post('/committee/:grievanceId/schedule-meeting', authenticateToken, upload.single('grievanceLetter'), scheduleGrievanceMeeting);
router.post('/committee/schedule-bulk-meeting', authenticateToken, upload.single('grievanceLetter'), scheduleBulkGrievanceMeeting);
router.patch('/committee/:grievanceId/status', authenticateToken, updateGrievanceStatus);
router.patch('/committee/:grievanceId/approve', authenticateToken, approveGrievance);
router.patch('/committee/:grievanceId/reject', authenticateToken, rejectGrievance);

module.exports = router;
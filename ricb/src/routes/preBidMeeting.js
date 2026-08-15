const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    schedulePreBidMeeting,
    getPreBidMeetings,
    uploadMeetingMinutes,
    downloadMeetingMinutes,
    cancelPreBidMeeting
} = require('../controllers/preBidMeetingController');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for meeting minutes upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../meeting-minutes');
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('Created meeting-minutes directory:', uploadDir);
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'meeting-minutes-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only PDF and DOC/DOCX files
    const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF, DOC, and DOCX files are allowed for meeting minutes'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Schedule pre-bid meeting for a tender
router.post('/schedule/:tenderId', authenticateToken, schedulePreBidMeeting);

// Get all pre-bid meetings for purchase department
router.get('/', authenticateToken, getPreBidMeetings);

// Upload meeting minutes after meeting completion
router.post('/minutes/:meetingId', authenticateToken, upload.single('meetingMinutes'), uploadMeetingMinutes);

// Download meeting minutes
router.get('/minutes/:meetingId/download', authenticateToken, downloadMeetingMinutes);

// Cancel pre-bid meeting
router.put('/cancel/:meetingId', authenticateToken, cancelPreBidMeeting);

module.exports = router;

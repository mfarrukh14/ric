const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    getTendersReadyForLetterOfIntent,
    sendLetterOfIntent,
    getSuppliersWithLetterOfIntent,
    sendLetterOfAward,
    finalizeLetterOfAwardFromFinance,
    getAllLetters,
    getLetterDetails,
    downloadLetter,
    getSuppliersForIntent
} = require('../controllers/letterController');
const { authenticateToken } = require('../middleware/auth');

const financeCallbackAuth = (req, res, next) => {
    const expected = process.env.FINANCE_CALLBACK_TOKEN;
    const provided = req.headers['x-finance-token'];
    if (!expected) {
        console.warn('FINANCE_CALLBACK_TOKEN not configured; rejecting callback');
        return res.status(500).json({ error: 'Finance callback token not configured' });
    }
    if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Configure multer for letter file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../tender-letters');
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('Created tender-letters directory:', uploadDir);
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        const fileBaseName = path.basename(file.originalname, fileExtension);
        cb(null, `letter-${fileBaseName}-${uniqueSuffix}${fileExtension}`);
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
        cb(new Error('Only PDF, DOC, and DOCX files are allowed for letters'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Get tenders ready for letter of intent (after financial opening)
router.get('/intent/ready-tenders', authenticateToken, getTendersReadyForLetterOfIntent);

// Send letter of intent to suppliers
router.post('/intent/send/:tenderId', authenticateToken, upload.single('letterFile'), sendLetterOfIntent);

// Get approved suppliers for Intent selection
router.get('/intent/suppliers/:tenderId', authenticateToken, getSuppliersForIntent);

// Get suppliers who received letter of intent for a tender (different endpoint)
router.get('/intent/recipients/:tenderId', authenticateToken, getSuppliersWithLetterOfIntent);

// Send letter of award to selected suppliers
router.post('/award/send/:tenderId', authenticateToken, upload.single('letterFile'), sendLetterOfAward);

// Finance callback: after final Asaan Cheque approval, eProc sends pending award letters automatically
router.post('/award/finalize-from-finance', financeCallbackAuth, finalizeLetterOfAwardFromFinance);

// Get all letters sent by purchase department
router.get('/', authenticateToken, getAllLetters);

// Get letter details with recipients
router.get('/:letterId', authenticateToken, getLetterDetails);

// Download letter file
router.get('/:letterId/download', authenticateToken, downloadLetter);

module.exports = router;

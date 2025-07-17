const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const {
    sendRegistrationOTP,
    verifyEmailOTP,
    verifySMSOTP,
    completeRegistration,
    resendOTP,
    legacyRegisterSupplier,
    loginSupplier,
    getPendingSuppliers,
    getSupplierDetails,
    submitEvaluation,
    downloadDocument,
    getActiveTenders,
    submitBid,
    getSupplierBids
} = require('../controllers/supplierController');

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to allow only PDF files
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
    }
});

// Define upload fields for registration documents
const uploadRegistrationFields = upload.fields([
    { name: 'professionalTaxCert', maxCount: 1 },
    { name: 'ntnDocument', maxCount: 1 },
    { name: 'drugSaleLicense', maxCount: 1 },
    { name: 'pecDocument', maxCount: 1 },
    { name: 'gstDocument', maxCount: 1 }
]);

// Define upload fields for bid documents
const uploadBidFields = upload.fields([
    { name: 'technicalBid', maxCount: 1 },
    { name: 'financialBid', maxCount: 1 }
]);

// Public routes
router.post('/register/send-otp', uploadRegistrationFields, sendRegistrationOTP);
router.post('/register/verify-email-otp', verifyEmailOTP);
router.post('/register/verify-sms-otp', verifySMSOTP);
router.post('/register/complete', completeRegistration);
router.post('/register/resend-otp', resendOTP);
router.post('/login', loginSupplier);

// Protected routes (for evaluation committee)
router.get('/pending', auth, getPendingSuppliers);
router.get('/:id', auth, getSupplierDetails);
router.post('/:supplierId/evaluate', auth, submitEvaluation);
router.get('/:supplierId/document/:documentType', auth, downloadDocument);

// Get active tenders for suppliers
router.get('/tenders/active', auth, getActiveTenders);

// Submit bid for a tender
router.post('/tenders/:tenderId/bid', auth, uploadBidFields, submitBid);

// Get supplier's own bids
router.get('/bids/my-bids', auth, getSupplierBids);

// Test email endpoint (for development/testing)
router.post('/test-email', auth, async (req, res) => {
    try {
        const EmailService = require('../utils/emailService');
        const emailService = new EmailService();
        
        // Test email configuration
        const isConnected = await emailService.testConnection();
        if (!isConnected) {
            return res.status(500).json({ error: 'Email service configuration error' });
        }

        const { email, companyName } = req.body;
        if (!email || !companyName) {
            return res.status(400).json({ error: 'Email and company name are required' });
        }

        await emailService.sendSupplierApprovalEmail(email, companyName);
        res.json({ message: 'Test email sent successfully' });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ error: 'Failed to send test email: ' + error.message });
    }
});

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File too large. Please upload a file smaller than 10MB.'
            });
        }
        return res.status(400).json({ 
            error: 'File upload error. Please try again.'
        });
    }
    
    if (error.message.includes('Only PDF files are allowed')) {
        return res.status(400).json({ 
            error: 'Only PDF files are allowed.'
        });
    }
    
    // Pass other errors to default error handler
    next(error);
});

module.exports = router;

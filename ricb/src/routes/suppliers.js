const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const { acknowledgeCriteria } = require('../controllers/tenderController');
const {
    registerSupplier,
    loginSupplier,
    sendEmailOTP,
    verifyEmailOTP,
    saveRegistrationStep,
    submitApplication,
    getPendingSuppliers,
    getSupplierDetails,
    submitEvaluation,
    downloadDocument,
    getActiveTenders,
    submitBid,
    getSupplierBids,
    getComprehensiveSupplierData,
    getSupplierRegistrationData,
    requestResubmission,
    // Grievance-related functions
    submitGrievance,
    getSupplierGrievances,
    getRejectedItems,
    getDeadlineStatus,
    // Legacy functions for backward compatibility
    sendRegistrationOTP,
    verifySMSOTP,
    completeRegistration,
    resendOTP,
    legacyRegisterSupplier
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
router.post('/register', registerSupplier);
router.post('/login', loginSupplier);
router.post('/send-email-otp', sendEmailOTP);
router.post('/verify-email-otp', verifyEmailOTP);
router.post('/registration/save-step', saveRegistrationStep);
router.post('/registration/submit', uploadRegistrationFields, submitApplication);

// Legacy routes for backward compatibility
router.post('/register/send-otp', uploadRegistrationFields, sendRegistrationOTP);
router.post('/register/verify-email-otp', verifyEmailOTP);
router.post('/register/verify-sms-otp', verifySMSOTP);
router.post('/register/complete', completeRegistration);
router.post('/register/resend-otp', resendOTP);

// Protected routes (for supplier evaluation committee)
router.get('/pending', auth, getPendingSuppliers);
router.get('/registration-data', auth, getSupplierRegistrationData);
router.get('/tenders/active', auth, getActiveTenders);
router.get('/:id', auth, getSupplierDetails);
router.get('/:id/comprehensive', auth, getComprehensiveSupplierData);
router.get('/:supplierId/registration-data', auth, getSupplierRegistrationData);
router.post('/:supplierId/evaluate', auth, submitEvaluation);
router.post('/:supplierId/request-resubmit', auth, requestResubmission);
router.get('/:supplierId/document/:documentType', auth, downloadDocument);

// Submit bid for a tender
router.post('/tenders/:tenderId/bid', auth, uploadBidFields, submitBid);

// Acknowledge knockout clauses / evaluation criteria prior to bid
router.post('/tenders/:tenderId/acknowledge', auth, acknowledgeCriteria);

// Get supplier's own bids
router.get('/bids/my-bids', auth, getSupplierBids);

// Grievance routes
router.post('/grievances/submit', auth, submitGrievance);
router.get('/grievances/my-grievances', auth, getSupplierGrievances);
router.get('/grievances/rejected-items', auth, getRejectedItems);
router.get('/grievances/deadline-status', auth, getDeadlineStatus);

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

// Test route without authentication for debugging
router.get('/test-comprehensive/:id', getComprehensiveSupplierData);

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

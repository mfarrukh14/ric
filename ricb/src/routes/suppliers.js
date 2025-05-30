const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const {
    registerSupplier,
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

// File filter to allow only PDF and DOCX files
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF and DOCX files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
    }
});

// Define upload fields for documents
const uploadFields = upload.fields([
    { name: 'professionalTaxCert', maxCount: 1 },
    { name: 'ntnDocument', maxCount: 1 },
    { name: 'drugSaleLicense', maxCount: 1 },
    { name: 'pecDocument', maxCount: 1 },
    { name: 'gstDocument', maxCount: 1 }
]);

// Public routes
router.post('/register', uploadFields, registerSupplier);
router.post('/login', loginSupplier);

// Protected routes (for evaluation committee)
router.get('/pending', auth, getPendingSuppliers);
router.get('/:id', auth, getSupplierDetails);
router.post('/:supplierId/evaluate', auth, submitEvaluation);
router.get('/:supplierId/document/:documentType', auth, downloadDocument);

// Get active tenders for suppliers
router.get('/tenders/active', auth, getActiveTenders);

// Submit bid for a tender
router.post('/tenders/:tenderId/bid', auth, submitBid);

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

module.exports = router;

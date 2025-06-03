const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    createDemand,
    getUserDemands,
    getAllDemands,
    updateDemandStatus,
    getDemandById,
    getVettingDemands,
    getPurchaseDemands,
    evaluateDemandVetting,
    evaluateDemandPurchase,
    processExpiredTenders,
    getAwardedTenders,
    generateSupplyOrderPDF,
    approveDemand,
    setExpiryForTender,
    getSupplyOrders,
    generateSupplyOrderPDFById,
    updateDemandItemsStatus,
    getDemandWithItems,
    getAllDemandsWithItems,
    updateItemStatuses
} = require('../controllers/demandController');

// Create tender documents directory if it doesn't exist
const tenderDocsDir = path.join(__dirname, '../../tender-documents');
if (!fs.existsSync(tenderDocsDir)) {
    fs.mkdirSync(tenderDocsDir, { recursive: true });
}

// Configure multer for tender document uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, tenderDocsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'tenderDocument') {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Tender document must be a PDF file'), false);
        }
    } else if (file.fieldname === 'itemsList') {
        const allowedTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Items list must be an Excel or CSV file'), false);
        }
    } else {
        cb(new Error('Unexpected file field'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
    }
});

const uploadTenderFiles = upload.fields([
    { name: 'tenderDocument', maxCount: 1 },
    { name: 'itemsList', maxCount: 1 }
]);

// Create a new demand
router.post('/', auth, createDemand);

// Get current user's demands
router.get('/user', auth, getUserDemands);

// Get all demands (for superadmin and store department)
router.get('/all', auth, getAllDemands);

// Get all demands with items (for store management)
router.get('/with-items', auth, getAllDemandsWithItems);

// Get demands for vetting committee (must be before /:id route)
router.get('/vetting', auth, getVettingDemands);
router.get('/vetting/pending', auth, getVettingDemands);

// Get demands for purchase department
router.get('/purchase', auth, getPurchaseDemands);
router.get('/purchase/pending', auth, getPurchaseDemands);

// Get awarded tenders
router.get('/awarded/all', auth, getAwardedTenders);

// Get supply orders
router.get('/supply-orders/all', auth, getSupplyOrders);

// Generate supply order PDF by ID
router.get('/supply-orders/:id/pdf', auth, generateSupplyOrderPDFById);

// Get specific demand by ID (must be after specific routes)
router.get('/:id', auth, getDemandById);

// Get demand with all items
router.get('/:id/with-items', auth, getDemandWithItems);

// Update demand status (for store department)
router.put('/:id/status', auth, updateDemandStatus);

// Update item statuses with fulfillment management
router.put('/:id/items-status', auth, updateItemStatuses);

// Update demand items status with partial quantities
router.put('/:id/items', auth, updateDemandItemsStatus);

// Evaluate demand in vetting
router.put('/:id/vetting', auth, evaluateDemandVetting);

// Evaluate demand in purchase department
router.put('/:id/purchase', auth, evaluateDemandPurchase);

// Process expired tenders
router.post('/process-expired', auth, processExpiredTenders);

// Generate supply order PDF
router.post('/:id/supply-order', auth, generateSupplyOrderPDF);

// Approve demand (for superadmin)
router.put('/:id/approve', auth, uploadTenderFiles, approveDemand);

// Set expiry for tender
router.put('/:id/set-expiry', auth, setExpiryForTender);

module.exports = router;

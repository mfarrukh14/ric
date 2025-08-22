const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const auth = require('../middleware/auth');

// Import from separate controllers
const {
    createDemand,
    getUserDemands,
    getAllDemands,
    getDemandById,
    getDemandWithItems,
    getAllDemandsWithItems,
    rejectDemand,
    getDemandItemsPaginated,
    generateDemandExcelReport
} = require('../controllers/demandController');

const {
    updateDemandStatus,
    updateDemandItemsStatus,
    updateItemStatuses
} = require('../controllers/storeController');

const {
    getPurchaseDemands,
    evaluateDemandPurchase,
    approveDemand,
    setExpiryForTender,
    getSupplyOrders,
    getTendersWithVettingStatus,
    publishApprovedTender
} = require('../controllers/purchaseController');

const {
    processExpiredTenders,
    getAwardedTenders,
    generateSupplyOrderPDF,
    generateSupplyOrderPDFById,
    createTenderWithCriteria,
    getTenderWithCriteria,
    acknowledgeCriteria,
    addTenderCriteria,
    getTendersPendingOpening,
    getTenderOpeningDetails,
    generateTenderOpeningReport,
    openTender,
    getPublishedTenders
} = require('../controllers/tenderController');

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

// Evaluate demand in purchase department
router.put('/:id/purchase', auth, evaluateDemandPurchase);

// Process expired tenders
router.post('/process-expired', auth, processExpiredTenders);

// Get tenders pending opening (for purchase department)
router.get('/tenders/pending-opening', auth, getTendersPendingOpening);

// Get single tender opening details (for purchase department)
router.get('/tenders/pending-opening/:tenderId', auth, getTenderOpeningDetails);

// Generate tender opening report PDF
router.get('/tenders/:tenderId/opening-report', auth, generateTenderOpeningReport);

// Open tender and forward to technical evaluation (for purchase department)
router.post('/tenders/:tenderId/open', auth, openTender);

// Generate supply order PDF
router.post('/:id/supply-order', auth, generateSupplyOrderPDF);

// Approve demand (for superadmin)
router.put('/:id/approve', auth, uploadTenderFiles, approveDemand);

// Set expiry for tender
router.put('/:id/set-expiry', auth, setExpiryForTender);

// Download tender document
router.get('/tenders/:tenderId/tender-document', auth, async (req, res) => {
    const db = require('../config/database').getDatabase();
    const { tenderId } = req.params;
    
    try {
        // Get tender document path from database
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT tender_document_path FROM demand_tenders WHERE id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender || !tender.tender_document_path) {
            return res.status(404).json({ message: 'Tender document not found' });
        }

        // Use the stored path directly (it's already absolute)
        const filePath = tender.tender_document_path;
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Tender document file not found' });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="tender-document-${tenderId}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');
        
        // Send file
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error downloading tender document:', error);
        res.status(500).json({ message: 'Failed to download tender document' });
    }
});

// Download items list
router.get('/tenders/:tenderId/items-list', auth, async (req, res) => {
    const db = require('../config/database').getDatabase();
    const { tenderId } = req.params;
    
    try {
        // Get items list path from database
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT items_list_path FROM demand_tenders WHERE id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender || !tender.items_list_path) {
            return res.status(404).json({ message: 'Items list not found' });
        }

        const filePath = tender.items_list_path;
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Items list file not found' });
        }

        // Determine content type and filename based on file extension
        const ext = path.extname(filePath).toLowerCase();
        let contentType;
        let filename;
        
        if (ext === '.csv') {
            contentType = 'text/csv';
            filename = `items-list-${tenderId}.csv`;
        } else if (ext === '.xlsx') {
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            filename = `items-list-${tenderId}.xlsx`;
        } else if (ext === '.xls') {
            contentType = 'application/vnd.ms-excel';
            filename = `items-list-${tenderId}.xls`;
        } else {
            contentType = 'application/octet-stream';
            filename = `items-list-${tenderId}${ext}`;
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);
        
        // Send file
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error downloading items list:', error);
        res.status(500).json({ message: 'Failed to download items list' });    }
});

// New tender creation routes
router.post('/tenders/create', auth, uploadTenderFiles, createTenderWithCriteria);

// Reject demand with reason
router.post('/:id/reject', auth, rejectDemand);

// Get demand items with pagination
router.get('/:id/items', auth, getDemandItemsPaginated);

// Get Excel report for demand
router.get('/:id/excel-report', auth, (req, res) => {
    console.log(`[DEBUG] Excel report endpoint hit for demand ID: ${req.params.id}`);
    return generateDemandExcelReport(req, res);
});

// Check if tender exists for a demand
router.get('/:demandId/tender/exists', auth, async (req, res) => {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    const { demandId } = req.params;

    try {
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, tender_status FROM demand_tenders WHERE demand_id = ?',
                [demandId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (tender) {
            res.json({ exists: true, tenderId: tender.id, status: tender.tender_status });
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        console.error('Error checking tender existence:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get tender with evaluation criteria (for suppliers)
router.get('/tenders/:tenderId/details', auth, getTenderWithCriteria);

// Get published tenders for pre-bid meeting scheduling
router.get('/tenders/published', auth, getPublishedTenders);

// Acknowledge evaluation criteria (for suppliers)
router.post('/tenders/:tenderId/acknowledge', auth, acknowledgeCriteria);

// Append criteria (including scoring) to an existing tender
router.post('/tenders/:tenderId/add-criteria', auth, addTenderCriteria);

// Purchase department routes for vetting workflow
router.get('/purchase/tenders-vetting-status', auth, getTendersWithVettingStatus);
router.post('/purchase/tenders/:tenderId/publish', auth, publishApprovedTender);

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
    
    if (error.message.includes('PDF files are allowed') || error.message.includes('Excel or CSV file')) {
        return res.status(400).json({ 
            error: error.message
        });
    }
    
    // Pass other errors to default error handler
    next(error);
});

module.exports = router;

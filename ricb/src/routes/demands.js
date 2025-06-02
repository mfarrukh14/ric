const express = require('express');
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
router.put('/:id/approve', auth, approveDemand);

// Set expiry for tender
router.put('/:id/set-expiry', auth, setExpiryForTender);

module.exports = router;

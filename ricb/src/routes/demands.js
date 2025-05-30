const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    createDemand,
    getUserDemands,
    getAllDemands,
    getVettingDemands,
    getPurchaseDemands,
    updateDemandStatus,
    evaluateDemandVetting,
    evaluateDemandPurchase,
    getDemandById,
    getAwardedTenders,
    generateSupplyOrderPDF,
    approveDemand,
    setExpiryForTender,
    getSupplyOrders,
    generateSupplyOrderPDFById
} = require('../controllers/demandController');

// Create a new demand
router.post('/', auth, createDemand);

// Get current user's demands
router.get('/user', auth, getUserDemands);

// Get all demands (for superadmin and store department)
router.get('/all', auth, getAllDemands);

// Get vetting committee demands
router.get('/vetting', auth, getVettingDemands);

// Get purchase department demands
router.get('/purchase', auth, getPurchaseDemands);

// Get awarded tenders
router.get('/tenders/awarded', auth, getAwardedTenders);

// Generate supply order PDF
router.get('/tenders/:tenderId/pdf', auth, generateSupplyOrderPDF);

// Approve demand (for purchase department) 
router.post('/:id/approve', auth, approveDemand);

// Set expiry for tender (for purchase department)
router.post('/:id/set-expiry', auth, setExpiryForTender);

// Get specific demand by ID
router.get('/:id', auth, getDemandById);

// Update demand status (for store department)
router.patch('/:id/status', auth, updateDemandStatus);

// Evaluate demand by vetting committee
router.post('/:id/evaluate-vetting', auth, evaluateDemandVetting);

// Evaluate demand by purchase department
router.post('/:id/evaluate-purchase', auth, evaluateDemandPurchase);

// Get supply orders (for purchase department dashboard)
router.get('/supply-orders/all', auth, getSupplyOrders);

// Generate supply order PDF by order ID
router.get('/supply-orders/:orderId/pdf', auth, generateSupplyOrderPDFById);

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    createPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    getPurchaseOrderByNumber,
    getAwardedSuppliersForTender,
    updatePurchaseOrderStatus,
    getPurchaseOrdersByAwardLetter
} = require('../controllers/purchaseOrderController');

// Create a new purchase order
router.post('/', authenticateToken, createPurchaseOrder);

// Get all purchase orders (with optional filters)
router.get('/', authenticateToken, getPurchaseOrders);

// Public read-only access for finance app
router.get('/public', getPurchaseOrders);

// Get awarded suppliers for a tender (for creating PO)
router.get('/tender/:tenderId/awarded-suppliers', authenticateToken, getAwardedSuppliersForTender);

// Get purchase orders by award letter ID
router.get('/award-letter/:awardLetterId', authenticateToken, getPurchaseOrdersByAwardLetter);

// Get purchase order by PO number
router.get('/by-number/:poNumber', authenticateToken, getPurchaseOrderByNumber);

// Get purchase order by ID
router.get('/:id', authenticateToken, getPurchaseOrderById);

// Update purchase order status
router.patch('/:id/status', authenticateToken, updatePurchaseOrderStatus);

module.exports = router;

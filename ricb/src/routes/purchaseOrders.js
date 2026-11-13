const express = require('express');
const { staffOnly, requireFinanceToken } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const orders = require('../controllers/purchaseOrderController');

const router = express.Router();

// Read-only feed for the Finance module. It used to be public; it now needs the
// shared X-Finance-Token header (FINANCE_CALLBACK_TOKEN), the same secret the
// Finance callback already uses.
router.get('/public', requireFinanceToken, orders.getPurchaseOrders);

router.use(staffOnly);
router.post('/', allow('purchase'), orders.createPurchaseOrder);
router.get('/', allow('purchase', 'store'), orders.getPurchaseOrders);
router.get('/tender/:tenderId/awarded-suppliers', allow('purchase'), orders.getAwardedSuppliersForTender);
router.get('/award-letter/:awardLetterId', allow('purchase'), orders.getPurchaseOrdersByAwardLetter);
router.get('/by-number/:poNumber', allow('purchase'), orders.getPurchaseOrderByNumber);
router.get('/:id', allow('purchase', 'store'), orders.getPurchaseOrderById);
router.patch('/:id/status', allow('purchase'), orders.updatePurchaseOrderStatus);

module.exports = router;

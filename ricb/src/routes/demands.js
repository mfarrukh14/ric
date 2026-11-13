const express = require('express');
const path = require('path');
const { authenticate, staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const { createUpload, MIME } = require('../middleware/uploads');
const { dbGet } = require('../db');
const { sendStoredFile } = require('../utils/files');

const demand = require('../controllers/demandController');
const store = require('../controllers/storeController');
const purchase = require('../controllers/purchaseController');
const tender = require('../controllers/tenderController');

const router = express.Router();

const tenderFiles = createUpload({
    dir: 'tender-documents',
    accept: (file) => ({ tenderDocument: MIME.pdf, itemsList: MIME.spreadsheet })[file.fieldname] ?? null,
    typeError: 'The tender document must be a PDF and the items list an Excel or CSV file.',
}).fields([
    { name: 'tenderDocument', maxCount: 1 },
    { name: 'itemsList', maxCount: 1 },
]);

const getTender = (id, columns) => dbGet(`SELECT ${columns} FROM demand_tenders WHERE id = ?`, [id]);

// Tenders a supplier must not see yet: still inside the internal approval chain.
const UNPUBLISHED = new Set([
    'draft', 'pending_vetting', 'vetting_approved', 'vetting_rejected', 'pending_finance_ms_approval',
    'pending_purchase_hod_approval', 'pending_purchase_hod_publishing', 'rejected',
]);

/** Serves a tender's stored document; suppliers only get documents of published tenders. */
const tenderDownload = (column, name) => async (req, res) => {
    const row = await getTender(req.params.tenderId, `${column} AS file_path, tender_status`);
    if (!row?.file_path || (req.user.role === 'supplier' && UNPUBLISHED.has(row.tender_status))) {
        return res.status(404).json({ message: 'Document not found' });
    }
    sendStoredFile(res, row.file_path, `${name}-${req.params.tenderId}${path.extname(row.file_path)}`);
};

// ── Supplier-visible ──────────────────────────────────────────────────────
router.get('/tenders/:tenderId/details', authenticate, tender.getTenderWithCriteria);
router.get('/tenders/:tenderId/tender-document', authenticate, tenderDownload('tender_document_path', 'tender-document'));
router.get('/tenders/:tenderId/items-list', authenticate, tenderDownload('items_list_path', 'items-list'));

// Everything below is internal workflow.
router.use(staffOnly);

const purchaseOnly = allow('purchase');
const storeOnly = allow('store');

// Demands
router.post('/', demand.createDemand); // the controller checks eligibility
router.get('/user', demand.getUserDemands);
router.get('/with-items', allow('store', 'purchase'), demand.getAllDemandsWithItems);

// HOD approval chains
router.get('/hod/pending', allow('hod'), demand.getHodPendingDemands);
router.put('/hod/approve-reject', allow('hod'), demand.approveRejectDemandByHod);
router.get('/purchase-hod/pending-tenders', allow('purchaseHod'), tender.getPurchaseHodPendingTenders);
router.put('/purchase-hod/approve-reject-tender', allow('purchaseHod'), tender.approveTenderByPurchaseHod);
router.get('/purchase-hod/pending-publishing', allow('purchaseHod'), tender.getPurchaseHodPendingPublishing);
router.put('/purchase-hod/publish-tender/:tenderId', allow('purchaseHod'), tender.publishTenderByPurchaseHod);
router.get('/finance-hod/pending-tenders', allow('financeHod'), tender.getFinanceHodPendingTenders);
router.put('/finance-hod/approve-reject-tender', allow('financeHod'), tender.approveTenderByFinanceHod);
router.get('/ms-hod/pending-tenders', allow('msHod'), tender.getMsHodPendingTenders);
router.put('/ms-hod/approve-reject-tender', allow('msHod'), tender.approveTenderByMsHod);
router.get('/store-hod/pending', allow('storeHod'), store.getStorePendingForHodApproval);
router.put('/store-hod/:demandId/approve', allow('storeHod'), store.approveStoreFulfillmentByHod);
router.put('/store-hod/:demandId/reject', allow('storeHod'), store.rejectStoreFulfillmentByHod);

// Purchase department
router.get('/purchase', purchaseOnly, purchase.getPurchaseDemands);
router.get('/purchase/tenders-vetting-status', purchaseOnly, purchase.getTendersWithVettingStatus);
router.post('/purchase/tenders/:tenderId/submit-for-finance-approval', purchaseOnly, purchase.submitTenderForFinanceApproval);
router.get('/managable-tenders', purchaseOnly, purchase.getManagableTenders); // must precede /:id

// Tenders
router.post('/tenders/create', purchaseOnly, tenderFiles, tender.createTenderWithCriteria);
router.get('/tenders/published', purchaseOnly, tender.getPublishedTenders);
router.get('/tenders/pending-opening', purchaseOnly, tender.getTendersPendingOpening);
router.get('/tenders/pending-opening/:tenderId', purchaseOnly, tender.getTenderOpeningDetails);
router.get('/tenders/:tenderId/opening-report', purchaseOnly, tender.generateTenderOpeningReport);
router.post('/tenders/:tenderId/open', purchaseOnly, tender.openTender);
router.put('/tenders/:tenderId/update-time', purchaseOnly, purchase.updateTenderTime);

// A single demand (parameterised routes last, so they never shadow the paths above)
router.get('/:id', demand.getDemandById);
router.get('/:id/with-items', demand.getDemandWithItems);
router.get('/:id/items', allow('purchase', 'store'), demand.getDemandItemsPaginated);
router.get('/:id/excel-report', allow('purchase', 'store'), demand.generateDemandExcelReport);
router.get('/:demandId/tender/exists', purchaseOnly, async (req, res) => {
    const row = await dbGet('SELECT id, tender_status FROM demand_tenders WHERE demand_id = ?', [req.params.demandId]);
    res.json(row ? { exists: true, tenderId: row.id, status: row.tender_status } : { exists: false });
});
router.put('/:id/items-status', storeOnly, store.updateItemStatuses);
router.put('/:id/purchase', purchaseOnly, purchase.evaluateDemandPurchase);
router.put('/:id/approve', purchaseOnly, tenderFiles, purchase.approveDemand);
router.post('/:id/reject', purchaseOnly, demand.rejectDemand);

module.exports = router;

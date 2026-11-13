const express = require('express');
const { authenticate, staffOnly, supplierOnly, approvedSupplierOnly, applicantOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const { rateLimit, byIpAndAccount } = require('../middleware/rateLimit');
const { createUpload, MIME } = require('../middleware/uploads');
const { acknowledgeCriteria, getKnockoutClauseDocuments, downloadKnockoutClauseDocument } = require('../controllers/tenderController');
const supplier = require('../controllers/supplierController');

const router = express.Router();

const documents = createUpload({
    dir: 'uploads',
    accept: (file) => (file.fieldname === 'bidCdrDocument' ? [...MIME.pdf, ...MIME.word, ...MIME.image] : MIME.pdf),
    typeError: 'Only PDF files are allowed (the Bid CDR document may also be DOC, DOCX, JPG or PNG).',
});

const knockoutDocuments = createUpload({
    dir: 'uploads/knockout-documents',
    prefix: 'knockout-doc',
    accept: MIME.pdf,
    typeError: 'Only PDF files are allowed for knockout clause documents.',
}).any();

const registrationFiles = documents.fields(
    ['professionalTaxCert', 'ntnDocument', 'drugSaleLicense', 'pecDocument', 'gstDocument'].map((name) => ({ name, maxCount: 1 }))
);

const bidFiles = documents.fields(
    ['technicalBid', 'financialBid', 'bidCdrDocument'].map((name) => ({ name, maxCount: 1 }))
);

// Registration endpoints used to trust a supplierId from the request body, so anyone
// could overwrite any supplier's application. Bind it to the signed-in supplier instead.
const bindSupplierId = (req, res, next) => {
    req.body = { ...req.body, supplierId: req.user.id };
    next();
};

// A supplier may read their own documents; staff (the evaluation committee) may read anyone's.
const ownDocumentsOrStaff = (req, res, next) =>
    req.user.role !== 'supplier' || String(req.user.id) === String(req.params.supplierId)
        ? next()
        : res.status(403).json({ error: 'Access denied.' });

const loginLimit = rateLimit({ max: 10, key: byIpAndAccount('usernameOrEmail') });
const otpLimit = rateLimit({ max: 8, message: 'Too many verification attempts. Please wait a few minutes.' });
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

// Public
router.post('/register', registerLimit, supplier.registerSupplier);
router.post('/login', loginLimit, supplier.loginSupplier);
router.post('/complete-2fa-login', rateLimit({ max: 10, key: byIpAndAccount('challenge') }), supplier.completeSupplier2FALogin);

// Registration wizard (supplier token issued at sign-up / sign-in)
router.post('/send-email-otp', otpLimit, applicantOnly, bindSupplierId, supplier.sendEmailOTP);
router.post('/verify-email-otp', otpLimit, applicantOnly, bindSupplierId, supplier.verifyEmailOTP);
router.post('/registration/save-step', applicantOnly, bindSupplierId, supplier.saveRegistrationStep);
router.post('/registration/submit', applicantOnly, registrationFiles, bindSupplierId, supplier.submitApplication);
router.get('/registration-data', supplierOnly, supplier.getSupplierRegistrationData);

// Supplier workspace
router.get('/tenders/active', approvedSupplierOnly, supplier.getActiveTenders);
router.post('/tenders/:tenderId/bid', approvedSupplierOnly, bidFiles, supplier.submitBid);
router.post('/tenders/:tenderId/acknowledge', approvedSupplierOnly, knockoutDocuments, acknowledgeCriteria);
router.get('/bids/my-bids', approvedSupplierOnly, supplier.getSupplierBids);
router.get('/profile/me', approvedSupplierOnly, supplier.getSupplierProfile);

// Supplier evaluation committee and technical evaluation (staff)
router.get('/pending', staffOnly, allow('supplierEvaluation'), supplier.getPendingSuppliers);
router.get('/tenders/:tenderId/knockout-documents/:supplierId', staffOnly, allow('technicalEvaluation', 'purchase'), getKnockoutClauseDocuments);
router.get('/knockout-documents/:documentId/download', staffOnly, allow('technicalEvaluation', 'purchase'), downloadKnockoutClauseDocument);
router.get('/:supplierId/document/:documentType', authenticate, ownDocumentsOrStaff, supplier.downloadDocument);
router.get('/:id', staffOnly, supplier.getSupplierDetails);
router.get('/:id/comprehensive', staffOnly, allow('supplierEvaluation'), supplier.getComprehensiveSupplierData);
router.get('/:supplierId/registration-data', staffOnly, allow('supplierEvaluation'), supplier.getSupplierRegistrationData);
router.post('/:supplierId/evaluate', staffOnly, allow('supplierEvaluation'), supplier.submitEvaluation);
router.post('/:supplierId/request-resubmit', staffOnly, allow('supplierEvaluation'), supplier.requestResubmission);

module.exports = router;

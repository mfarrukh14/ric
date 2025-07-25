const express = require('express');
const router = express.Router();
const supplierTwoFactorController = require('../controllers/supplierTwoFactorController');
const { authenticateSupplierToken } = require('../middleware/auth');

// Apply supplier authentication middleware to all routes
router.use(authenticateSupplierToken);

// Setup 2FA (generate QR code and secret)
router.post('/setup', supplierTwoFactorController.setup2FA);

// Enable 2FA (verify setup and enable)
router.post('/enable', supplierTwoFactorController.enable2FA);

// Verify 2FA token
router.post('/verify', supplierTwoFactorController.verify2FA);

// Disable 2FA
router.post('/disable', supplierTwoFactorController.disable2FA);

// Get 2FA status
router.get('/status', supplierTwoFactorController.get2FAStatus);

// Regenerate backup codes
router.post('/regenerate-backup-codes', supplierTwoFactorController.regenerateBackupCodes);

module.exports = router;

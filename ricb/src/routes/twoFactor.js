const express = require('express');
const router = express.Router();
const twoFactorController = require('../controllers/twoFactorController');
const authMiddleware = require('../middleware/auth');

// Setup 2FA (requires authentication)
router.post('/setup', authMiddleware, twoFactorController.setup2FA);

// Enable 2FA (requires authentication)
router.post('/enable', authMiddleware, twoFactorController.enable2FA);

// Verify 2FA token (public route for login)
router.post('/verify', twoFactorController.verify2FA);

// Disable 2FA (requires authentication)
router.post('/disable', authMiddleware, twoFactorController.disable2FA);

// Get 2FA status (requires authentication)
router.get('/status', authMiddleware, twoFactorController.get2FAStatus);

// Regenerate backup codes (requires authentication)
router.post('/regenerate-backup-codes', authMiddleware, twoFactorController.regenerateBackupCodes);

module.exports = router;

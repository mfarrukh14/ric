const express = require('express');
const { staffOnly } = require('../middleware/auth');
const twoFactor = require('../controllers/twoFactorController');

const router = express.Router();

// Verification during sign-in lives in /api/auth/complete-2fa-login, behind a password challenge.
router.use(staffOnly);
router.post('/setup', twoFactor.setup2FA);
router.post('/enable', twoFactor.enable2FA);
router.post('/disable', twoFactor.disable2FA);
router.get('/status', twoFactor.get2FAStatus);
router.post('/regenerate-backup-codes', twoFactor.regenerateBackupCodes);

module.exports = router;

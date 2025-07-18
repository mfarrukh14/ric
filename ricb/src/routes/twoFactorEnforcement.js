const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const twoFactorEnforcementController = require('../controllers/twoFactorEnforcementController');

// Get system-wide 2FA enforcement status
router.get('/enforcement', auth, twoFactorEnforcementController.getTwoFactorEnforcement);

// Check if current user needs mandatory 2FA setup
router.get('/compliance', auth, twoFactorEnforcementController.checkTwoFactorCompliance);

// Get list of users without 2FA when enforcement is enabled (superadmin only)
router.get('/non-compliant', auth, twoFactorEnforcementController.getNonCompliantUsers);

module.exports = router;

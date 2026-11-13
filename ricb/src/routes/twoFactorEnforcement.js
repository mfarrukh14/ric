const express = require('express');
const { staffOnly, superAdminOnly } = require('../middleware/auth');
const enforcement = require('../controllers/twoFactorEnforcementController');

const router = express.Router();

router.get('/enforcement', staffOnly, enforcement.getTwoFactorEnforcement);
router.get('/compliance', staffOnly, enforcement.checkTwoFactorCompliance);
router.get('/non-compliant', superAdminOnly, enforcement.getNonCompliantUsers);

module.exports = router;

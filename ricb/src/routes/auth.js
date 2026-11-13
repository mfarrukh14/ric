const express = require('express');
const { authenticate } = require('../middleware/auth');
const { rateLimit, byIpAndAccount } = require('../middleware/rateLimit');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', rateLimit({ max: 10, key: byIpAndAccount('username') }), authController.login);
router.post('/complete-2fa-login', rateLimit({ max: 10, key: byIpAndAccount('challenge') }), authController.complete2FALogin);
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;

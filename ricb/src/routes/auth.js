const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Login route
router.post('/login', authController.login);

// Complete 2FA login
router.post('/complete-2fa-login', authController.complete2FALogin);

module.exports = router;

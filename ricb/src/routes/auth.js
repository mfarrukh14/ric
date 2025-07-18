const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Login route
router.post('/login', authController.login);

// Complete 2FA login
router.post('/complete-2fa-login', authController.complete2FALogin);

// Get current user profile
router.get('/profile', auth, authController.getProfile);

module.exports = router;

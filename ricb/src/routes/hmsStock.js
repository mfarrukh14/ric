const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { lookupStockForItems } = require('../controllers/hmsStockController');

router.post('/lookup', auth, lookupStockForItems);

module.exports = router;

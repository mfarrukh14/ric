const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const { lookupStockForItems } = require('../controllers/hmsStockController');

const router = express.Router();

router.post('/lookup', staffOnly, allow('store'), lookupStockForItems);

module.exports = router;

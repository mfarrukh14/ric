const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const grievance = require('../controllers/financialGrievanceController');

const router = express.Router();

router.use(staffOnly, allow('purchase'));
router.post('/initiate/:tenderId', grievance.initiateFinancialGrievance);
router.post('/upload-minutes/:tenderId', grievance.uploadFinancialGrievanceMinutes);
router.get('/status/:tenderId', grievance.getFinancialGrievanceStatus);

module.exports = router;

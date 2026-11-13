const express = require('express');
const { approvedSupplierOnly } = require('../middleware/auth');
const awards = require('../controllers/supplierAwardController');

const router = express.Router();

router.use(approvedSupplierOnly);
router.get('/', awards.getSupplierAwards);
router.get('/stats', awards.getSupplierAwardStats);
router.get('/:awardId', awards.getAwardDetails);
router.get('/:awardId/download', awards.downloadAwardLetter);
router.put('/:awardId/status', awards.updateAwardStatus);

module.exports = router;

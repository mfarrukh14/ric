const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    createDemand,
    getUserDemands,
    getAllDemands,
    getVettingDemands,
    getPurchaseDemands,
    updateDemandStatus,
    evaluateDemandVetting,
    evaluateDemandPurchase,
    getDemandById
} = require('../controllers/demandController');

// Create a new demand
router.post('/', auth, createDemand);

// Get current user's demands
router.get('/user', auth, getUserDemands);

// Get all demands (for superadmin and store department)
router.get('/all', auth, getAllDemands);

// Get vetting committee demands
router.get('/vetting', auth, getVettingDemands);

// Get purchase department demands
router.get('/purchase', auth, getPurchaseDemands);

// Get specific demand by ID
router.get('/:id', auth, getDemandById);

// Update demand status (for store department)
router.patch('/:id/status', auth, updateDemandStatus);

// Evaluate demand by vetting committee
router.post('/:id/evaluate-vetting', auth, evaluateDemandVetting);

// Evaluate demand by purchase department
router.post('/:id/evaluate-purchase', auth, evaluateDemandPurchase);

module.exports = router;

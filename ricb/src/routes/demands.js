const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    createDemand,
    getUserDemands,
    getAllDemands,
    updateDemandStatus,
    getDemandById
} = require('../controllers/demandController');

// Create a new demand
router.post('/', auth, createDemand);

// Get current user's demands
router.get('/user', auth, getUserDemands);

// Get all demands (for superadmin and store department)
router.get('/all', auth, getAllDemands);

// Get specific demand by ID
router.get('/:id', auth, getDemandById);

// Update demand status (for store department)
router.patch('/:id/status', auth, updateDemandStatus);

module.exports = router;

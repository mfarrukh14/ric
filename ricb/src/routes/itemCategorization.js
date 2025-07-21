const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getDrugCategories,
    getDrugNamesByCategory,
    getStrengthUnits,
    getDosageForms,
    getPreparations,
    getEquipmentCategories,
    getEquipmentTypesByCategory
} = require('../controllers/itemCategorization');

const {
    createDrugCategory,
    updateDrugCategory,
    deleteDrugCategory,
    createDrugName,
    updateDrugName,
    deleteDrugName,
    createStrengthUnit,
    updateStrengthUnit,
    deleteStrengthUnit,
    createDosageForm,
    updateDosageForm,
    deleteDosageForm,
    createPreparation,
    updatePreparation,
    deletePreparation,
    createEquipmentCategory,
    updateEquipmentCategory,
    deleteEquipmentCategory,
    createEquipmentType,
    updateEquipmentType,
    deleteEquipmentType
} = require('../controllers/adminItemCategorization');

// Middleware to check superadmin role
const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Access denied. Superadmin role required.' });
    }
    next();
};

// Public routes (for dropdown data)
router.get('/drug-categories', auth, getDrugCategories);
router.get('/drug-names/:categoryId', auth, getDrugNamesByCategory);
router.get('/strength-units', auth, getStrengthUnits);
router.get('/dosage-forms', auth, getDosageForms);
router.get('/preparations', auth, getPreparations);
router.get('/equipment-categories', auth, getEquipmentCategories);
router.get('/equipment-types/:categoryId', auth, getEquipmentTypesByCategory);

// Admin routes (superadmin only)
// Drug Categories
router.post('/admin/drug-categories', auth, requireSuperAdmin, createDrugCategory);
router.put('/admin/drug-categories/:id', auth, requireSuperAdmin, updateDrugCategory);
router.delete('/admin/drug-categories/:id', auth, requireSuperAdmin, deleteDrugCategory);

// Drug Names
router.post('/admin/drug-names', auth, requireSuperAdmin, createDrugName);
router.put('/admin/drug-names/:id', auth, requireSuperAdmin, updateDrugName);
router.delete('/admin/drug-names/:id', auth, requireSuperAdmin, deleteDrugName);

// Strength Units
router.post('/admin/strength-units', auth, requireSuperAdmin, createStrengthUnit);
router.put('/admin/strength-units/:id', auth, requireSuperAdmin, updateStrengthUnit);
router.delete('/admin/strength-units/:id', auth, requireSuperAdmin, deleteStrengthUnit);

// Dosage Forms
router.post('/admin/dosage-forms', auth, requireSuperAdmin, createDosageForm);
router.put('/admin/dosage-forms/:id', auth, requireSuperAdmin, updateDosageForm);
router.delete('/admin/dosage-forms/:id', auth, requireSuperAdmin, deleteDosageForm);

// Preparations
router.post('/admin/preparations', auth, requireSuperAdmin, createPreparation);
router.put('/admin/preparations/:id', auth, requireSuperAdmin, updatePreparation);
router.delete('/admin/preparations/:id', auth, requireSuperAdmin, deletePreparation);

// Equipment Categories
router.post('/admin/equipment-categories', auth, requireSuperAdmin, createEquipmentCategory);
router.put('/admin/equipment-categories/:id', auth, requireSuperAdmin, updateEquipmentCategory);
router.delete('/admin/equipment-categories/:id', auth, requireSuperAdmin, deleteEquipmentCategory);

// Equipment Types
router.post('/admin/equipment-types', auth, requireSuperAdmin, createEquipmentType);
router.put('/admin/equipment-types/:id', auth, requireSuperAdmin, updateEquipmentType);
router.delete('/admin/equipment-types/:id', auth, requireSuperAdmin, deleteEquipmentType);

module.exports = router;

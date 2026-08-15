const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getItemCategories,
    getItemCategory,
    createItemCategory,
    updateItemCategory,
    deleteItemCategory,
    getItemNamesByCategory,
    getAllItemNames,
    getItemName,
    createItemName,
    updateItemName,
    deleteItemName
} = require('../controllers/itemController');

const {
    getCategoryFields,
    createCategoryField,
    updateCategoryField,
    deleteCategoryField,
    createFieldOption,
    updateFieldOption,
    deleteFieldOption
} = require('../controllers/categoryFieldsController');

// Item Categories Routes
router.get('/categories', auth, getItemCategories);
router.get('/categories/:id', auth, getItemCategory);
router.post('/categories', auth, createItemCategory);
router.put('/categories/:id', auth, updateItemCategory);
router.delete('/categories/:id', auth, deleteItemCategory);

// Item Names Routes
router.get('/names', auth, getAllItemNames);
router.get('/names/:id', auth, getItemName);
router.get('/categories/:categoryId/names', auth, getItemNamesByCategory);
router.post('/names', auth, createItemName);
router.put('/names/:id', auth, updateItemName);
router.delete('/names/:id', auth, deleteItemName);

// Category Custom Fields Routes (generic engine replacing pharma/equipment hardcoding)
router.get('/categories/:categoryId/fields', auth, getCategoryFields);
router.post('/categories/:categoryId/fields', auth, createCategoryField);
router.put('/fields/:fieldId', auth, updateCategoryField);
router.delete('/fields/:fieldId', auth, deleteCategoryField);
router.post('/fields/:fieldId/options', auth, createFieldOption);
router.put('/fields/options/:optionId', auth, updateFieldOption);
router.delete('/fields/options/:optionId', auth, deleteFieldOption);

module.exports = router;

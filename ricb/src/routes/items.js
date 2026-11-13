const express = require('express');
const { staffOnly, superAdminOnly } = require('../middleware/auth');
const items = require('../controllers/itemController');
const fields = require('../controllers/categoryFieldsController');

const router = express.Router();

// Reads: any staff member (demand forms). Writes: superadmin.
router.get('/categories', staffOnly, items.getItemCategories);
router.get('/categories/:id', staffOnly, items.getItemCategory);
router.get('/categories/:categoryId/names', staffOnly, items.getItemNamesByCategory);
router.get('/categories/:categoryId/fields', staffOnly, fields.getCategoryFields);
router.get('/names', staffOnly, items.getAllItemNames);
router.get('/names/:id', staffOnly, items.getItemName);

router.post('/categories', superAdminOnly, items.createItemCategory);
router.put('/categories/:id', superAdminOnly, items.updateItemCategory);
router.delete('/categories/:id', superAdminOnly, items.deleteItemCategory);
router.post('/names', superAdminOnly, items.createItemName);
router.put('/names/:id', superAdminOnly, items.updateItemName);
router.delete('/names/:id', superAdminOnly, items.deleteItemName);
router.post('/categories/:categoryId/fields', superAdminOnly, fields.createCategoryField);
router.put('/fields/:fieldId', superAdminOnly, fields.updateCategoryField);
router.delete('/fields/:fieldId', superAdminOnly, fields.deleteCategoryField);
router.post('/fields/:fieldId/options', superAdminOnly, fields.createFieldOption);
router.put('/fields/options/:optionId', superAdminOnly, fields.updateFieldOption);
router.delete('/fields/options/:optionId', superAdminOnly, fields.deleteFieldOption);

module.exports = router;

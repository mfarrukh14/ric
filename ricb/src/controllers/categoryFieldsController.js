const { getDatabase } = require('../config/database');
const { getCategoryFieldDefinitions } = require('../utils/itemFieldFormatter');

const dbAll = (db, sqlText, params = []) => new Promise((resolve, reject) => {
    db.all(sqlText, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});
const dbGet = (db, sqlText, params = []) => new Promise((resolve, reject) => {
    db.get(sqlText, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbRun = (db, sqlText, params = []) => new Promise((resolve, reject) => {
    db.run(sqlText, params, function (err) { err ? reject(err) : resolve(this); });
});

const FIELD_TYPES = ['text', 'number', 'dropdown'];

const requireSuperAdmin = (req, res) => {
    if (req.user.role !== 'superadmin') {
        res.status(403).json({ message: 'Only superadmin can manage category fields' });
        return false;
    }
    return true;
};

// GET /items/categories/:categoryId/fields
// Returns every custom field configured for a category, each with its options,
// ordered so a dependent field always comes after the field it depends on.
const getCategoryFields = async (req, res) => {
    const db = getDatabase();
    const { categoryId } = req.params;

    try {
        const fields = await getCategoryFieldDefinitions(db, categoryId);
        res.json(fields);
    } catch (error) {
        console.error('Error fetching category fields:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /items/categories/:categoryId/fields
const createCategoryField = async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const db = getDatabase();
    const { categoryId } = req.params;
    const { label, fieldType, isRequired, dependsOnFieldId, options } = req.body;

    if (!label || !label.trim()) {
        return res.status(400).json({ message: 'Field label is required' });
    }
    if (!FIELD_TYPES.includes(fieldType)) {
        return res.status(400).json({ message: 'Field type must be text, number, or dropdown' });
    }
    if (fieldType === 'dropdown' && (!Array.isArray(options) || options.length === 0)) {
        return res.status(400).json({ message: 'Dropdown fields require at least one option' });
    }
    if (fieldType === 'dropdown') {
        const hasEmpty = options.some(o => !o || !String(o.value || '').trim());
        if (hasEmpty) {
            return res.status(400).json({ message: 'All dropdown options must have a value' });
        }
    }

    try {
        const category = await dbGet(db, 'SELECT id FROM item_categories WHERE id = ?', [categoryId]);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        let parentField = null;
        if (dependsOnFieldId) {
            parentField = await dbGet(db,
                'SELECT * FROM category_fields WHERE id = ? AND category_id = ?',
                [dependsOnFieldId, categoryId]
            );
            if (!parentField) {
                return res.status(400).json({ message: 'Parent field not found in this category' });
            }
            if (parentField.field_type !== 'dropdown') {
                return res.status(400).json({ message: 'A field can only depend on a dropdown field' });
            }
            if (fieldType !== 'dropdown') {
                return res.status(400).json({ message: 'Only dropdown fields can depend on another field' });
            }
        }

        let parentOptionIds = null;
        if (parentField) {
            const parentOptions = await dbAll(db, 'SELECT id FROM category_field_options WHERE field_id = ?', [parentField.id]);
            parentOptionIds = new Set(parentOptions.map(o => o.id));
            const missingParent = options.some(o => !o.parentOptionId || !parentOptionIds.has(Number(o.parentOptionId)));
            if (missingParent) {
                return res.status(400).json({ message: 'Every option must specify which parent option it belongs to' });
            }
        }

        const maxOrderRow = await dbGet(db, 'SELECT MAX(display_order) AS maxOrder FROM category_fields WHERE category_id = ?', [categoryId]);
        const displayOrder = (maxOrderRow && maxOrderRow.maxOrder !== null ? maxOrderRow.maxOrder : -1) + 1;

        const fieldResult = await dbRun(db,
            'INSERT INTO category_fields (category_id, label, field_type, depends_on_field_id, is_required, display_order) VALUES (?, ?, ?, ?, ?, ?)',
            [categoryId, label.trim(), fieldType, dependsOnFieldId || null, isRequired === false ? 0 : 1, displayOrder]
        );
        const fieldId = fieldResult.lastID;

        if (fieldType === 'dropdown') {
            for (let i = 0; i < options.length; i++) {
                await dbRun(db,
                    'INSERT INTO category_field_options (field_id, value, parent_option_id, display_order) VALUES (?, ?, ?, ?)',
                    [fieldId, options[i].value.trim(), options[i].parentOptionId || null, i]
                );
            }
        }

        res.status(201).json({ message: 'Field created successfully', fieldId });
    } catch (error) {
        console.error('Error creating category field:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /items/fields/:fieldId
// Updates label/required/order, and optionally the field's "depends on" parent
// field. Pass `dependsOnFieldId: null` to clear it, omit the key to leave it as-is.
const updateCategoryField = async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const db = getDatabase();
    const { fieldId } = req.params;
    const { label, isRequired, displayOrder } = req.body;
    const changingDependsOn = Object.prototype.hasOwnProperty.call(req.body, 'dependsOnFieldId');
    const dependsOnFieldId = req.body.dependsOnFieldId;

    if (!label || !label.trim()) {
        return res.status(400).json({ message: 'Field label is required' });
    }

    try {
        const field = await dbGet(db, 'SELECT * FROM category_fields WHERE id = ?', [fieldId]);
        if (!field) {
            return res.status(404).json({ message: 'Field not found' });
        }

        let dependsOnChanged = false;
        let newDependsOnFieldId = field.depends_on_field_id;

        if (changingDependsOn) {
            newDependsOnFieldId = dependsOnFieldId || null;
            dependsOnChanged = String(newDependsOnFieldId || '') !== String(field.depends_on_field_id || '');

            if (newDependsOnFieldId) {
                if (field.field_type !== 'dropdown') {
                    return res.status(400).json({ message: 'Only dropdown fields can depend on another field' });
                }
                if (String(newDependsOnFieldId) === String(fieldId)) {
                    return res.status(400).json({ message: 'A field cannot depend on itself' });
                }
                const parentField = await dbGet(db,
                    'SELECT * FROM category_fields WHERE id = ? AND category_id = ?',
                    [newDependsOnFieldId, field.category_id]
                );
                if (!parentField) {
                    return res.status(400).json({ message: 'Parent field not found in this category' });
                }
                if (parentField.field_type !== 'dropdown') {
                    return res.status(400).json({ message: 'A field can only depend on a dropdown field' });
                }
                if (String(parentField.depends_on_field_id || '') === String(fieldId)) {
                    return res.status(400).json({ message: 'Circular dependency between these two fields is not allowed' });
                }
            }
        }

        await dbRun(db,
            'UPDATE category_fields SET label = ?, is_required = ?, display_order = COALESCE(?, display_order), depends_on_field_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [label.trim(), isRequired === false ? 0 : 1, displayOrder === undefined ? null : displayOrder, newDependsOnFieldId, fieldId]
        );

        // The dependency target changed, so this field's existing options no longer
        // map to a valid parent option - clear the mapping and require reassignment.
        if (dependsOnChanged) {
            await dbRun(db, 'UPDATE category_field_options SET parent_option_id = NULL WHERE field_id = ?', [fieldId]);
        }

        res.json({ message: 'Field updated successfully', dependsOnChanged });
    } catch (error) {
        console.error('Error updating category field:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /items/fields/:fieldId
const deleteCategoryField = async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const db = getDatabase();
    const { fieldId } = req.params;

    try {
        const field = await dbGet(db, 'SELECT * FROM category_fields WHERE id = ?', [fieldId]);
        if (!field) {
            return res.status(404).json({ message: 'Field not found' });
        }

        const dependentField = await dbGet(db, 'SELECT id FROM category_fields WHERE depends_on_field_id = ?', [fieldId]);
        if (dependentField) {
            return res.status(400).json({ message: 'Another field depends on this one. Delete that field first.' });
        }

        const usage = await dbGet(db, 'SELECT COUNT(*) AS count FROM demand_item_field_values WHERE field_id = ?', [fieldId]);
        if (usage && Number(usage.count) > 0) {
            return res.status(400).json({ message: 'This field has been used on submitted demands and cannot be deleted' });
        }

        await dbRun(db, 'DELETE FROM category_field_options WHERE field_id = ?', [fieldId]);
        await dbRun(db, 'DELETE FROM category_fields WHERE id = ?', [fieldId]);

        res.json({ message: 'Field deleted successfully' });
    } catch (error) {
        console.error('Error deleting category field:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /items/fields/:fieldId/options
const createFieldOption = async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const db = getDatabase();
    const { fieldId } = req.params;
    const { value, parentOptionId } = req.body;

    if (!value || !value.trim()) {
        return res.status(400).json({ message: 'Option value is required' });
    }

    try {
        const field = await dbGet(db, 'SELECT * FROM category_fields WHERE id = ?', [fieldId]);
        if (!field) {
            return res.status(404).json({ message: 'Field not found' });
        }
        if (field.field_type !== 'dropdown') {
            return res.status(400).json({ message: 'Options can only be added to dropdown fields' });
        }
        if (field.depends_on_field_id && !parentOptionId) {
            return res.status(400).json({ message: 'This field depends on another field; a parent option is required' });
        }
        if (field.depends_on_field_id) {
            const parentOption = await dbGet(db,
                'SELECT id FROM category_field_options WHERE id = ? AND field_id = ?',
                [parentOptionId, field.depends_on_field_id]
            );
            if (!parentOption) {
                return res.status(400).json({ message: 'Parent option not found for the field this depends on' });
            }
        }

        const maxOrderRow = await dbGet(db, 'SELECT MAX(display_order) AS maxOrder FROM category_field_options WHERE field_id = ?', [fieldId]);
        const displayOrder = (maxOrderRow && maxOrderRow.maxOrder !== null ? maxOrderRow.maxOrder : -1) + 1;

        const result = await dbRun(db,
            'INSERT INTO category_field_options (field_id, value, parent_option_id, display_order) VALUES (?, ?, ?, ?)',
            [fieldId, value.trim(), field.depends_on_field_id ? parentOptionId : null, displayOrder]
        );

        res.status(201).json({ message: 'Option created successfully', optionId: result.lastID });
    } catch (error) {
        console.error('Error creating field option:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /items/fields/options/:optionId
// Updates an option's value, and optionally which parent option it belongs to
// (only meaningful when the option's field depends on another field). Pass
// `parentOptionId` to set/change it, omit the key to leave it as-is.
const updateFieldOption = async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const db = getDatabase();
    const { optionId } = req.params;
    const { value } = req.body;
    const changingParent = Object.prototype.hasOwnProperty.call(req.body, 'parentOptionId');
    const parentOptionId = req.body.parentOptionId;

    if (!value || !value.trim()) {
        return res.status(400).json({ message: 'Option value is required' });
    }

    try {
        const option = await dbGet(db, 'SELECT * FROM category_field_options WHERE id = ?', [optionId]);
        if (!option) {
            return res.status(404).json({ message: 'Option not found' });
        }

        let newParentOptionId = option.parent_option_id;

        if (changingParent) {
            const field = await dbGet(db, 'SELECT * FROM category_fields WHERE id = ?', [option.field_id]);
            if (field && field.depends_on_field_id) {
                if (!parentOptionId) {
                    return res.status(400).json({ message: 'This field depends on another field; a parent option is required' });
                }
                const parentOption = await dbGet(db,
                    'SELECT id FROM category_field_options WHERE id = ? AND field_id = ?',
                    [parentOptionId, field.depends_on_field_id]
                );
                if (!parentOption) {
                    return res.status(400).json({ message: 'Parent option not found for the field this depends on' });
                }
                newParentOptionId = parentOptionId;
            } else {
                newParentOptionId = null;
            }
        }

        const result = await dbRun(db,
            'UPDATE category_field_options SET value = ?, parent_option_id = ? WHERE id = ?',
            [value.trim(), newParentOptionId, optionId]
        );
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Option not found' });
        }
        res.json({ message: 'Option updated successfully' });
    } catch (error) {
        console.error('Error updating field option:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /items/fields/options/:optionId
const deleteFieldOption = async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const db = getDatabase();
    const { optionId } = req.params;

    try {
        const option = await dbGet(db, 'SELECT * FROM category_field_options WHERE id = ?', [optionId]);
        if (!option) {
            return res.status(404).json({ message: 'Option not found' });
        }

        const field = await dbGet(db, 'SELECT * FROM category_fields WHERE id = ?', [option.field_id]);
        const fieldOptionCount = await dbGet(db, 'SELECT COUNT(*) AS count FROM category_field_options WHERE field_id = ?', [option.field_id]);
        if (field && field.is_required && fieldOptionCount && Number(fieldOptionCount.count) <= 1) {
            return res.status(400).json({ message: 'A required dropdown field must keep at least one option' });
        }

        const usage = await dbGet(db, 'SELECT COUNT(*) AS count FROM demand_item_field_values WHERE option_id = ?', [optionId]);
        if (usage && Number(usage.count) > 0) {
            return res.status(400).json({ message: 'This option has been used on submitted demands and cannot be deleted' });
        }

        const childOption = await dbGet(db, 'SELECT id FROM category_field_options WHERE parent_option_id = ?', [optionId]);
        if (childOption) {
            return res.status(400).json({ message: 'Other options depend on this one and must be removed first' });
        }

        await dbRun(db, 'DELETE FROM category_field_options WHERE id = ?', [optionId]);
        res.json({ message: 'Option deleted successfully' });
    } catch (error) {
        console.error('Error deleting field option:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getCategoryFields,
    createCategoryField,
    updateCategoryField,
    deleteCategoryField,
    createFieldOption,
    updateFieldOption,
    deleteFieldOption
};

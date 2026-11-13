const { dbAll, dbGet, dbRun } = require('../db');


// Get all item categories, including how many custom fields each has configured
// (fieldCount) so callers like the demand creation form can hide categories an
// admin hasn't finished setting up yet.
const getItemCategories = async (req, res) => {
    try {
        const categories = await dbAll(`SELECT ic.*,
                (SELECT COUNT(*) FROM category_fields cf WHERE cf.category_id = ic.id) AS field_count
         FROM item_categories ic
         ORDER BY ic.name`);
        res.json(categories);
    } catch (error) {
        console.error('Error fetching item categories:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get single item category by ID
const getItemCategory = async (req, res) => {
    const { id } = req.params;

    try {
        const category = await dbGet('SELECT * FROM item_categories WHERE id = ?', [id]);

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        res.json(category);
    } catch (error) {
        console.error('Error fetching item category:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Create a new item category (superadmin only)
const createItemCategory = async (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Category name is required' });
    }

    try {
        const result = await dbRun(
            'INSERT INTO item_categories (name, description) VALUES (?, ?)',
            [name, description || null]
        ).then(result => ({
            id: result.lastID
        }));

        res.status(201).json({
            message: 'Item category created successfully',
            categoryId: result.id
        });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Category name already exists' });
        } else {
            console.error('Error creating item category:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// Update an item category (superadmin only)
const updateItemCategory = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Category name is required' });
    }

    try {
        await dbRun(
            'UPDATE item_categories SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [name, description || null, id]
        ).then(result => {
            if (result.changes === 0)
                throw new Error('Category not found');
        });

        res.json({ message: 'Item category updated successfully' });
    } catch (error) {
        if (error.message === 'Category not found') {
            res.status(404).json({ message: 'Category not found' });
        } else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Category name already exists' });
        } else {
            console.error('Error updating item category:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// Delete an item category (superadmin only)
const deleteItemCategory = async (req, res) => {
    const { id } = req.params;

    try {
        const fields = await dbAll('SELECT id FROM category_fields WHERE category_id = ?', [id]);

        if (fields.length > 0) {
            const fieldIds = fields.map(f => f.id);
            const placeholders = fieldIds.map(() => '?').join(',');
            const usage = await dbGet(
                `SELECT COUNT(*) AS count FROM demand_item_field_values WHERE field_id IN (${placeholders})`,
                fieldIds
            );
            if (usage && Number(usage.count) > 0) {
                return res.status(400).json({ message: 'This category has fields that have been used on submitted demands and cannot be deleted' });
            }

            await dbRun(
                `DELETE FROM category_field_options WHERE field_id IN (${placeholders})`,
                fieldIds
            );
            await dbRun('DELETE FROM category_fields WHERE category_id = ?', [id]);
        }

        await dbRun('DELETE FROM item_categories WHERE id = ?', [id]).then(result => {
            if (result.changes === 0)
                throw new Error('Category not found');
        });

        res.json({ message: 'Item category deleted successfully' });
    } catch (error) {
        if (error.message === 'Category not found') {
            res.status(404).json({ message: 'Category not found' });
        } else {
            console.error('Error deleting item category:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// Get item names by category
const getItemNamesByCategory = async (req, res) => {
    const { categoryId } = req.params;

    try {
        const itemNames = await dbAll(
            'SELECT * FROM item_names WHERE category_id = ? ORDER BY name',
            [categoryId]
        );
        res.json(itemNames);
    } catch (error) {
        console.error('Error fetching item names:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all item names with category info
const getAllItemNames = async (req, res) => {
    try {
        const itemNames = await dbAll(`SELECT item_names.*, item_categories.name as category_name 
         FROM item_names 
         JOIN item_categories ON item_names.category_id = item_categories.id 
         ORDER BY item_categories.name, item_names.name`);
        res.json(itemNames);
    } catch (error) {
        console.error('Error fetching item names:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get single item name by ID
const getItemName = async (req, res) => {
    const { id } = req.params;

    try {
        const itemName = await dbGet(`SELECT item_names.*, item_categories.name as category_name 
         FROM item_names 
         JOIN item_categories ON item_names.category_id = item_categories.id 
         WHERE item_names.id = ?`, [id]);

        if (!itemName) {
            return res.status(404).json({ message: 'Item name not found' });
        }

        res.json(itemName);
    } catch (error) {
        console.error('Error fetching item name:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Create a new item name (superadmin only)
const createItemName = async (req, res) => {
    const { categoryId, name, description } = req.body;

    if (!categoryId || !name) {
        return res.status(400).json({ message: 'Category ID and item name are required' });
    }

    try {
        const result = await dbRun(
            'INSERT INTO item_names (category_id, name, description) VALUES (?, ?, ?)',
            [categoryId, name, description || null]
        ).then(result => ({
            id: result.lastID
        }));

        res.status(201).json({
            message: 'Item name created successfully',
            itemNameId: result.id
        });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Item name already exists in this category' });
        } else if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
            res.status(400).json({ message: 'Invalid category ID' });
        } else {
            console.error('Error creating item name:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// Update an item name (superadmin only)
const updateItemName = async (req, res) => {
    const { id } = req.params;
    const { categoryId, name, description } = req.body;

    if (!categoryId || !name) {
        return res.status(400).json({ message: 'Category ID and item name are required' });
    }

    try {
        await dbRun(
            'UPDATE item_names SET category_id = ?, name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [categoryId, name, description || null, id]
        ).then(result => {
            if (result.changes === 0)
                throw new Error('Item name not found');
        });

        res.json({ message: 'Item name updated successfully' });
    } catch (error) {
        if (error.message === 'Item name not found') {
            res.status(404).json({ message: 'Item name not found' });
        } else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Item name already exists in this category' });
        } else if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
            res.status(400).json({ message: 'Invalid category ID' });
        } else {
            console.error('Error updating item name:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// Delete an item name (superadmin only)
const deleteItemName = async (req, res) => {
    const { id } = req.params;

    try {
        await dbRun('DELETE FROM item_names WHERE id = ?', [id]).then(result => {
            if (result.changes === 0)
                throw new Error('Item name not found');
        });

        res.json({ message: 'Item name deleted successfully' });
    } catch (error) {
        if (error.message === 'Item name not found') {
            res.status(404).json({ message: 'Item name not found' });
        } else {
            console.error('Error deleting item name:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

module.exports = {
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
};

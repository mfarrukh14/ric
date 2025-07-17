const { getDatabase } = require('../config/database');

// Get all item categories
const getItemCategories = async (req, res) => {
    const db = getDatabase();
    try {
        const categories = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM item_categories ORDER BY name', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(categories);
    } catch (error) {
        console.error('Error fetching item categories:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get single item category by ID
const getItemCategory = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;

    try {
        const category = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM item_categories WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

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
    const db = getDatabase();
    const { name, description } = req.body;

    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can create item categories' });
    }

    if (!name) {
        return res.status(400).json({ message: 'Category name is required' });
    }

    try {
        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO item_categories (name, description) VALUES (?, ?)',
                [name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

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
    const db = getDatabase();
    const { id } = req.params;
    const { name, description } = req.body;

    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can update item categories' });
    }

    if (!name) {
        return res.status(400).json({ message: 'Category name is required' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE item_categories SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Category not found'));
                    else resolve();
                }
            );
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
    const db = getDatabase();
    const { id } = req.params;

    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can delete item categories' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM item_categories WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Category not found'));
                    else resolve();
                }
            );
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
    const db = getDatabase();
    const { categoryId } = req.params;

    try {
        const itemNames = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM item_names WHERE category_id = ? ORDER BY name',
                [categoryId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        res.json(itemNames);
    } catch (error) {
        console.error('Error fetching item names:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all item names with category info
const getAllItemNames = async (req, res) => {
    const db = getDatabase();
    try {
        const itemNames = await new Promise((resolve, reject) => {
            db.all(
                `SELECT item_names.*, item_categories.name as category_name 
                 FROM item_names 
                 JOIN item_categories ON item_names.category_id = item_categories.id 
                 ORDER BY item_categories.name, item_names.name`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        res.json(itemNames);
    } catch (error) {
        console.error('Error fetching item names:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get single item name by ID
const getItemName = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;

    try {
        const itemName = await new Promise((resolve, reject) => {
            db.get(
                `SELECT item_names.*, item_categories.name as category_name 
                 FROM item_names 
                 JOIN item_categories ON item_names.category_id = item_categories.id 
                 WHERE item_names.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

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
    const db = getDatabase();
    const { categoryId, name, description } = req.body;

    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can create item names' });
    }

    if (!categoryId || !name) {
        return res.status(400).json({ message: 'Category ID and item name are required' });
    }

    try {
        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO item_names (category_id, name, description) VALUES (?, ?, ?)',
                [categoryId, name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

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
    const db = getDatabase();
    const { id } = req.params;
    const { categoryId, name, description } = req.body;

    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can update item names' });
    }

    if (!categoryId || !name) {
        return res.status(400).json({ message: 'Category ID and item name are required' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE item_names SET category_id = ?, name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [categoryId, name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Item name not found'));
                    else resolve();
                }
            );
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
    const db = getDatabase();
    const { id } = req.params;

    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can delete item names' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM item_names WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Item name not found'));
                    else resolve();
                }
            );
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

const { getDatabase } = require('../config/database');

// =============== DRUG CATEGORIES ===============
const createDrugCategory = async (req, res) => {
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Drug category name is required' });
        }

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO drug_categories (name, description) VALUES (?, ?)',
                [name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        res.status(201).json({ 
            id: result.id, 
            name, 
            description,
            message: 'Drug category created successfully' 
        });
    } catch (error) {
        console.error('Error creating drug category:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Drug category name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const updateDrugCategory = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Drug category name is required' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE drug_categories SET name = ?, description = ? WHERE id = ?',
                [name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Drug category not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Drug category updated successfully' });
    } catch (error) {
        console.error('Error updating drug category:', error);
        if (error.message === 'Drug category not found') {
            res.status(404).json({ message: error.message });
        } else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Drug category name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const deleteDrugCategory = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM drug_categories WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Drug category not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Drug category deleted successfully' });
    } catch (error) {
        console.error('Error deleting drug category:', error);
        if (error.message === 'Drug category not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// =============== DRUG NAMES ===============
const createDrugName = async (req, res) => {
    const { drugCategoryId, name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!drugCategoryId || !name) {
            return res.status(400).json({ message: 'Drug category ID and name are required' });
        }

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO drug_names (drug_category_id, name, description) VALUES (?, ?, ?)',
                [drugCategoryId, name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        res.status(201).json({ 
            id: result.id, 
            drugCategoryId, 
            name, 
            description,
            message: 'Drug name created successfully' 
        });
    } catch (error) {
        console.error('Error creating drug name:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const updateDrugName = async (req, res) => {
    const { id } = req.params;
    const { drugCategoryId, name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!drugCategoryId || !name) {
            return res.status(400).json({ message: 'Drug category ID and name are required' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE drug_names SET drug_category_id = ?, name = ?, description = ? WHERE id = ?',
                [drugCategoryId, name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Drug name not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Drug name updated successfully' });
    } catch (error) {
        console.error('Error updating drug name:', error);
        if (error.message === 'Drug name not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const deleteDrugName = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM drug_names WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Drug name not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Drug name deleted successfully' });
    } catch (error) {
        console.error('Error deleting drug name:', error);
        if (error.message === 'Drug name not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// =============== STRENGTH UNITS ===============
const createStrengthUnit = async (req, res) => {
    const { name, abbreviation } = req.body;
    const db = getDatabase();
    
    try {
        if (!name || !abbreviation) {
            return res.status(400).json({ message: 'Name and abbreviation are required' });
        }

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO strength_units (name, abbreviation) VALUES (?, ?)',
                [name, abbreviation],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        res.status(201).json({ 
            id: result.id, 
            name, 
            abbreviation,
            message: 'Strength unit created successfully' 
        });
    } catch (error) {
        console.error('Error creating strength unit:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Strength unit name or abbreviation already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const updateStrengthUnit = async (req, res) => {
    const { id } = req.params;
    const { name, abbreviation } = req.body;
    const db = getDatabase();
    
    try {
        if (!name || !abbreviation) {
            return res.status(400).json({ message: 'Name and abbreviation are required' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE strength_units SET name = ?, abbreviation = ? WHERE id = ?',
                [name, abbreviation, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Strength unit not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Strength unit updated successfully' });
    } catch (error) {
        console.error('Error updating strength unit:', error);
        if (error.message === 'Strength unit not found') {
            res.status(404).json({ message: error.message });
        } else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Strength unit name or abbreviation already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const deleteStrengthUnit = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM strength_units WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Strength unit not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Strength unit deleted successfully' });
    } catch (error) {
        console.error('Error deleting strength unit:', error);
        if (error.message === 'Strength unit not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// =============== DOSAGE FORMS ===============
const createDosageForm = async (req, res) => {
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Dosage form name is required' });
        }

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO dosage_forms (name, description) VALUES (?, ?)',
                [name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        res.status(201).json({ 
            id: result.id, 
            name, 
            description,
            message: 'Dosage form created successfully' 
        });
    } catch (error) {
        console.error('Error creating dosage form:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Dosage form name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const updateDosageForm = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Dosage form name is required' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE dosage_forms SET name = ?, description = ? WHERE id = ?',
                [name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Dosage form not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Dosage form updated successfully' });
    } catch (error) {
        console.error('Error updating dosage form:', error);
        if (error.message === 'Dosage form not found') {
            res.status(404).json({ message: error.message });
        } else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Dosage form name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const deleteDosageForm = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM dosage_forms WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Dosage form not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Dosage form deleted successfully' });
    } catch (error) {
        console.error('Error deleting dosage form:', error);
        if (error.message === 'Dosage form not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// =============== PREPARATIONS ===============
const createPreparation = async (req, res) => {
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Preparation name is required' });
        }

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO preparations (name, description) VALUES (?, ?)',
                [name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        res.status(201).json({ 
            id: result.id, 
            name, 
            description,
            message: 'Preparation created successfully' 
        });
    } catch (error) {
        console.error('Error creating preparation:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Preparation name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const updatePreparation = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Preparation name is required' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE preparations SET name = ?, description = ? WHERE id = ?',
                [name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Preparation not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Preparation updated successfully' });
    } catch (error) {
        console.error('Error updating preparation:', error);
        if (error.message === 'Preparation not found') {
            res.status(404).json({ message: error.message });
        } else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Preparation name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const deletePreparation = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM preparations WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Preparation not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Preparation deleted successfully' });
    } catch (error) {
        console.error('Error deleting preparation:', error);
        if (error.message === 'Preparation not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// =============== EQUIPMENT CATEGORIES ===============
const createEquipmentCategory = async (req, res) => {
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Equipment category name is required' });
        }

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO equipment_categories (name, description) VALUES (?, ?)',
                [name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        res.status(201).json({ 
            id: result.id, 
            name, 
            description,
            message: 'Equipment category created successfully' 
        });
    } catch (error) {
        console.error('Error creating equipment category:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Equipment category name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const updateEquipmentCategory = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!name) {
            return res.status(400).json({ message: 'Equipment category name is required' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE equipment_categories SET name = ?, description = ? WHERE id = ?',
                [name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Equipment category not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Equipment category updated successfully' });
    } catch (error) {
        console.error('Error updating equipment category:', error);
        if (error.message === 'Equipment category not found') {
            res.status(404).json({ message: error.message });
        } else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ message: 'Equipment category name already exists' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const deleteEquipmentCategory = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM equipment_categories WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Equipment category not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Equipment category deleted successfully' });
    } catch (error) {
        console.error('Error deleting equipment category:', error);
        if (error.message === 'Equipment category not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// =============== EQUIPMENT TYPES ===============
const createEquipmentType = async (req, res) => {
    const { equipmentCategoryId, name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!equipmentCategoryId || !name) {
            return res.status(400).json({ message: 'Equipment category ID and name are required' });
        }

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO equipment_types (equipment_category_id, name, description) VALUES (?, ?, ?)',
                [equipmentCategoryId, name, description || null],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        res.status(201).json({ 
            id: result.id, 
            equipmentCategoryId, 
            name, 
            description,
            message: 'Equipment type created successfully' 
        });
    } catch (error) {
        console.error('Error creating equipment type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const updateEquipmentType = async (req, res) => {
    const { id } = req.params;
    const { equipmentCategoryId, name, description } = req.body;
    const db = getDatabase();
    
    try {
        if (!equipmentCategoryId || !name) {
            return res.status(400).json({ message: 'Equipment category ID and name are required' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE equipment_types SET equipment_category_id = ?, name = ?, description = ? WHERE id = ?',
                [equipmentCategoryId, name, description || null, id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Equipment type not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Equipment type updated successfully' });
    } catch (error) {
        console.error('Error updating equipment type:', error);
        if (error.message === 'Equipment type not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

const deleteEquipmentType = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM equipment_types WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Equipment type not found'));
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Equipment type deleted successfully' });
    } catch (error) {
        console.error('Error deleting equipment type:', error);
        if (error.message === 'Equipment type not found') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

module.exports = {
    // Drug Categories
    createDrugCategory,
    updateDrugCategory,
    deleteDrugCategory,
    
    // Drug Names
    createDrugName,
    updateDrugName,
    deleteDrugName,
    
    // Strength Units
    createStrengthUnit,
    updateStrengthUnit,
    deleteStrengthUnit,
    
    // Dosage Forms
    createDosageForm,
    updateDosageForm,
    deleteDosageForm,
    
    // Preparations
    createPreparation,
    updatePreparation,
    deletePreparation,
    
    // Equipment Categories
    createEquipmentCategory,
    updateEquipmentCategory,
    deleteEquipmentCategory,
    
    // Equipment Types
    createEquipmentType,
    updateEquipmentType,
    deleteEquipmentType
};

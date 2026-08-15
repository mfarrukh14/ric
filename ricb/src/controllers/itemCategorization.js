const { getDatabase } = require('../config/database');

// Get all drug categories
const getDrugCategories = async (req, res) => {
    const db = getDatabase();
    
    try {
        const categories = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM drug_categories ORDER BY name ASC',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(categories);
    } catch (error) {
        console.error('Error fetching drug categories:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get drug names by category
const getDrugNamesByCategory = async (req, res) => {
    const { categoryId } = req.params;
    const db = getDatabase();
    
    try {
        const drugNames = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM drug_names WHERE drug_category_id = ? ORDER BY name ASC',
                [categoryId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(drugNames);
    } catch (error) {
        console.error('Error fetching drug names:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all strength units
const getStrengthUnits = async (req, res) => {
    const db = getDatabase();
    
    try {
        const units = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM strength_units ORDER BY name ASC',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(units);
    } catch (error) {
        console.error('Error fetching strength units:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all dosage forms
const getDosageForms = async (req, res) => {
    const db = getDatabase();
    
    try {
        const forms = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM dosage_forms ORDER BY name ASC',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(forms);
    } catch (error) {
        console.error('Error fetching dosage forms:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all preparations
const getPreparations = async (req, res) => {
    const db = getDatabase();
    
    try {
        const preparations = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM preparations ORDER BY name ASC',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(preparations);
    } catch (error) {
        console.error('Error fetching preparations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all equipment categories
const getEquipmentCategories = async (req, res) => {
    const db = getDatabase();
    
    try {
        const categories = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM equipment_categories ORDER BY name ASC',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(categories);
    } catch (error) {
        console.error('Error fetching equipment categories:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get equipment types by category
const getEquipmentTypesByCategory = async (req, res) => {
    const { categoryId } = req.params;
    const db = getDatabase();
    
    try {
        const equipmentTypes = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM equipment_types WHERE equipment_category_id = ? ORDER BY name ASC',
                [categoryId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(equipmentTypes);
    } catch (error) {
        console.error('Error fetching equipment types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getDrugCategories,
    getDrugNamesByCategory,
    getStrengthUnits,
    getDosageForms,
    getPreparations,
    getEquipmentCategories,
    getEquipmentTypesByCategory
};

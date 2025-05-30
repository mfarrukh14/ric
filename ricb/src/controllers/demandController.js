const { getDatabase } = require('../config/database');

// Create a new demand
const createDemand = async (req, res) => {
    const db = getDatabase();
    const { itemName, quantity, estimatedCost, description, urgency, requiredBy } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!itemName || !quantity || !estimatedCost || !description || !requiredBy) {
        return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Validate user is eligible for demand creation
    if (!req.user.eligible_for_demand_creation) {
        return res.status(403).json({ message: 'You are not eligible to create demands' });
    }

    try {
        const result = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demands (item_name, quantity, estimated_cost, description, urgency, required_by, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [itemName, quantity, estimatedCost, description, urgency || 'normal', requiredBy, userId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

        res.status(201).json({
            message: 'Demand created successfully',
            demandId: result.id
        });
    } catch (error) {
        console.error('Error creating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demands for the current user
const getUserDemands = async (req, res) => {
    const db = getDatabase();
    const userId = req.user.id;

    try {
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as created_by_name, sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 WHERE d.created_by = ?
                 ORDER BY d.created_at DESC`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(demands);
    } catch (error) {
        console.error('Error fetching user demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all demands (for superadmin and store department users)
const getAllDemands = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user can view all demands
    const canViewAll = user.role === 'superadmin' || 
                      (user.department_name && user.department_name.toLowerCase() === 'store');

    if (!canViewAll) {
        return res.status(403).json({ message: 'You do not have permission to view all demands' });
    }

    try {
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department,
                        sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 ORDER BY d.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(demands);
    } catch (error) {
        console.error('Error fetching all demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update demand status (for store department users only)
const updateDemandStatus = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { status, response } = req.body;
    const user = req.user;

    // Check if user can update demand status - only Store department users
    const canUpdate = user.department_name && user.department_name.toLowerCase() === 'store';

    if (!canUpdate) {
        return res.status(403).json({ message: 'Only Store department users can update demand status' });
    }

    // Validate status
    if (!['available', 'not_available'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be "available" or "not_available"' });
    }

    try {
        // Check if demand exists
        const demand = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM demands WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found' });
        }

        // Update demand status
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands SET 
                 status = ?, 
                 store_response = ?, 
                 store_response_at = CURRENT_TIMESTAMP,
                 store_response_by = ?,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [status, response || null, user.id, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Demand status updated successfully' });
    } catch (error) {
        console.error('Error updating demand status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demand by ID
const getDemandById = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const user = req.user;

    try {
        const demand = await new Promise((resolve, reject) => {
            db.get(
                `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department,
                        sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 WHERE d.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found' });
        }

        // Check if user can view this demand
        const canView = user.role === 'superadmin' || 
                       demand.created_by === user.id ||
                       (user.department_name && user.department_name.toLowerCase() === 'store');

        if (!canView) {
            return res.status(403).json({ message: 'You do not have permission to view this demand' });
        }

        res.json(demand);
    } catch (error) {
        console.error('Error fetching demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    createDemand,
    getUserDemands,
    getAllDemands,
    updateDemandStatus,
    getDemandById
};

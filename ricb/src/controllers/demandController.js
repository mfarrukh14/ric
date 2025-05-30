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

        let newStatus = status;
        // If store rejects (not_available), send to vetting committee
        if (status === 'not_available') {
            newStatus = 'vetting';
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
                [newStatus, response || null, user.id, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });        res.json({ message: 'Demand status updated successfully' });
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
        }        // Check if user can view this demand
        const canView = user.role === 'superadmin' || 
                       demand.created_by === user.id ||
                       (user.department_name && user.department_name.toLowerCase() === 'store') ||
                       (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee') ||
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

        if (!canView) {
            return res.status(403).json({ message: 'You do not have permission to view this demand' });
        }

        res.json(demand);
    } catch (error) {
        console.error('Error fetching demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demands for vetting committee
const getVettingDemands = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is part of vetting committee
    const canView = user.committee_name && user.committee_name.toLowerCase() === 'vetting committee';

    if (!canView) {
        return res.status(403).json({ message: 'Only Vetting Committee members can view these demands' });
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
                 WHERE d.status = 'vetting'
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
        console.error('Error fetching vetting demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demands for purchase department
const getPurchaseDemands = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is part of purchase department
    const canView = user.department_name && user.department_name.toLowerCase() === 'purchase';

    if (!canView) {
        return res.status(403).json({ message: 'Only Purchase Department members can view these demands' });
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
                 WHERE d.status = 'vetting_approved'
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
        console.error('Error fetching purchase demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Evaluate demand by vetting committee
const evaluateDemandVetting = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { status, comments, updatedDemand } = req.body;
    const user = req.user;

    // Check if user is part of vetting committee
    const canEvaluate = user.committee_name && user.committee_name.toLowerCase() === 'vetting committee';

    if (!canEvaluate) {
        return res.status(403).json({ message: 'Only Vetting Committee members can evaluate demands' });
    }

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be "approved" or "rejected"' });
    }

    if (status === 'rejected' && !comments) {
        return res.status(400).json({ message: 'Rejection reason is required' });
    }

    try {
        // Check if demand exists and is in vetting status
        const demand = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM demands WHERE id = ? AND status = ?', [id, 'vetting'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found or not in vetting status' });
        }

        // Check if user has already evaluated this demand
        const existingEvaluation = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_evaluations WHERE demand_id = ? AND evaluator_id = ? AND committee_type = ?',
                [id, user.id, 'vetting'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingEvaluation) {
            return res.status(400).json({ message: 'You have already evaluated this demand' });
        }

        // Insert evaluation
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demand_evaluations (demand_id, evaluator_id, committee_type, status, comments, updated_demand_data)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, user.id, 'vetting', status, comments || null, updatedDemand ? JSON.stringify(updatedDemand) : null],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Update demand with any changes
        if (updatedDemand && status === 'approved') {
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     item_name = COALESCE(?, item_name),
                     quantity = COALESCE(?, quantity),
                     estimated_cost = COALESCE(?, estimated_cost),
                     description = COALESCE(?, description),
                     urgency = COALESCE(?, urgency),
                     required_by = COALESCE(?, required_by),
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        updatedDemand.item_name,
                        updatedDemand.quantity,
                        updatedDemand.estimated_cost,
                        updatedDemand.description,
                        updatedDemand.urgency,
                        updatedDemand.required_by,
                        id
                    ],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        // Check if all vetting committee members have evaluated
        const vettingCommitteeMembers = await new Promise((resolve, reject) => {
            db.all(
                'SELECT COUNT(*) as total FROM users WHERE committee_id = (SELECT id FROM committees WHERE name = ?)',
                ['Vetting Committee'],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows[0].total);
                }
            );
        });

        const approvedEvaluations = await new Promise((resolve, reject) => {
            db.all(
                'SELECT COUNT(*) as approved FROM demand_evaluations WHERE demand_id = ? AND committee_type = ? AND status = ?',
                [id, 'vetting', 'approved'],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows[0].approved);
                }
            );
        });

        const rejectedEvaluations = await new Promise((resolve, reject) => {
            db.all(
                'SELECT COUNT(*) as rejected FROM demand_evaluations WHERE demand_id = ? AND committee_type = ? AND status = ?',
                [id, 'vetting', 'rejected'],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows[0].rejected);
                }
            );
        });

        // Update demand status based on evaluations
        if (rejectedEvaluations > 0) {
            // If any member rejects, mark as rejected
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demands SET status = ?, vetting_status = ?, vetting_rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['rejected', 'rejected', comments, id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        } else if (approvedEvaluations === vettingCommitteeMembers) {
            // If all members approve, send to purchase department
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demands SET status = ?, vetting_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['vetting_approved', 'approved', id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        res.json({ message: 'Demand evaluation submitted successfully' });
    } catch (error) {
        console.error('Error evaluating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Evaluate demand by purchase department
const evaluateDemandPurchase = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { status, comments, updatedDemand } = req.body;
    const user = req.user;

    // Check if user is part of purchase department
    const canEvaluate = user.department_name && user.department_name.toLowerCase() === 'purchase';

    if (!canEvaluate) {
        return res.status(403).json({ message: 'Only Purchase Department members can evaluate demands' });
    }

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be "approved" or "rejected"' });
    }

    if (status === 'rejected' && !comments) {
        return res.status(400).json({ message: 'Rejection reason is required' });
    }

    try {
        // Check if demand exists and is approved by vetting committee
        const demand = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM demands WHERE id = ? AND status = ?', [id, 'vetting_approved'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found or not approved by vetting committee' });
        }

        // Check if user has already evaluated this demand
        const existingEvaluation = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_evaluations WHERE demand_id = ? AND evaluator_id = ? AND committee_type = ?',
                [id, user.id, 'purchase'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingEvaluation) {
            return res.status(400).json({ message: 'You have already evaluated this demand' });
        }

        // Insert evaluation
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demand_evaluations (demand_id, evaluator_id, committee_type, status, comments, updated_demand_data)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, user.id, 'purchase', status, comments || null, updatedDemand ? JSON.stringify(updatedDemand) : null],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Update demand with any changes
        if (updatedDemand && status === 'approved') {
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     item_name = COALESCE(?, item_name),
                     quantity = COALESCE(?, quantity),
                     estimated_cost = COALESCE(?, estimated_cost),
                     description = COALESCE(?, description),
                     urgency = COALESCE(?, urgency),
                     required_by = COALESCE(?, required_by),
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        updatedDemand.item_name,
                        updatedDemand.quantity,
                        updatedDemand.estimated_cost,
                        updatedDemand.description,
                        updatedDemand.urgency,
                        updatedDemand.required_by,
                        id
                    ],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }        // Check if all purchase department members have evaluated
        const purchaseDeptMembers = await new Promise((resolve, reject) => {
            db.all(
                'SELECT COUNT(*) as total FROM users WHERE department_id = (SELECT id FROM departments WHERE name = ?)',
                ['Purchase'],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows[0].total);
                }
            );
        });

        const approvedEvaluations = await new Promise((resolve, reject) => {
            db.all(
                'SELECT COUNT(*) as approved FROM demand_evaluations WHERE demand_id = ? AND committee_type = ? AND status = ?',
                [id, 'purchase', 'approved'],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows[0].approved);
                }
            );
        });

        const rejectedEvaluations = await new Promise((resolve, reject) => {
            db.all(
                'SELECT COUNT(*) as rejected FROM demand_evaluations WHERE demand_id = ? AND committee_type = ? AND status = ?',
                [id, 'purchase', 'rejected'],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows[0].rejected);
                }
            );
        });

        // Update demand status based on evaluations
        if (rejectedEvaluations > 0) {
            // If any member rejects, mark as rejected
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demands SET status = ?, purchase_status = ?, purchase_rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['rejected', 'rejected', comments, id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        } else if (approvedEvaluations >= 1) {
            // If at least one member approves (and no one rejects), mark as approved
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demands SET status = ?, purchase_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['approved', 'approved', id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        res.json({ message: 'Demand evaluation submitted successfully' });
    } catch (error) {
        console.error('Error evaluating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    createDemand,
    getUserDemands,
    getAllDemands,
    updateDemandStatus,
    getDemandById,
    getVettingDemands,
    getPurchaseDemands,
    evaluateDemandVetting,
    evaluateDemandPurchase
};

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
    const { status, comments, updatedDemand, biddingExpiryTime } = req.body;
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

    // Validate bidding expiry time for approved demands
    if (status === 'approved') {
        if (!biddingExpiryTime) {
            return res.status(400).json({ message: 'Bidding expiry time is required for approved demands' });
        }

        const expiryTime = new Date(biddingExpiryTime);
        const minTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        if (expiryTime < minTime) {
            return res.status(400).json({ message: 'Bidding expiry must be at least 24 hours from now' });
        }
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
            // If at least one member approves (and no one rejects), mark as approved and create tender
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demands SET status = ?, purchase_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['bidding_open', 'approved', id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Create tender record only if this approval makes the total count reach the requirement (1 member)
            if (approvedEvaluations === 1 && status === 'approved') {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO demand_tenders (demand_id, bidding_end_time, created_by)
                         VALUES (?, ?, ?)`,
                        [id, biddingExpiryTime, user.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }

        res.json({ message: 'Demand evaluation submitted successfully' });
    } catch (error) {
        console.error('Error evaluating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Approve demand and create tender (for purchase department)
const approveDemand = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { expiryDate } = req.body;
    const userId = req.user.id;

    try {        // Validate user is from purchase department
        if (req.user.department_name !== 'Purchase') {
            return res.status(403).json({ message: 'Only purchase department can approve demands' });
        }

        // Validate expiry date is provided and in future
        if (!expiryDate || new Date(expiryDate) <= new Date()) {
            return res.status(400).json({ message: 'Valid future expiry date is required' });
        }        // Check if demand exists and is ready for approval
        const demand = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demands WHERE id = ? AND status = ?',
                [id, 'vetting_approved'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found or not ready for approval' });
        }        // Update demand status to approved and open for bidding
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands 
                 SET status = 'bidding_open', purchase_response = 'approved', purchase_response_by = ?, purchase_response_date = datetime('now')
                 WHERE id = ?`,
                [userId, id],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });// Create tender
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demand_tenders (demand_id, bidding_end_time, tender_status, created_by, created_at)
                 VALUES (?, ?, 'active', ?, datetime('now'))`,
                [id, expiryDate, userId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

        res.json({ 
            message: 'Demand approved and tender created successfully',
            expiryDate 
        });
    } catch (error) {
        console.error('Error approving demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Set expiry for existing tender (for purchase department)
const setExpiryForTender = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { expiryDate } = req.body;

    try {        // Validate user is from purchase department
        if (req.user.department_name !== 'Purchase') {
            return res.status(403).json({ message: 'Only purchase department can set tender expiry' });
        }// Validate expiry date (minimum 1 minute from now for testing)
        const expiryTime = new Date(expiryDate);
        const minTime = new Date(Date.now() + 1 * 60 * 1000); // 1 minute from now
        
        if (!expiryDate || expiryTime <= minTime) {
            return res.status(400).json({ message: 'Bidding expiry must be at least 1 minute from now' });
        }// Check if tender exists and is active
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_tenders WHERE demand_id = ? AND tender_status = ?',
                [id, 'active'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Active tender not found for this demand' });
        }

        // Update tender expiry
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE demand_tenders SET bidding_end_time = ? WHERE demand_id = ? AND tender_status = ?',
                [expiryDate, id, 'active'],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ 
            message: 'Tender expiry updated successfully',
            expiryDate 
        });
    } catch (error) {
        console.error('Error setting tender expiry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Auto-award expired tenders
const processExpiredTenders = async () => {
    const db = getDatabase();
    const pdfService = require('../utils/pdfService');
    const EmailService = require('../utils/emailService');
    const emailService = new EmailService();
    
    try {        // First, let's check all active tenders to see their status
        // Note: Adding timezone offset for Pakistan (UTC+5)
        const allActiveTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name,
                        datetime(dt.bidding_end_time) as formatted_end_time,
                        datetime('now', '+5 hours') as current_time_local,
                        datetime('now') as current_time_utc,
                        CASE 
                            WHEN datetime(dt.bidding_end_time) <= datetime('now', '+5 hours') THEN 'EXPIRED'
                            ELSE 'ACTIVE'
                        END as status_check
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.tender_status = 'active'`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });        console.log(`All active tenders (${allActiveTenders.length}):`, allActiveTenders.map(t => ({
            id: t.id,
            item: t.item_name,
            end_time: t.bidding_end_time,
            formatted_end_time: t.formatted_end_time,
            current_time_local: t.current_time_local,
            current_time_utc: t.current_time_utc,
            status: t.status_check
        })));        // Get expired tenders that haven't been awarded yet
        console.log('Looking for expired tenders...');
        const expiredTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.quantity as demand_quantity,
                        datetime(dt.bidding_end_time) as formatted_end_time,
                        datetime('now', '+5 hours') as current_time
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.tender_status = 'active' 
                 AND datetime(dt.bidding_end_time) <= datetime('now', '+5 hours')`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        console.log(`Found ${expiredTenders.length} expired tenders:`, expiredTenders.map(t => ({
            id: t.id, 
            item: t.item_name, 
            end_time: t.bidding_end_time,
            formatted_end_time: t.formatted_end_time,
            current_time: t.current_time
        })));

        for (const tender of expiredTenders) {
            // Get all bids for this tender
            const bids = await new Promise((resolve, reject) => {
                db.all(                    `SELECT sb.*, s.company_name, s.company_email 
                     FROM supplier_bids sb
                     JOIN suppliers s ON sb.supplier_id = s.id
                     WHERE sb.tender_id = ?
                     ORDER BY sb.total_cost ASC`,
                    [tender.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });            // Check if we have any bids (removed minimum 3 bidders requirement for testing)
            if (bids.length >= 1) {
                // Get demand details for quantity requirement
                const demandDetails = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT quantity FROM demands WHERE id = ?',
                        [tender.demand_id],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });

                const requiredQuantity = demandDetails.quantity;
                
                // Find optimal supplier combination to fulfill required quantity at lowest cost
                const optimalCombination = findOptimalSupplierCombination(bids, requiredQuantity);
                
                if (optimalCombination.suppliers.length > 0) {
                    // Mark tender as awarded (multi-supplier)
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE demand_tenders 
                             SET tender_status = 'awarded',
                                 awarded_at = datetime('now')
                             WHERE id = ?`,
                            [tender.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    // Update demand status to awarded
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE demands 
                             SET status = 'awarded'
                             WHERE id = ?`,
                            [tender.demand_id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    console.log(`Tender ${tender.id} awarded to ${optimalCombination.suppliers.length} suppliers for total cost $${optimalCombination.totalCost}`);
                    
                    // Create supply orders for each winning supplier
                    for (const supplier of optimalCombination.suppliers) {
                        const orderNumber = `SO-${tender.id}-${supplier.supplier_id}-${Date.now()}`;
                        const unitPrice = supplier.total_cost / supplier.proposed_quantity;
                        
                        // Calculate delivery date (add delivery days to current date)
                        const deliveryDate = new Date();
                        deliveryDate.setDate(deliveryDate.getDate() + supplier.delivery_days);
                        
                        // Create supply order record
                        const supplyOrderId = await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO supply_orders (
                                    order_number, demand_id, supplier_id, tender_id, bid_id,
                                    item_name, quantity, unit_price, total_amount, delivery_date
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    orderNumber,
                                    tender.demand_id,
                                    supplier.supplier_id,
                                    tender.id,
                                    supplier.id,
                                    tender.item_name,
                                    supplier.awarded_quantity,
                                    unitPrice,
                                    supplier.total_cost,
                                    deliveryDate.toISOString().split('T')[0]
                                ],
                                function(err) {
                                    if (err) reject(err);
                                    else resolve(this.lastID);
                                }
                            );
                        });                        // Get demand details for PDF generation
                        const demandFullDetails = await new Promise((resolve, reject) => {
                            db.get(
                                'SELECT urgency, description FROM demands WHERE id = ?',
                                [tender.demand_id],
                                (err, row) => {
                                    if (err) reject(err);
                                    else resolve(row);
                                }
                            );
                        });

                        // Generate PDF and send email for this supplier
                        try {
                            const orderData = {
                                id: supplyOrderId,
                                order_number: orderNumber,
                                tender_id: tender.id,
                                demand_id: tender.demand_id,
                                item_name: tender.item_name,
                                quantity: supplier.awarded_quantity,
                                unit_price: unitPrice,
                                total_amount: supplier.total_cost,
                                delivery_date: deliveryDate.toISOString().split('T')[0],
                                company_name: supplier.company_name,
                                company_email: supplier.company_email,
                                delivery_days: supplier.delivery_days,
                                delivery_time_days: supplier.delivery_days,
                                bid_comments: supplier.bid_comments,
                                urgency: demandFullDetails.urgency || 'medium',
                                description: demandFullDetails.description || 'No description provided',
                                awarded_bid_amount: supplier.total_cost,
                                created_at: new Date().toISOString()
                            };

                            // Generate PDF for this supply order
                            const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
                            
                            // Send email with PDF attachment
                            await emailService.sendSupplyOrderEmail(
                                supplier.company_email,
                                supplier.company_name,
                                orderData,
                                pdfBuffer
                            );
                            
                            console.log(`Supply order ${orderNumber} generated and email sent to ${supplier.company_name}`);
                        } catch (emailError) {
                            console.error(`Error sending supply order email for ${supplier.company_name}:`, emailError);
                            // Continue processing other suppliers even if email fails
                        }
                    }
                } else {
                    console.log(`Tender ${tender.id} failed - no supplier combination can fulfill required quantity`);
                    // Mark as failed if no combination can fulfill the requirement
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE demand_tenders 
                             SET tender_status = 'failed'
                             WHERE id = ?`,
                            [tender.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE demands 
                             SET status = 'tender_failed'
                             WHERE id = ?`,
                            [tender.demand_id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                }
                
            } else {
                // Not enough bids, mark as failed
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE demand_tenders 
                         SET tender_status = 'failed'
                         WHERE id = ?`,
                        [tender.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE demands 
                         SET status = 'tender_failed'
                         WHERE id = ?`,
                        [tender.demand_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                console.log(`Tender ${tender.id} failed - insufficient bids (${bids.length} received, minimum 3 required)`);
            }
        }

        return expiredTenders.length;
    } catch (error) {
        console.error('Error processing expired tenders:', error);
        throw error;
    }
};

// Get awarded tenders (for generating supply orders)
const getAwardedTenders = async (req, res) => {
    const db = getDatabase();
    
    try {        const awardedTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    dt.*,
                    d.item_name,
                    d.quantity,
                    d.description,
                    d.urgency,
                    d.required_by,
                    s.company_name,
                    s.company_email,
                    sb.delivery_time_days,
                    sb.comments as bid_comments,
                    sb.proposal_document
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN suppliers s ON dt.awarded_supplier_id = s.id
                 LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id AND sb.supplier_id = dt.awarded_supplier_id
                 WHERE dt.tender_status = 'awarded'
                 ORDER BY dt.awarded_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(awardedTenders);
    } catch (error) {
        console.error('Error fetching awarded tenders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate and download supply order PDF
const generateSupplyOrderPDF = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    
    try {        // Get tender data
        const orderData = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    dt.*,
                    d.item_name,
                    d.quantity,
                    d.description,
                    d.urgency,
                    d.required_by,
                    s.company_name,
                    s.company_email,
                    sb.delivery_time_days,
                    sb.comments as bid_comments,
                    sb.proposal_document
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN suppliers s ON dt.awarded_supplier_id = s.id
                 LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id AND sb.supplier_id = dt.awarded_supplier_id
                 WHERE dt.id = ? AND dt.tender_status = 'awarded'`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!orderData) {
            return res.status(404).json({ message: 'Awarded tender not found' });
        }

        const pdfService = require('../utils/pdfService');
        const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
          const orderNumber = `SO-${orderData.id}-${Date.now()}`;
        
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Supply_Order_${orderNumber}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        
        res.send(pdfBuffer);
        
    } catch (error) {
        console.error('Error generating supply order PDF:', error);
        res.status(500).json({ message: 'Error generating PDF' });
    }
};

// Get all supply orders for Purchase Department dashboard
const getSupplyOrders = async (req, res) => {
    const db = getDatabase();
    
    try {
        // Check if user is from purchase department
        if (req.user.department_name !== 'Purchase') {
            return res.status(403).json({ message: 'Only purchase department can view supply orders' });
        }        const supplyOrders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    so.*,
                    d.description as demand_description,
                    d.urgency,
                    d.required_by,
                    s.company_name,
                    s.company_email,
                    dt.tender_status,
                    sb.delivery_days,
                    sb.bid_comments
                 FROM supply_orders so
                 JOIN demands d ON so.demand_id = d.id
                 JOIN suppliers s ON so.supplier_id = s.id
                 JOIN demand_tenders dt ON so.tender_id = dt.id
                 LEFT JOIN supplier_bids sb ON so.bid_id = sb.id
                 ORDER BY so.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Group supply orders by tender_id to show related orders together
        const groupedOrders = {};
        supplyOrders.forEach(order => {
            if (!groupedOrders[order.tender_id]) {
                groupedOrders[order.tender_id] = {
                    tender_id: order.tender_id,
                    demand_id: order.demand_id,
                    item_name: order.item_name,
                    total_required_quantity: 0,
                    total_awarded_quantity: 0,
                    total_cost: 0,
                    urgency: order.urgency,
                    required_by: order.required_by,
                    demand_description: order.demand_description,
                    orders: []
                };
            }
            
            groupedOrders[order.tender_id].total_awarded_quantity += order.quantity;
            groupedOrders[order.tender_id].total_cost += order.total_amount;
            groupedOrders[order.tender_id].orders.push(order);
        });

        // Convert to array and add total required quantity
        const result = [];
        for (const group of Object.values(groupedOrders)) {
            // Get total required quantity from demand
            const demandInfo = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT quantity FROM demands WHERE id = ?',
                    [group.demand_id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            group.total_required_quantity = demandInfo ? demandInfo.quantity : 0;
            group.fulfillment_percentage = group.total_required_quantity > 0 
                ? Math.round((group.total_awarded_quantity / group.total_required_quantity) * 100)
                : 0;
            
            result.push(group);
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching supply orders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate supply order PDF by order ID
const generateSupplyOrderPDFById = async (req, res) => {
    const db = getDatabase();
    const { orderId } = req.params;
    
    try {
        // Check if user is from purchase department
        if (req.user.department_name !== 'Purchase') {
            return res.status(403).json({ message: 'Only purchase department can generate supply order PDFs' });
        }

        // Get supply order data
        const orderData = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    so.*,
                    d.description as demand_description,
                    d.urgency,
                    d.required_by,
                    s.company_name,
                    s.company_email,
                    sb.delivery_days,
                    sb.bid_comments
                 FROM supply_orders so
                 JOIN demands d ON so.demand_id = d.id
                 JOIN suppliers s ON so.supplier_id = s.id
                 LEFT JOIN supplier_bids sb ON so.bid_id = sb.id
                 WHERE so.id = ?`,
                [orderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!orderData) {
            return res.status(404).json({ message: 'Supply order not found' });
        }

        const pdfService = require('../utils/pdfService');
        const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
        
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Supply_Order_${orderData.order_number}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        
        res.send(pdfBuffer);
        
    } catch (error) {
        console.error('Error generating supply order PDF:', error);
        res.status(500).json({ message: 'Error generating PDF' });
    }
};

// Find optimal supplier combination to fulfill required quantity at lowest cost
const findOptimalSupplierCombination = (bids, requiredQuantity) => {
    // Sort bids by cost per unit (lowest first for better efficiency)
    const sortedBids = bids.map(bid => ({
        ...bid,
        costPerUnit: bid.total_cost / bid.proposed_quantity
    })).sort((a, b) => a.costPerUnit - b.costPerUnit);

    // Try to find the optimal combination using dynamic programming approach
    const findBestCombination = (bidIndex, remainingQuantity, currentCombination, currentCost) => {
        // Base case: if we've fulfilled the requirement
        if (remainingQuantity <= 0) {
            return {
                suppliers: currentCombination.map(combo => ({
                    ...combo.bid,
                    awarded_quantity: combo.quantity
                })),
                totalCost: currentCost,
                fulfilled: true
            };
        }

        // If we've exhausted all bids
        if (bidIndex >= sortedBids.length) {
            return { suppliers: [], totalCost: Infinity, fulfilled: false };
        }

        const currentBid = sortedBids[bidIndex];
        let bestResult = { suppliers: [], totalCost: Infinity, fulfilled: false };

        // Try using this supplier for different quantities (up to their capacity or remaining need)
        const maxUsableQuantity = Math.min(currentBid.proposed_quantity, remainingQuantity);
        
        for (let useQuantity = 0; useQuantity <= maxUsableQuantity; useQuantity++) {
            let combinationCost = currentCost;
            let newCombination = [...currentCombination];

            if (useQuantity > 0) {
                // Calculate proportional cost for partial quantity
                const proportionalCost = (currentBid.total_cost / currentBid.proposed_quantity) * useQuantity;
                combinationCost += proportionalCost;
                newCombination.push({
                    bid: currentBid,
                    quantity: useQuantity,
                    cost: proportionalCost
                });
            }

            // Recursively try with remaining suppliers
            const result = findBestCombination(
                bidIndex + 1,
                remainingQuantity - useQuantity,
                newCombination,
                combinationCost
            );

            // Update best result if this is better
            if (result.fulfilled && result.totalCost < bestResult.totalCost) {
                bestResult = result;
            }
        }

        return bestResult;
    };

    // Start the recursive search
    const result = findBestCombination(0, requiredQuantity, [], 0);

    // If no exact match found, try to get as close as possible
    if (!result.fulfilled || result.suppliers.length === 0) {
        // Fallback: greedy approach - select suppliers in order of cost efficiency
        let remainingQuantity = requiredQuantity;
        let selectedSuppliers = [];
        let totalCost = 0;

        for (const bid of sortedBids) {
            if (remainingQuantity <= 0) break;

            const useQuantity = Math.min(bid.proposed_quantity, remainingQuantity);
            const proportionalCost = (bid.total_cost / bid.proposed_quantity) * useQuantity;

            selectedSuppliers.push({
                ...bid,
                awarded_quantity: useQuantity
            });

            totalCost += proportionalCost;
            remainingQuantity -= useQuantity;
        }

        return {
            suppliers: selectedSuppliers,
            totalCost: totalCost,
            fulfilled: remainingQuantity <= 0
        };
    }

    return result;
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
    evaluateDemandPurchase,
    processExpiredTenders,
    getAwardedTenders,
    generateSupplyOrderPDF,
    approveDemand,
    setExpiryForTender,
    getSupplyOrders,
    generateSupplyOrderPDFById
};

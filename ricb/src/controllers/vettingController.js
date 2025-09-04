const { getDatabase } = require('../config/database');

// Get demands for vetting committee
const getVettingDemands = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from vetting committee
    const canView = user.role === 'superadmin' || 
                   (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view vetting demands' });
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
                 WHERE d.status IN ('vetting', 'vetting_pending')
                 ORDER BY d.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get items for each demand
        for (const demand of demands) {
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id`,
                    [demand.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            demand.items = items;
        }

        res.json(demands);
    } catch (error) {
        console.error('Error fetching vetting demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Evaluate demand by vetting committee
const evaluateDemandVetting = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { action, remarks } = req.body;
    const user = req.user;

    // Check if user is from vetting committee
    const canEvaluate = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee');

    if (!canEvaluate) {
        return res.status(403).json({ message: 'Only vetting committee members can evaluate demands' });
    }

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    try {
        const newStatus = action === 'approve' ? 'vetting_approved' : 'vetting_rejected';
        
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands SET 
                 status = ?, 
                 vetting_rejection_reason = ?,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newStatus, action === 'reject' ? remarks || null : null, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: `Demand ${action}d successfully` });
    } catch (error) {
        console.error('Error evaluating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all tenders pending vetting approval
const getPendingTenders = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from vetting committee
    const canView = user.role === 'superadmin' || 
                   (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view vetting tenders' });
    }
    
    try {
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.description as demand_description,
                        u.name as created_by_name, dept.name as created_by_department,
                        COUNT(di.id) as item_count,
                        SUM(COALESCE(di.store_estimated_cost, di.estimated_cost * di.quantity)) as total_estimated_cost,
                        GROUP_CONCAT(di.item_name, ', ') as item_names
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN demand_items di ON d.id = di.demand_id
                 WHERE dt.tender_status = 'pending_vetting'
                 AND NOT EXISTS (
                     SELECT 1 FROM tender_vetting_evaluations tve 
                     WHERE tve.tender_id = dt.id AND tve.committee_member_id = ?
                 )
                 GROUP BY dt.id
                 ORDER BY dt.created_at DESC`,
                [user.id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching pending tenders:', error);
        res.status(500).json({ message: 'Failed to fetch pending tenders', error: error.message });
    }
};

// Get all tenders in vetting process (including those already evaluated by current user)
const getAllVettingTenders = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from vetting committee
    const canView = user.role === 'superadmin' || 
                   (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view vetting tenders' });
    }
    
    try {
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.description as demand_description,
                        u.name as created_by_name, dept.name as created_by_department,
                        COUNT(di.id) as item_count,
                        SUM(COALESCE(di.store_estimated_cost, di.estimated_cost * di.quantity)) as total_estimated_cost,
                        GROUP_CONCAT(di.item_name, ', ') as item_names,
                        tve.decision as my_decision,
                        tve.comments as my_comments,
                        tve.evaluated_at as my_evaluation_date
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN demand_items di ON d.id = di.demand_id
                 LEFT JOIN tender_vetting_evaluations tve ON dt.id = tve.tender_id AND tve.committee_member_id = ?
                 WHERE dt.tender_status IN ('pending_vetting', 'vetting_approved', 'vetting_rejected')
                 GROUP BY dt.id
                 ORDER BY dt.created_at DESC`,
                [user.id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching all vetting tenders:', error);
        res.status(500).json({ message: 'Failed to fetch vetting tenders', error: error.message });
    }
};

// Get tender details for vetting review
const getTenderForVetting = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from vetting committee
    const canView = user.role === 'superadmin' || 
                   (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view tender details' });
    }
    
    try {
        // Get tender details with calculated total cost
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.description as demand_description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as created_by_department,
                        SUM(COALESCE(di.store_estimated_cost, di.estimated_cost * di.quantity)) as total_estimated_cost,
                        COUNT(di.id) as item_count
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN demand_items di ON d.id = di.demand_id
                 WHERE dt.id = ? AND dt.tender_status = 'pending_vetting'
                 GROUP BY dt.id`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending vetting' });
        }

        // Get demand items for this tender
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*, 
                        ic.name as category_name,
                        in_t.name as item_name_full,
                        dc.name as drug_category_name,
                        dn.name as drug_name,
                        su.name as strength_unit_name,
                        df.name as dosage_form_name,
                        p.name as preparation_name,
                        ec.name as equipment_category_name,
                        et.name as equipment_type_name
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 LEFT JOIN drug_categories dc ON di.drug_category_id = dc.id
                 LEFT JOIN drug_names dn ON di.drug_name_id = dn.id
                 LEFT JOIN strength_units su ON di.strength_unit_id = su.id
                 LEFT JOIN dosage_forms df ON di.dosage_form_id = df.id
                 LEFT JOIN preparations p ON di.preparation_id = p.id
                 LEFT JOIN equipment_categories ec ON di.equipment_category_id = ec.id
                 LEFT JOIN equipment_types et ON di.equipment_type_id = et.id
                 WHERE di.demand_id = ?
                 ORDER BY di.id`,
                [tender.demand_id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get evaluation criteria
        const evaluationCriteria = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM tender_evaluation_criteria 
                 WHERE tender_id = ? 
                 ORDER BY is_knockout DESC, id ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get existing vetting evaluations
        const existingEvaluations = await new Promise((resolve, reject) => {
            db.all(
                `SELECT tve.*, u.name as member_name
                 FROM tender_vetting_evaluations tve
                 JOIN users u ON tve.committee_member_id = u.id
                 WHERE tve.tender_id = ?
                 ORDER BY tve.evaluated_at DESC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({
            tender,
            items,
            evaluationCriteria,
            existingEvaluations
        });
    } catch (error) {
        console.error('Error fetching tender for vetting:', error);
        res.status(500).json({ message: 'Failed to fetch tender details', error: error.message });
    }
};

// Submit vetting evaluation (approve/reject)
const submitTenderVettingEvaluation = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { decision, comments } = req.body;
    const user = req.user;

    // Check if user is from vetting committee
    const canEvaluate = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee');

    if (!canEvaluate) {
        return res.status(403).json({ message: 'Only vetting committee members can evaluate tenders' });
    }
    
    try {
        // Validate decision
        if (!['approve', 'reject'].includes(decision)) {
            return res.status(400).json({ message: 'Decision must be either "approve" or "reject"' });
        }

        // Check if tender exists and is pending vetting
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM demand_tenders WHERE id = ? AND tender_status = ?',
                [tenderId, 'pending_vetting'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending vetting' });
        }

        // Check if user has already evaluated this tender
        const existingEvaluation = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM tender_vetting_evaluations WHERE tender_id = ? AND committee_member_id = ?',
                [tenderId, user.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingEvaluation) {
            return res.status(400).json({ message: 'You have already evaluated this tender' });
        }

        // Insert evaluation
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO tender_vetting_evaluations (tender_id, committee_member_id, decision, comments)
                 VALUES (?, ?, ?, ?)`,
                [tenderId, user.id, decision, comments],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Check if all vetting committee members have evaluated
        const totalMembersResult = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as count FROM users u
                 JOIN committees c ON u.committee_id = c.id
                 WHERE c.name = 'Vetting Committee'`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const completedEvaluationsResult = await new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as count FROM tender_vetting_evaluations WHERE tender_id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // If all members have evaluated, finalize the decision
        const totalMembers = totalMembersResult.count;
        const completedEvaluations = completedEvaluationsResult.count;
        
        console.log(`Vetting status for tender ${tenderId}: ${completedEvaluations}/${totalMembers} members evaluated`);
        
        if (completedEvaluations >= totalMembers) {
            console.log(`All members have evaluated tender ${tenderId}, finalizing...`);
            await finalizeTenderVetting(tenderId);
        }

        res.json({ 
            message: 'Evaluation submitted successfully',
            allEvaluated: completedEvaluations >= totalMembers,
            progress: `${completedEvaluations}/${totalMembers}`
        });
    } catch (error) {
        console.error('Error submitting vetting evaluation:', error);
        res.status(500).json({ message: 'Failed to submit evaluation', error: error.message });
    }
};

// Finalize tender vetting decision
const finalizeTenderVetting = async (tenderId) => {
    const db = getDatabase();
    
    try {
        // Get all evaluations for this tender
        const evaluations = await new Promise((resolve, reject) => {
            db.all(
                'SELECT decision FROM tender_vetting_evaluations WHERE tender_id = ?',
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Check if all decisions are approve
        const allApproved = evaluations.every(eval => eval.decision === 'approve');
        const newStatus = allApproved ? 'vetting_approved' : 'vetting_rejected';

        // Update tender status
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                [newStatus, tenderId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Add status history
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO tender_status_history (tender_id, status, comments, changed_by)
                 VALUES (?, ?, ?, ?)`,
                [
                    tenderId, 
                    newStatus, 
                    allApproved 
                        ? 'Tender approved by all vetting committee members, ready for Purchase Department to submit for Finance and MS HOD approval' 
                        : 'Tender rejected by vetting committee',
                    1 // System user
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log(`Tender ${tenderId} vetting finalized with status: ${newStatus}`);
    } catch (error) {
        console.error('Error finalizing tender vetting:', error);
        throw error;
    }
};

// Update tender items (for vetting committee)
const updateTenderItems = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { items } = req.body;
    const user = req.user;

    // Check if user is from vetting committee
    const canUpdate = user.role === 'superadmin' || 
                     (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee');

    if (!canUpdate) {
        return res.status(403).json({ message: 'Only vetting committee members can update tender items' });
    }

    try {
        // Check if tender exists and is pending vetting
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT demand_id FROM demand_tenders WHERE id = ? AND tender_status = ?',
                [tenderId, 'pending_vetting'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending vetting' });
        }

        const demandId = tender.demand_id;

        // Begin transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Delete existing demand items for this demand
            await new Promise((resolve, reject) => {
                db.run(
                    'DELETE FROM demand_items WHERE demand_id = ?',
                    [demandId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Insert updated items
            for (const item of items) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO demand_items (
                            demand_id, item_name, custom_item_name, quantity, unit, 
                            estimated_cost, store_estimated_cost, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [
                            demandId,
                            item.item_name,
                            item.custom_item_name,
                            item.quantity,
                            item.unit,
                            item.estimated_cost,
                            item.store_estimated_cost || (item.estimated_cost * item.quantity)
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            // Update the demand's estimated cost
            const totalCost = items.reduce((sum, item) => sum + (item.estimated_cost * item.quantity), 0);
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demands SET estimated_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [totalCost, demandId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({ message: 'Tender items updated successfully' });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve, reject) => {
                db.run('ROLLBACK', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            throw error;
        }

    } catch (error) {
        console.error('Error updating tender items:', error);
        res.status(500).json({ message: 'Failed to update tender items', error: error.message });
    }
};

// Get vetting committee members
const getVettingCommitteeMembers = async (req, res) => {
    const db = getDatabase();
    
    try {
        const members = await new Promise((resolve, reject) => {
            db.all(
                `SELECT u.id, u.name, u.designation, u.username, u.created_at
                 FROM users u
                 JOIN committees c ON u.committee_id = c.id
                 WHERE c.name = 'Vetting Committee'
                 ORDER BY u.name`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(members);
    } catch (error) {
        console.error('Error fetching vetting committee members:', error);
        res.status(500).json({ message: 'Failed to fetch committee members', error: error.message });
    }
};

module.exports = {
    getVettingDemands,
    evaluateDemandVetting,
    getPendingTenders,
    getAllVettingTenders,
    getTenderForVetting,
    submitTenderVettingEvaluation,
    updateTenderItems,
    getVettingCommitteeMembers
};
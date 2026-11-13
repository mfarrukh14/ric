const { getDatabase, dbAll, dbGet, dbRun } = require('../db');
const { getFieldValuesByItemIds, formatItemFields } = require('../utils/itemFieldFormatter');

// Get all tenders pending vetting approval
const getPendingTenders = async (req, res) => {
    const user = req.user;

    try {
        const tenders = await dbAll(`SELECT dt.*, d.description as demand_description,
                u.name as created_by_name, dept.name as created_by_department,
                (SELECT COUNT(*) FROM demand_items WHERE demand_id = d.id AND COALESCE(is_removed, 0) = 0) as item_count,
                (SELECT SUM(COALESCE(di2.store_estimated_cost, di2.estimated_cost * di2.quantity)) FROM demand_items di2 WHERE di2.demand_id = d.id AND COALESCE(di2.is_removed, 0) = 0) as total_estimated_cost,
                (SELECT GROUP_CONCAT(di3.item_name, ', ') FROM demand_items di3 WHERE di3.demand_id = d.id AND COALESCE(di3.is_removed, 0) = 0) as item_names
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         JOIN users u ON dt.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         WHERE dt.tender_status = 'pending_vetting'
         AND NOT EXISTS (
             SELECT 1 FROM tender_vetting_evaluations tve 
             WHERE tve.tender_id = dt.id AND tve.committee_member_id = ?
         )
         ORDER BY dt.created_at DESC`, [user.id]);

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching pending tenders:', error);
        res.status(500).json({ message: 'Failed to fetch pending tenders' });
    }
};

// Get all tenders in vetting process (including those already evaluated by current user)
const getAllVettingTenders = async (req, res) => {
    const user = req.user;

    try {
        const tenders = await dbAll(`SELECT dt.*, d.description as demand_description,
                u.name as created_by_name, dept.name as created_by_department,
                (SELECT COUNT(*) FROM demand_items WHERE demand_id = d.id AND COALESCE(is_removed, 0) = 0) as item_count,
                (SELECT SUM(COALESCE(di2.store_estimated_cost, di2.estimated_cost * di2.quantity)) FROM demand_items di2 WHERE di2.demand_id = d.id AND COALESCE(di2.is_removed, 0) = 0) as total_estimated_cost,
                (SELECT GROUP_CONCAT(di3.item_name, ', ') FROM demand_items di3 WHERE di3.demand_id = d.id AND COALESCE(di3.is_removed, 0) = 0) as item_names,
                tve.decision as my_decision,
                tve.comments as my_comments,
                tve.evaluated_at as my_evaluation_date
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         JOIN users u ON dt.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         LEFT JOIN tender_vetting_evaluations tve ON dt.id = tve.tender_id AND tve.committee_member_id = ?
         WHERE dt.tender_status IN ('pending_vetting', 'vetting_approved', 'vetting_rejected')
         ORDER BY dt.created_at DESC`, [user.id]);

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching all vetting tenders:', error);
        res.status(500).json({ message: 'Failed to fetch vetting tenders' });
    }
};

// Get tender details for vetting review
const getTenderForVetting = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;

    
    try {
        // Get tender details with calculated total cost
        const tender = await dbGet(
            `SELECT dt.*, d.description as demand_description, d.urgency, d.required_by,
                    u.name as created_by_name, dept.name as created_by_department,
                    (SELECT SUM(COALESCE(di2.store_estimated_cost, di2.estimated_cost * di2.quantity)) FROM demand_items di2 WHERE di2.demand_id = d.id AND COALESCE(di2.is_removed, 0) = 0) as total_estimated_cost,
                    (SELECT COUNT(*) FROM demand_items WHERE demand_id = d.id AND COALESCE(is_removed, 0) = 0) as item_count
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             JOIN users u ON dt.created_by = u.id
             LEFT JOIN departments dept ON u.department_id = dept.id
             WHERE dt.id = ? AND dt.tender_status = 'pending_vetting'`,
            [tenderId]
        );

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending vetting' });
        }

        // Get demand items for this tender
        const rawItems = await dbAll(`SELECT di.*,
                ic.name as category_name,
                in_t.name as item_name_full
         FROM demand_items di
         LEFT JOIN item_categories ic ON di.category_id = ic.id
         LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
         WHERE di.demand_id = ? AND COALESCE(di.is_removed, 0) = 0
         ORDER BY di.id`, [tender.demand_id]);

        const fieldValuesByItem = await getFieldValuesByItemIds(db, rawItems.map(item => item.id));
        const items = rawItems.map(item => {
            const formatted = formatItemFields(fieldValuesByItem[item.id] || []);
            return {
                ...item,
                custom_fields: formatted.fields,
                custom_field_description: formatted.description
            };
        });

        // Get evaluation criteria
        const evaluationCriteria = await dbAll(`SELECT * FROM tender_evaluation_criteria 
         WHERE tender_id = ? 
         ORDER BY is_knockout DESC, id ASC`, [tenderId]);

        // Get existing vetting evaluations
        const existingEvaluations = await dbAll(`SELECT tve.*, u.name as member_name
         FROM tender_vetting_evaluations tve
         JOIN users u ON tve.committee_member_id = u.id
         WHERE tve.tender_id = ?
         ORDER BY tve.evaluated_at DESC`, [tenderId]);

        res.json({
            tender,
            items,
            evaluationCriteria,
            existingEvaluations
        });
    } catch (error) {
        console.error('Error fetching tender for vetting:', error);
        res.status(500).json({ message: 'Failed to fetch tender details' });
    }
};

// Submit vetting evaluation (approve/reject)
const submitTenderVettingEvaluation = async (req, res) => {
    const { tenderId } = req.params;
    const { decision, comments } = req.body;
    const user = req.user;

    try {
        // Validate decision
        if (!['approve', 'reject'].includes(decision)) {
            return res.status(400).json({ message: 'Decision must be either "approve" or "reject"' });
        }

        // Check if tender exists and is pending vetting
        const tender = await dbGet(
            'SELECT id FROM demand_tenders WHERE id = ? AND tender_status = ?',
            [tenderId, 'pending_vetting']
        );

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending vetting' });
        }

        // Check if user has already evaluated this tender
        const existingEvaluation = await dbGet(
            'SELECT id FROM tender_vetting_evaluations WHERE tender_id = ? AND committee_member_id = ?',
            [tenderId, user.id]
        );

        if (existingEvaluation) {
            return res.status(400).json({ message: 'You have already evaluated this tender' });
        }

        // Insert evaluation
        await dbRun(
            `INSERT INTO tender_vetting_evaluations (tender_id, committee_member_id, decision, comments)
             VALUES (?, ?, ?, ?)`,
            [tenderId, user.id, decision, comments]
        );

        // Check if all vetting committee members have evaluated
        const totalMembersResult = await dbGet(`SELECT COUNT(*) as count FROM users u
         JOIN committees c ON u.committee_id = c.id
         WHERE c.name = 'Vetting Committee'`, []);

        const completedEvaluationsResult = await dbGet(
            'SELECT COUNT(*) as count FROM tender_vetting_evaluations WHERE tender_id = ?',
            [tenderId]
        );

        // If all members have evaluated, finalize the decision
        const totalMembers = totalMembersResult.count;
        const completedEvaluations = completedEvaluationsResult.count;
        
        
        if (completedEvaluations >= totalMembers) {
            await finalizeTenderVetting(tenderId);
        }

        res.json({ 
            message: 'Evaluation submitted successfully',
            allEvaluated: completedEvaluations >= totalMembers,
            progress: `${completedEvaluations}/${totalMembers}`
        });
    } catch (error) {
        console.error('Error submitting vetting evaluation:', error);
        res.status(500).json({ message: 'Failed to submit evaluation' });
    }
};

// Finalize tender vetting decision
const finalizeTenderVetting = async (tenderId) => {
    try {
        // Get all evaluations for this tender
        const evaluations = await dbAll(
            'SELECT decision FROM tender_vetting_evaluations WHERE tender_id = ?',
            [tenderId]
        );

        // Check if all decisions are approve
        const allApproved = evaluations.every(evaluation => evaluation.decision === 'approve');
        const newStatus = allApproved ? 'vetting_approved' : 'vetting_rejected';

        // Update tender status
        await dbRun(
            'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
            [newStatus, tenderId]
        );

        // Add status history
        await dbRun(
            `INSERT INTO tender_status_history (tender_id, status, comments, changed_by)
             VALUES (?, ?, ?, ?)`,
            [
                tenderId, 
                newStatus, 
                allApproved 
                    ? 'Tender approved by all vetting committee members, ready for Purchase Department to submit for Finance and MS HOD approval' 
                    : 'Tender rejected by vetting committee',
                1 // System user
            ]
        );

    } catch (error) {
        console.error('Error finalizing tender vetting:', error);
        throw error;
    }
};

// Update tender items (for vetting committee)
const updateTenderItems = async (req, res) => {
    const { tenderId } = req.params;
    const { items } = req.body;

    try {
        // Check if tender exists and is pending vetting
        const tender = await dbGet(
            'SELECT demand_id FROM demand_tenders WHERE id = ? AND tender_status = ?',
            [tenderId, 'pending_vetting']
        );

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending vetting' });
        }

        const demandId = tender.demand_id;
        if (!Array.isArray(items) || items.some((i) => !(Number(i.quantity) > 0) || !(Number(i.estimated_cost) >= 0))) {
            return res.status(400).json({ message: 'Every item needs a quantity and a unit cost' });
        }

        {
            // Edit items in place. The old code deleted every item and re-inserted a few
            // columns, which dropped categories, drug/equipment details, specifications and
            // store data. Rates are per unit; the total is rate × quantity.
            const existing = new Map((await dbAll('SELECT id FROM demand_items WHERE demand_id = ?', [demandId])).map((r) => [r.id, r]));
            const kept = new Set();
            for (const item of items) {
                const qty = Number(item.quantity);
                const rate = Number(item.estimated_cost);
                if (item.id && existing.has(Number(item.id))) {
                    kept.add(Number(item.id));
                    await dbRun(
                        `UPDATE demand_items SET quantity = ?, unit = ?, estimated_cost = ?, current_year_cost = ?,
                         store_estimated_cost = ?, custom_item_name = COALESCE(?, custom_item_name)
                         WHERE id = ? AND demand_id = ?`,
                        [qty, item.unit, rate, rate, qty * rate, item.custom_item_name || null, Number(item.id), demandId],
                    );
                } else {
                    await dbRun(
                        `INSERT INTO demand_items (demand_id, item_name, custom_item_name, quantity, unit,
                         estimated_cost, current_year_cost, store_estimated_cost, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [demandId, item.custom_item_name || item.item_name, item.custom_item_name || null, qty, item.unit, rate, rate, qty * rate],
                    );
                }
            }
            // Items left out were removed by the committee; keep the row for the record.
            for (const id of existing.keys()) {
                if (!kept.has(id)) await dbRun("UPDATE demand_items SET is_removed = 1, removal_reason = 'Removed in vetting' WHERE id = ?", [id]);
            }

            // Update the demand's estimated cost
            const totalCost = items.reduce((sum, item) => sum + (Number(item.estimated_cost) * Number(item.quantity)), 0);
            await dbRun(
                'UPDATE demands SET estimated_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [totalCost, demandId]
            );

            res.json({ message: 'Tender items updated successfully' });
        }

    } catch (error) {
        console.error('Error updating tender items:', error);
        res.status(500).json({ message: 'Failed to update tender items' });
    }
};

// Get vetting committee members
const getVettingCommitteeMembers = async (req, res) => {
    try {
        const members = await dbAll(`SELECT u.id, u.name, u.designation, u.username, u.created_at
         FROM users u
         JOIN committees c ON u.committee_id = c.id
         WHERE c.name = 'Vetting Committee'
         ORDER BY u.name`, []);

        res.json(members);
    } catch (error) {
        console.error('Error fetching vetting committee members:', error);
        res.status(500).json({ message: 'Failed to fetch committee members' });
    }
};

module.exports = {
    getPendingTenders,
    getAllVettingTenders,
    getTenderForVetting,
    submitTenderVettingEvaluation,
    updateTenderItems,
    getVettingCommitteeMembers
};
const { dbAll, dbGet, dbRun } = require('../db');
const { parseInstant } = require('../utils/time');
const fs = require('fs');
const path = require('path');

const MIN_BIDDING_LEAD_MS = 2 * 60 * 1000;

// A bidding end time must be a real future date at least 2 minutes out -
// otherwise suppliers effectively get no window to respond.
const isBiddingEndTimeTooSoon = (date) => date.getTime() < Date.now() + MIN_BIDDING_LEAD_MS;

// Get demands for purchase department
const getPurchaseDemands = async (req, res) => {

    try {
        const demands = await dbAll(
            `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department,
                    sr.name as store_response_by_name
             FROM demands d
             LEFT JOIN users u ON d.created_by = u.id
             LEFT JOIN departments dept ON u.department_id = dept.id
             LEFT JOIN users sr ON d.store_response_by = sr.id
             LEFT JOIN demand_tenders dt ON d.id = dt.demand_id
             WHERE d.status = 'purchase_pending'
             AND d.purchase_response_by IS NULL
             AND dt.demand_id IS NULL
             ORDER BY d.created_at DESC`,
            []
        );

        // Get items for each demand
        for (const demand of demands) {
            const items = await dbAll(`SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id`, [demand.id]);
            demand.items = items;
        }

        res.json(demands);
    } catch (error) {
        console.error('Error fetching purchase demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Evaluate demand by purchase department
const evaluateDemandPurchase = async (req, res) => {
    const { id } = req.params;
    const { action, remarks, biddingEndTime } = req.body;
    const user = req.user;

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    if (action === 'approve' && !biddingEndTime) {
        return res.status(400).json({ message: 'Bidding end time is required for approval' });
    }

    // A zone-less value from a datetime-local box is Pakistan time (see utils/time).
    let biddingEndDate = null;
    if (action === 'approve') {
        biddingEndDate = parseInstant(biddingEndTime);
        if (!biddingEndDate) {
            return res.status(400).json({ message: 'Invalid bidding end time' });
        }
        if (isBiddingEndTimeTooSoon(biddingEndDate)) {
            return res.status(400).json({ message: 'Bidding end time must be at least 2 minutes from now' });
        }
    }

    try {
        {
            // For approved demands: status changes to tender_created (when tender is auto-created)
            // For rejected demands: status changes to purchase_rejected
            const newStatus = action === 'approve' ? 'tender_created' : 'purchase_rejected';
            
            // Update the demand with new status and record who evaluated it
            await dbRun(`UPDATE demands SET 
             status = ?, 
             purchase_rejection_reason = ?,
             purchase_response = ?, 
             purchase_response_by = ?,
             purchase_response_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`, [newStatus, action === 'reject' ? remarks : null, remarks, user.id, id]);

            // If approved, create a tender automatically
            if (action === 'approve') {
                await dbRun(
                    `INSERT INTO demand_tenders (demand_id, bidding_end_time, tender_status, created_by)
                     VALUES (?, ?, 'active', ?)`,
                    [id, biddingEndDate, user.id]
                ).then(result => ({
                    id: result.lastID
                }));
            }

            res.json({
                message: `Demand ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
                status: newStatus,
                createdTender: action === 'approve'
            });
        }
    } catch (error) {
        console.error('Error evaluating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Approve demand (for purchase department)
const approveDemand = async (req, res) => {
    const { id } = req.params;
    const { expiryDate } = req.body;
    const user = req.user;

    if (!expiryDate) {
        return res.status(400).json({ message: 'Bidding expiry date is required for approval' });
    }

    const expiryDateParsed = parseInstant(expiryDate);
    if (!expiryDateParsed) {
        return res.status(400).json({ message: 'Invalid bidding expiry date' });
    }
    if (isBiddingEndTimeTooSoon(expiryDateParsed)) {
        return res.status(400).json({ message: 'Bidding expiry date must be at least 2 minutes from now' });
    }

    // Validate required files
    if (!req.files || !req.files.tenderDocument || !req.files.itemsList) {
        return res.status(400).json({ message: 'Both tender document (PDF) and items list (Excel/CSV) are required' });
    }

    // Check if tender-documents directory exists, create if it doesn't
    const tenderDocsDir = path.join(__dirname, '../../tender-documents');
    if (!fs.existsSync(tenderDocsDir)) {
        fs.mkdirSync(tenderDocsDir, { recursive: true });
    }

    const tenderDocPath = req.files.tenderDocument[0].path;
    const itemsListPath = req.files.itemsList[0].path;

    try {
        {
            // Update the demand with approved status and indicate tender creation
            await dbRun(`UPDATE demands SET 
             status = 'tender_created', 
             purchase_response = 'Approved by purchase department - Tender created and sent to Purchase HOD for approval',
             purchase_response_by = ?,
             purchase_response_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`, [user.id, id]);

            // Create a tender automatically with file paths - send to Purchase HOD for approval first
            await dbRun(
                `INSERT INTO demand_tenders (demand_id, bidding_end_time, tender_status, created_by, tender_document_path, items_list_path)
                 VALUES (?, ?, 'pending_purchase_hod_approval', ?, ?, ?)`,
                [id, expiryDateParsed, user.id, tenderDocPath, itemsListPath]
            ).then(result => ({
                id: result.lastID
            }));

            res.json({
                message: 'Demand approved and tender sent to Purchase HOD for approval',
                status: 'tender_created',
                createdTender: true,
                pendingHodApproval: true
            });
        }
    } catch (error) {
        console.error('Error approving demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get tenders with vetting status for purchase department
const getTendersWithVettingStatus = async (req, res) => {

    try {
        const tenders = await dbAll(
            `SELECT dt.*, d.item_name, d.description as demand_description, d.estimated_cost,
                    u.name as created_by_name, dept.name as created_by_department
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             JOIN users u ON dt.created_by = u.id
             LEFT JOIN departments dept ON u.department_id = dept.id
             WHERE dt.tender_status IN ('pending_vetting', 'vetting_approved', 'vetting_rejected', 'pending_finance_ms_approval')
             ORDER BY dt.created_at DESC`,
            []
        );

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching tenders with vetting status:', error);
        res.status(500).json({ message: 'Failed to fetch tenders' });
    }
};

// Publish approved tender (only for purchase department)
const publishApprovedTender = async (req, res) => {
    const { tenderId } = req.params;
    const user = req.user;

    try {
        // Check if tender is approved by vetting committee
        const tender = await dbGet(
            'SELECT id, tender_status FROM demand_tenders WHERE id = ? AND tender_status = ?',
            [tenderId, 'vetting_approved']
        );

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not approved by vetting committee' });
        }

        // Update tender status to active
        await dbRun(
            'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
            ['active', tenderId]
        );

        // Add status history
        await dbRun(
            `INSERT INTO tender_status_history (tender_id, status, comments, changed_by)
             VALUES (?, ?, ?, ?)`,
            [tenderId, 'published', 'Tender published by purchase department after vetting approval', user.id]
        );

        res.json({ message: 'Tender published successfully' });
    } catch (error) {
        console.error('Error publishing tender:', error);
        res.status(500).json({ message: 'Failed to publish tender' });
    }
};

const submitTenderForFinanceApproval = async (req, res) => {
    const { tenderId } = req.params;
    const user = req.user;

    try {
        // Check if tender is approved by vetting committee
        const tender = await dbGet(
            'SELECT id, tender_status FROM demand_tenders WHERE id = ? AND tender_status = ?',
            [tenderId, 'vetting_approved']
        );

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not approved by vetting committee' });
        }

        // Update tender status to pending Finance and MS approval
        await dbRun(
            'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
            ['pending_finance_ms_approval', tenderId]
        );

        // Add status history
        await dbRun(
            `INSERT INTO tender_status_history (tender_id, status, comments, changed_by)
             VALUES (?, ?, ?, ?)`,
            [tenderId, 'pending_finance_ms_approval', 'Tender submitted for Finance and MS HOD approval after vetting committee approval', user.id]
        );

        res.json({ message: 'Tender submitted for Finance & MS approvals successfully' });
    } catch (error) {
        console.error('Error submitting tender for approval:', error);
        res.status(500).json({ message: 'Failed to submit tender for approval' });
    }
};

// Get manageable tenders (tenders that have been approved by HOD and are active)
const getManagableTenders = async (req, res) => {

    try {
        const tenders = await dbAll(`SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost,
                u.name as created_by_name, dept.name as creator_department,
                fu.name as finance_hod_response_by_name,
                mu.name as ms_hod_response_by_name,
                eu.name as extension_by_name,
                CASE
                    WHEN dt.bidding_end_time > ? THEN 'active'
                    ELSE 'expired'
                END as tender_time_status
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         LEFT JOIN users fu ON dt.finance_hod_response_by = fu.id
         LEFT JOIN users mu ON dt.ms_hod_response_by = mu.id
         LEFT JOIN users eu ON dt.time_extension_by = eu.id
         WHERE dt.tender_status IN ('pending_purchase_hod_approval', 'pending_vetting', 'vetting_approved',
             'pending_finance_ms_approval', 'pending_purchase_hod_publishing', 'published', 'active', 'pending_opening')
         ORDER BY dt.created_at DESC`, [new Date()]);

        res.json({ tenders });
    } catch (error) {
        console.error('💥 Error fetching manageable tenders:', error);
        res.status(500).json({ message: 'Failed to fetch manageable tenders' });
    }
};

// Update tender bidding time
const updateTenderTime = async (req, res) => {
    const { tenderId } = req.params;
    const { newBiddingEndTime, reason } = req.body;
    const user = req.user;

    if (!newBiddingEndTime || !reason) {
        return res.status(400).json({ message: 'New bidding end time and reason are required' });
    }

    try {
        // Validate that the new time is a real date at least 2 minutes out
        const newTime = parseInstant(newBiddingEndTime);
        if (!newTime) {
            return res.status(400).json({ message: 'Invalid bidding end time' });
        }
        if (isBiddingEndTimeTooSoon(newTime)) {
            return res.status(400).json({ message: 'New bidding end time must be at least 2 minutes from now' });
        }

        // Get current tender details
        const tender = await dbGet('SELECT * FROM demand_tenders WHERE id = ?', [tenderId]);

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found' });
        }
        // Only while bidding is open, or closed but the bids are not opened yet.
        if (!['active', 'pending_opening'].includes(tender.tender_status) || tender.opened_at) {
            return res.status(409).json({ message: 'Bidding time can no longer be changed for this tender' });
        }

        // Update the tender with new bidding end time. A closed tender reopens for bids.
        // (The old code stored the raw text here, read back hours off on SQL Server.)
        await dbRun(`UPDATE demand_tenders 
         SET bidding_end_time = ?, 
             time_extension_reason = ?,
             time_extension_by = ?,
             time_extension_at = CURRENT_TIMESTAMP,
             tender_status = 'active'
         WHERE id = ?`, [newTime, reason, user.id, tenderId]);

        res.json({ message: 'Bidding time updated', newBiddingEndTime: newTime.toISOString(), reason });
    } catch (error) {
        console.error('Error updating tender time:', error);
        res.status(500).json({ message: 'Failed to update tender time' });
    }
};

module.exports = {
    getPurchaseDemands,
    evaluateDemandPurchase,
    approveDemand,
    getTendersWithVettingStatus,
    publishApprovedTender,
    submitTenderForFinanceApproval,
    getManagableTenders,
    updateTenderTime
};
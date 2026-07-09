const { getDatabase } = require('../config/database');
const fs = require('fs');
const path = require('path');

// Get demands for purchase department
const getPurchaseDemands = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view purchase demands' });
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
                 LEFT JOIN demand_tenders dt ON d.id = dt.demand_id
                 WHERE d.status = 'purchase_pending'
                 AND d.purchase_response_by IS NULL
                 AND dt.demand_id IS NULL
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
        console.error('Error fetching purchase demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Evaluate demand by purchase department
const evaluateDemandPurchase = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { action, remarks, biddingEndTime } = req.body;
    const user = req.user;

    // Check if user is from purchase department
    const canEvaluate = user.role === 'superadmin' || 
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canEvaluate) {
        return res.status(403).json({ message: 'Only purchase department members can evaluate demands' });
    }

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    if (action === 'approve' && !biddingEndTime) {
        return res.status(400).json({ message: 'Bidding end time is required for approval' });
    }

    // Parse into a real Date so the driver binds it as a proper SQL datetime
    // parameter instead of a raw string - MSSQL's implicit string->datetime
    // conversion can reject valid-looking ISO strings.
    let biddingEndDate = null;
    if (action === 'approve') {
        biddingEndDate = new Date(biddingEndTime);
        if (isNaN(biddingEndDate.getTime())) {
            return res.status(400).json({ message: 'Invalid bidding end time' });
        }
    }

    try {
        {
            // For approved demands: status changes to tender_created (when tender is auto-created)
            // For rejected demands: status changes to purchase_rejected
            const newStatus = action === 'approve' ? 'tender_created' : 'purchase_rejected';
            
            // Update the demand with new status and record who evaluated it
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     status = ?, 
                     purchase_rejection_reason = ?,
                     purchase_response = ?, 
                     purchase_response_by = ?,
                     purchase_response_date = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [newStatus, action === 'reject' ? remarks : null, remarks, user.id, id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // If approved, create a tender automatically
            if (action === 'approve') {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO demand_tenders (demand_id, bidding_end_time, tender_status, created_by)
                         VALUES (?, ?, 'active', ?)`,
                        [id, biddingEndDate, user.id],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID });
                        }
                    );
                });
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
    const db = getDatabase();
    const { id } = req.params;
    const { expiryDate } = req.body;
    const user = req.user;

    // Check if user is from purchase department
    const canApprove = user.role === 'superadmin' || 
                      (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canApprove) {
        return res.status(403).json({ message: 'Only purchase department members can approve demands' });
    }

    if (!expiryDate) {
        return res.status(400).json({ message: 'Bidding expiry date is required for approval' });
    }

    // Parse into a real Date so the driver binds it as a proper SQL datetime
    // parameter instead of a raw string - MSSQL's implicit string->datetime
    // conversion can reject valid-looking ISO strings.
    const expiryDateParsed = new Date(expiryDate);
    if (isNaN(expiryDateParsed.getTime())) {
        return res.status(400).json({ message: 'Invalid bidding expiry date' });
    }

    // Validate required files
    if (!req.files || !req.files.tenderDocument || !req.files.itemsList) {
        return res.status(400).json({ message: 'Both tender document (PDF) and items list (Excel/CSV) are required' });
    }

    // Check if tender-documents directory exists, create if it doesn't
    const tenderDocsDir = path.join(__dirname, '../../tender-documents');
    if (!fs.existsSync(tenderDocsDir)) {
        fs.mkdirSync(tenderDocsDir, { recursive: true });
        console.log('Created tender-documents directory:', tenderDocsDir);
    }

    const tenderDocPath = req.files.tenderDocument[0].path;
    const itemsListPath = req.files.itemsList[0].path;

    try {
        {
            // Update the demand with approved status and indicate tender creation
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     status = 'tender_created', 
                     purchase_response = 'Approved by purchase department - Tender created and sent to Purchase HOD for approval',
                     purchase_response_by = ?,
                     purchase_response_date = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [user.id, id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Create a tender automatically with file paths - send to Purchase HOD for approval first
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO demand_tenders (demand_id, bidding_end_time, tender_status, created_by, tender_document_path, items_list_path)
                     VALUES (?, ?, 'pending_purchase_hod_approval', ?, ?, ?)`,
                    [id, expiryDateParsed, user.id, tenderDocPath, itemsListPath],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID });
                    }
                );
            });

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

// Set expiry for tender (placeholder)
const setExpiryForTender = async (req, res) => {
    try {
        // Placeholder for setting tender expiry
        res.json({ message: 'Tender expiry set' });
    } catch (error) {
        console.error('Error setting tender expiry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get supply orders
const getSupplyOrders = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department or superadmin
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view supply orders' });
    }

    try {
        // Get all supply orders with related information
        const supplyOrders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    so.id as order_id,
                    so.order_number,
                    so.quantity as fulfilled_quantity,
                    so.unit_price,
                    so.total_amount,
                    so.delivery_date,
                    so.order_status,
                    so.created_at as order_date,
                    dt.id as tender_id,
                    dt.demand_id,
                    d.item_name,
                    d.description,
                    d.quantity as original_quantity,
                    d.urgency,
                    COALESCE(sbp.business_name, s.username) as supplier_name,
                    s.business_email as supplier_email,
                    sb.delivery_days
                FROM supply_orders so
                JOIN demand_tenders dt ON so.tender_id = dt.id
                JOIN demands d ON so.demand_id = d.id
                JOIN suppliers s ON so.supplier_id = s.id
                LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                JOIN supplier_bids sb ON so.bid_id = sb.id
                ORDER BY so.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Group orders by tender to match frontend structure
        const groupedOrders = {};
        
        supplyOrders.forEach(order => {
            if (!groupedOrders[order.tender_id]) {
                groupedOrders[order.tender_id] = {
                    tender_id: order.tender_id,
                    demand_id: order.demand_id,
                    item_name: order.item_name,
                    description: order.description,
                    total_quantity: order.original_quantity,
                    total_fulfilled_quantity: 0,
                    total_cost: 0,
                    fulfillment_percentage: 0,
                    orders: []
                };
            }

            // Add individual order details
            groupedOrders[order.tender_id].orders.push({
                id: order.order_id,
                order_number: order.order_number,
                supplier_name: order.supplier_name,
                supplier_email: order.supplier_email,
                quantity: order.fulfilled_quantity,
                unit_price: order.unit_price,
                total_cost: order.total_amount,
                expected_delivery_date: order.delivery_date,
                status: order.order_status,
                order_date: order.order_date,
                delivery_days: order.delivery_days
            });

            // Update totals
            groupedOrders[order.tender_id].total_fulfilled_quantity += order.fulfilled_quantity;
            groupedOrders[order.tender_id].total_cost += order.total_amount;
        });

        // Calculate fulfillment percentage for each tender
        Object.values(groupedOrders).forEach(tender => {
            tender.fulfillment_percentage = Math.round(
                (tender.total_fulfilled_quantity / tender.total_quantity) * 100
            );
        });

        // Convert to array format expected by frontend
        const result = Object.values(groupedOrders);

        console.log(`Fetched ${result.length} supply order groups containing ${supplyOrders.length} individual orders`);
        res.json(result);
    } catch (error) {
        console.error('Error fetching supply orders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get tenders with vetting status for purchase department
const getTendersWithVettingStatus = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view tenders' });
    }

    try {
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description as demand_description, d.estimated_cost,
                        u.name as created_by_name, dept.name as created_by_department
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE dt.tender_status IN ('pending_vetting', 'vetting_approved', 'vetting_rejected', 'pending_finance_ms_approval')
                 ORDER BY dt.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching tenders with vetting status:', error);
        res.status(500).json({ message: 'Failed to fetch tenders', error: error.message });
    }
};

// Publish approved tender (only for purchase department)
const publishApprovedTender = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canPublish = user.role === 'superadmin' || 
                      (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canPublish) {
        return res.status(403).json({ message: 'Only purchase department can publish tenders' });
    }
    
    try {
        // Check if tender is approved by vetting committee
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, tender_status FROM demand_tenders WHERE id = ? AND tender_status = ?',
                [tenderId, 'vetting_approved'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not approved by vetting committee' });
        }

        // Update tender status to active
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                ['active', tenderId],
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
                [tenderId, 'published', 'Tender published by purchase department after vetting approval', user.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Tender published successfully' });
    } catch (error) {
        console.error('Error publishing tender:', error);
        res.status(500).json({ message: 'Failed to publish tender', error: error.message });
    }
};

const submitTenderForFinanceApproval = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canSubmit = user.role === 'superadmin' || 
                     (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canSubmit) {
        return res.status(403).json({ message: 'Only purchase department can submit tenders for approval' });
    }
    
    try {
        // Check if tender is approved by vetting committee
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, tender_status FROM demand_tenders WHERE id = ? AND tender_status = ?',
                [tenderId, 'vetting_approved'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not approved by vetting committee' });
        }

        // Update tender status to pending Finance and MS approval
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                ['pending_finance_ms_approval', tenderId],
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
                [tenderId, 'pending_finance_ms_approval', 'Tender submitted for Finance and MS HOD approval after vetting committee approval', user.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Tender submitted for Finance & MS approvals successfully' });
    } catch (error) {
        console.error('Error submitting tender for approval:', error);
        res.status(500).json({ message: 'Failed to submit tender for approval', error: error.message });
    }
};

// Get manageable tenders (tenders that have been approved by HOD and are active)
const getManagableTenders = async (req, res) => {
    console.log('🔍 getManagableTenders called by user:', req.user);
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        console.log('❌ Access denied for user:', user.name, 'Department:', user.department_name);
        return res.status(403).json({ message: 'You do not have permission to view manageable tenders' });
    }

    console.log('✅ Access granted for user:', user.name, 'Department:', user.department_name);

    try {
        console.log('📊 Executing manageable tenders query...');
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost,
                        u.name as created_by_name, dept.name as creator_department,
                        fu.name as finance_hod_response_by_name,
                        mu.name as ms_hod_response_by_name,
                        eu.name as extension_by_name,
                        CASE 
                            WHEN dt.bidding_end_time > datetime('now') THEN 'active'
                            WHEN dt.bidding_end_time <= datetime('now') THEN 'expired'
                        END as tender_time_status
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users fu ON dt.finance_hod_response_by = fu.id
                 LEFT JOIN users mu ON dt.ms_hod_response_by = mu.id
                 LEFT JOIN users eu ON dt.time_extension_by = eu.id
                 WHERE d.hod_status = 'approved'
                 AND (dt.finance_hod_status = 'pending' OR dt.ms_hod_status = 'pending' OR dt.tender_status IN ('published', 'active'))
                 ORDER BY dt.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Database query error:', err);
                        reject(err);
                    } else {
                        console.log('✅ Query executed successfully. Found', rows.length, 'tenders');
                        console.log('📋 Tender details:', rows.map(r => ({
                            id: r.id,
                            tender_number: r.tender_number,
                            item_name: r.item_name,
                            tender_status: r.tender_status,
                            finance_hod_status: r.finance_hod_status,
                            ms_hod_status: r.ms_hod_status,
                            hod_status: r.hod_status
                        })));
                        resolve(rows);
                    }
                }
            );
        });

        console.log('📤 Sending response with', tenders.length, 'tenders');
        res.json({ tenders });
    } catch (error) {
        console.error('💥 Error fetching manageable tenders:', error);
        res.status(500).json({ message: 'Failed to fetch manageable tenders' });
    }
};

// Update tender bidding time
const updateTenderTime = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { newBiddingEndTime, reason } = req.body;
    const user = req.user;

    // Check if user is from purchase department
    const canUpdate = user.role === 'superadmin' || 
                     (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canUpdate) {
        return res.status(403).json({ message: 'You do not have permission to update tender time' });
    }

    if (!newBiddingEndTime || !reason) {
        return res.status(400).json({ message: 'New bidding end time and reason are required' });
    }

    try {
        // Validate that the new time is in the future
        const newTime = new Date(newBiddingEndTime);
        const currentTime = new Date();
        
        if (newTime <= currentTime) {
            return res.status(400).json({ message: 'New bidding end time must be in the future' });
        }

        // Get current tender details
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_tenders WHERE id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found' });
        }

        // Update the tender with new bidding end time
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demand_tenders 
                 SET bidding_end_time = ?, 
                     time_extension_reason = ?,
                     time_extension_by = ?,
                     time_extension_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newBiddingEndTime, reason, user.id, tenderId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ 
            message: 'Tender bidding time updated successfully',
            newBiddingEndTime,
            reason
        });
    } catch (error) {
        console.error('Error updating tender time:', error);
        res.status(500).json({ message: 'Failed to update tender time' });
    }
};

module.exports = {
    getPurchaseDemands,
    evaluateDemandPurchase,
    approveDemand,
    setExpiryForTender,
    getSupplyOrders,
    getTendersWithVettingStatus,
    publishApprovedTender,
    submitTenderForFinanceApproval,
    getManagableTenders,
    updateTenderTime
};
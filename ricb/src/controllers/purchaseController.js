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
                 WHERE d.status IN ('purchase_pending', 'available') 
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

    try {
        // Start transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
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
                        [id, biddingEndTime, user.id],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID });
                        }
                    );
                });
            }

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({ 
                message: `Demand ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
                status: newStatus,
                createdTender: action === 'approve'
            });
        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
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
        // Start transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Update the demand with approved status and indicate tender creation
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     status = 'tender_created', 
                     purchase_response = 'Approved by purchase department - Tender created',
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

            // Create a tender automatically with file paths
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO demand_tenders (demand_id, bidding_end_time, tender_status, created_by, tender_document_path, items_list_path)
                     VALUES (?, ?, 'active', ?, ?, ?)`,
                    [id, expiryDate, user.id, tenderDocPath, itemsListPath],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID });
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

            res.json({ 
                message: 'Demand approved successfully',
                status: 'tender_created',
                createdTender: true
            });
        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
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
                 WHERE dt.tender_status IN ('pending_vetting', 'vetting_approved', 'vetting_rejected')
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

module.exports = {
    getPurchaseDemands,
    evaluateDemandPurchase,
    approveDemand,
    setExpiryForTender,
    getSupplyOrders,
    getTendersWithVettingStatus,
    publishApprovedTender
};
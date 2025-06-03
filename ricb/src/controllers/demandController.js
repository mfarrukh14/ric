const { getDatabase } = require('../config/database');
const pdfService = require('../utils/pdfService');
const EmailService = require('../utils/emailService');

// Initialize email service
const emailService = new EmailService();

// Create a new demand with multiple items
const createDemand = async (req, res) => {
    const db = getDatabase();
    const { description, urgency, requiredBy, items } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!description || !requiredBy || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Description, required date and at least one item are required' });
    }

    // Validate each item
    for (const item of items) {
        if (!item.itemName || !item.quantity || !item.estimatedCost) {
            return res.status(400).json({ message: 'Each item must have name, quantity and estimated cost' });
        }
        if (item.quantity <= 0 || item.estimatedCost <= 0) {
            return res.status(400).json({ message: 'Quantity and estimated cost must be positive numbers' });
        }
    }

    // Validate user is eligible for demand creation
    if (!req.user.eligible_for_demand_creation) {
        return res.status(403).json({ message: 'You are not eligible to create demands' });
    }

    try {
        // Calculate total estimated cost
        const totalEstimatedCost = items.reduce((sum, item) => sum + parseFloat(item.estimatedCost), 0);
        
        // Create main demand record (using first item as primary for backward compatibility)
        const firstItem = items[0];
        const demandResult = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demands (item_name, quantity, estimated_cost, description, urgency, required_by, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [firstItem.itemName, firstItem.quantity, totalEstimatedCost, description, urgency || 'normal', requiredBy, userId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

        const demandId = demandResult.id;

        // Insert all items into demand_items table
        for (const item of items) {
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO demand_items (demand_id, item_name, quantity, estimated_cost, unit, remarks)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [demandId, item.itemName, item.quantity, item.estimatedCost, item.unit || 'pieces', item.remarks || null],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        res.status(201).json({
            message: 'Demand created successfully',
            demandId: demandId,
            itemsCount: items.length
        });
    } catch (error) {
        console.error('Error creating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demands for the current user with items
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

// Update demand items status with partial quantities (for store department)
const updateDemandItemsStatus = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { itemUpdates, response } = req.body;
    const user = req.user;

    // Check if user is from store department
    const canUpdate = user.department_name && user.department_name.toLowerCase() === 'store';

    if (!canUpdate) {
        return res.status(403).json({ message: 'Only Store department users can update demand status' });
    }

    // Validate itemUpdates
    if (!itemUpdates || !Array.isArray(itemUpdates) || itemUpdates.length === 0) {
        return res.status(400).json({ message: 'Item updates are required' });
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

        // Get demand items
        const demandItems = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM demand_items WHERE demand_id = ?',
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Update each item
        for (const update of itemUpdates) {
            const { itemId, availableQuantity, status } = update;
            
            // Validate status
            if (!['available', 'partial', 'not_available'].includes(status)) {
                return res.status(400).json({ message: 'Invalid item status' });
            }

            // Validate available quantity
            if (status === 'partial' && (!availableQuantity || availableQuantity <= 0)) {
                return res.status(400).json({ message: 'Available quantity required for partial status' });
            }

            // Update demand item
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demand_items SET 
                     store_available_quantity = ?, 
                     store_status = ?
                     WHERE id = ? AND demand_id = ?`,
                    [availableQuantity || 0, status, itemId, id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        // Check if any items need to go to vetting (partial or not_available)
        const itemsNeedingVetting = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM demand_items 
                 WHERE demand_id = ? AND store_status IN ('partial', 'not_available')`,
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        let newDemandStatus = 'available';
        if (itemsNeedingVetting.length > 0) {
            newDemandStatus = 'vetting';
        }

        // Update main demand status
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands SET 
                 status = ?, 
                 store_response = ?, 
                 store_response_at = CURRENT_TIMESTAMP,
                 store_response_by = ?,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newDemandStatus, response || null, user.id, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ 
            message: 'Demand items status updated successfully',
            status: newDemandStatus,
            itemsToVetting: itemsNeedingVetting.length
        });
    } catch (error) {
        console.error('Error updating demand items status:', error);
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

// Get demand with items
const getDemandWithItems = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();

    try {
        // Get the demand
        const demand = await new Promise((resolve, reject) => {
            db.get(
                `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
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

        // Get items for the demand
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id`,
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        demand.items = items;
        res.json(demand);
    } catch (error) {
        console.error('Error fetching demand with items:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update item statuses and handle fulfillment logic
const updateItemStatuses = async (req, res) => {
    const db = getDatabase();
    
    try {
        const { id } = req.params;
        const { itemUpdates, response } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!itemUpdates || !Array.isArray(itemUpdates) || !response) {
            return res.status(400).json({ message: 'Item updates and response are required' });
        }

        // Start transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Update each item's store status
            for (const update of itemUpdates) {
                const updateItemQuery = `
                    UPDATE demand_items 
                    SET store_status = ?, 
                        store_available_quantity = ?, 
                        remarks = ?,
                        store_response_at = datetime('now'),
                        store_response_by = ?
                    WHERE id = ? AND demand_id = ?
                `;
                
                await new Promise((resolve, reject) => {
                    db.run(updateItemQuery, [
                        update.status,
                        update.availableQuantity,
                        update.remarks || null,
                        userId,
                        update.itemId,
                        id
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                // If partially fulfilled, create new item for remaining quantity
                if (update.status === 'partial' && update.availableQuantity < update.requestedQuantity) {
                    const remainingQty = update.requestedQuantity - update.availableQuantity;
                    
                    // Get original item details
                    const originalItem = await new Promise((resolve, reject) => {
                        db.get('SELECT * FROM demand_items WHERE id = ?', [update.itemId], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });

                    // Create new item for remaining quantity
                    const insertItemQuery = `
                        INSERT INTO demand_items (
                            demand_id, item_name, quantity, estimated_cost, unit
                        ) VALUES (?, ?, ?, ?, ?)
                    `;
                    
                    const remainingCost = (parseFloat(originalItem.estimated_cost) / originalItem.quantity) * remainingQty;
                    
                    await new Promise((resolve, reject) => {
                        db.run(insertItemQuery, [
                            id,
                            originalItem.item_name,
                            remainingQty,
                            remainingCost.toFixed(2),
                            originalItem.unit
                        ], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Update original item quantity to available quantity
                    await new Promise((resolve, reject) => {
                        db.run('UPDATE demand_items SET quantity = ? WHERE id = ?', [
                            update.availableQuantity,
                            update.itemId
                        ], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }
            }

            // Determine overall demand status
            let demandStatus = 'available'; // Default to available
            
            // Check if any items are not fully available
            const hasPartialOrUnavailable = itemUpdates.some(item => 
                item.status === 'partial' || item.status === 'not_available'
            );
            
            if (hasPartialOrUnavailable) {
                demandStatus = 'vetting_pending';
            }

            // Update demand status and store response
            const updateDemandQuery = `
                UPDATE demands 
                SET status = ?, 
                    store_response = ?, 
                    store_response_by = ?, 
                    store_response_at = datetime('now')
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(updateDemandQuery, [demandStatus, response, userId, id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({ 
                message: 'Fulfillment updated successfully', 
                status: demandStatus,
                redirectsToVetting: demandStatus === 'vetting_pending'
            });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Update item statuses error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all demands with their items for store management
const getAllDemandsWithItems = async (req, res) => {
    const db = getDatabase();

    try {
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as created_by_name, sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 WHERE d.status IN ('pending', 'store_pending', 'available', 'not_available', 'vetting_pending', 'vetting_approved', 'purchase_pending')
                 ORDER BY d.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get items for each demand
        for (let demand of demands) {
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id ASC`,
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
        console.error('Get all demands with items error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

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
                 WHERE d.status = 'vetting_approved' AND d.purchase_response_by IS NULL
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
    }    try {
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
            // For approved demands: status changes to purchase_approved 
            // For rejected demands: status changes to purchase_rejected
            const newStatus = action === 'approve' ? 'purchase_approved' : 'purchase_rejected';
            
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

// Process expired tenders
const processExpiredTenders = async (req, res) => {
    const db = getDatabase();
    let processedCount = 0;
      try {
        console.log('Starting to process expired tenders...');
        
        // First, let's log the current time for debugging
        const currentTime = new Date().toLocaleString('en-US', { 
            timeZone: 'Asia/Karachi',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        console.log(`Current Pakistan time: ${currentTime}`);
          // Get all expired tenders that haven't been processed yet
        // Convert current time to Pakistan timezone and compare with bidding_end_time
        const expiredTenders = await new Promise((resolve, reject) => {
            console.log('Executing query to find expired tenders...');
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE datetime(dt.bidding_end_time) <= datetime('now', 'localtime') 
                 AND dt.tender_status = 'active'
                 ORDER BY dt.bidding_end_time ASC`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('Query error:', err);
                        reject(err);
                    } else {
                        console.log('Query executed successfully. Raw rows:', rows);
                        resolve(rows);
                    }
                }
            );
        });

        console.log(`Found ${expiredTenders.length} expired tenders to process`);

        for (const tender of expiredTenders) {
            try {
                console.log(`Processing tender ${tender.id} for demand ${tender.demand_id}`);
                
                // Begin transaction for this tender
                await new Promise((resolve, reject) => {
                    db.run('BEGIN TRANSACTION', (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                // Get all bids for this tender, ordered by cost (lowest first)
                const bids = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT sb.*, s.company_name, s.company_email
                         FROM supplier_bids sb
                         JOIN suppliers s ON sb.supplier_id = s.id
                         WHERE sb.tender_id = ? AND s.status = 'approved'
                         ORDER BY sb.total_cost ASC, sb.created_at ASC`,
                        [tender.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        }
                    );
                });

                console.log(`Found ${bids.length} bids for tender ${tender.id}`);

                if (bids.length === 0) {
                    // No bids received, mark tender as closed
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE demand_tenders SET tender_status = ?, awarded_at = CURRENT_TIMESTAMP WHERE id = ?',
                            ['closed_no_bids', tender.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    
                    console.log(`Tender ${tender.id} closed - no bids received`);
                } else {
                    // Award to the lowest bidder
                    const winningBid = bids[0];
                    
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE demand_tenders SET 
                             tender_status = 'awarded', 
                             awarded_supplier_id = ?, 
                             awarded_bid_amount = ?,
                             awarded_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [winningBid.supplier_id, winningBid.total_cost, tender.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });                    // Create supply order
                    const orderNumber = `SO-${Date.now()}-${tender.id}`;
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO supply_orders (
                                order_number, demand_id, supplier_id, tender_id, bid_id,
                                item_name, quantity, unit_price, total_amount, delivery_date, order_status
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '+' || ? || ' days'), 'pending')`,
                            [
                                orderNumber,
                                tender.demand_id,
                                winningBid.supplier_id, 
                                tender.id,
                                winningBid.id,
                                tender.item_name,
                                winningBid.proposed_quantity,
                                (winningBid.total_cost / winningBid.proposed_quantity),
                                winningBid.total_cost,
                                winningBid.delivery_days
                            ],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    console.log(`Tender ${tender.id} awarded to supplier ${winningBid.supplier_id} (${winningBid.company_name}) for $${winningBid.total_cost}`);
                    
                    // Generate PDF and send email notification
                    try {                        // Prepare order data for PDF and email with defensive programming
                        const orderData = {
                            tender_id: tender.id,
                            demand_id: tender.demand_id,
                            item_name: tender.item_name || 'N/A',
                            description: tender.description || 'No description',
                            quantity: winningBid.proposed_quantity || 0,
                            awarded_bid_amount: winningBid.total_cost || 0,
                            delivery_time_days: winningBid.delivery_days || 0,
                            urgency: tender.urgency || 'normal',
                            company_name: winningBid.company_name || 'N/A',
                            company_email: winningBid.company_email || '',
                            bid_comments: winningBid.comments || ''
                        };

                        // Generate supply order PDF
                        console.log(`Generating PDF for tender ${tender.id}...`);
                        const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
                        
                        // Send email with PDF attachment to supplier
                        console.log(`Sending email to ${winningBid.company_email}...`);
                        await emailService.sendSupplyOrderEmail(
                            winningBid.company_email,
                            winningBid.company_name,
                            orderData,
                            pdfBuffer
                        );
                        
                        console.log(`PDF generated and email sent successfully for tender ${tender.id}`);
                    } catch (emailError) {
                        console.error(`Failed to send PDF/email for tender ${tender.id}:`, emailError);
                        // Don't fail the entire process if email fails
                    }
                }

                // Commit transaction
                await new Promise((resolve, reject) => {
                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                processedCount++;

            } catch (error) {
                // Rollback transaction on error
                await new Promise((resolve) => {
                    db.run('ROLLBACK', () => resolve());
                });
                console.error(`Error processing tender ${tender.id}:`, error);
                // Continue with next tender
            }
        }

        console.log(`Successfully processed ${processedCount} expired tenders`);

        // If called from scheduler (no res object), just return count
        if (!res) {
            return processedCount;
        }
        
        // If called as HTTP endpoint, return JSON response
        res.json({ 
            message: 'Expired tenders processed successfully', 
            processedCount: processedCount 
        });
        
    } catch (error) {
        console.error('Error processing expired tenders:', error);
        if (res) {
            res.status(500).json({ message: 'Internal server error' });
        } else {
            throw error;
        }
    }
};

// Get awarded tenders (placeholder)
const getAwardedTenders = async (req, res) => {
    try {
        // Placeholder for awarded tenders
        res.json([]);
    } catch (error) {
        console.error('Error fetching awarded tenders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate supply order PDF (placeholder)
const generateSupplyOrderPDF = async (req, res) => {
    try {
        // Placeholder for PDF generation
        res.json({ message: 'Supply order PDF generated' });
    } catch (error) {
        console.error('Error generating supply order PDF:', error);
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
            // Update the demand with approved status
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     status = 'purchase_approved', 
                     purchase_response = 'Approved by purchase department',
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
                status: 'purchase_approved',
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
                    s.company_name as supplier_name,
                    s.company_email as supplier_email,
                    sb.delivery_days
                FROM supply_orders so
                JOIN demand_tenders dt ON so.tender_id = dt.id
                JOIN demands d ON so.demand_id = d.id
                JOIN suppliers s ON so.supplier_id = s.id
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

// Generate supply order PDF by ID
const generateSupplyOrderPDFById = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const user = req.user;

    // Check if user is from purchase department or superadmin
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to generate supply order PDFs' });
    }

    try {
        // Get supply order details
        const supplyOrder = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    so.*,
                    dt.id as tender_id,
                    d.item_name,
                    d.description,
                    d.urgency,
                    d.required_by,
                    s.company_name,
                    s.company_email,
                    sb.delivery_days,
                    sb.bid_comments
                FROM supply_orders so
                JOIN demand_tenders dt ON so.tender_id = dt.id
                JOIN demands d ON so.demand_id = d.id
                JOIN suppliers s ON so.supplier_id = s.id
                JOIN supplier_bids sb ON so.bid_id = sb.id
                WHERE so.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!supplyOrder) {
            return res.status(404).json({ message: 'Supply order not found' });
        }        // Prepare order data for PDF generation with defensive programming
        const orderData = {
            order_id: supplyOrder.id,
            order_number: supplyOrder.order_number,
            tender_id: supplyOrder.tender_id,
            demand_id: supplyOrder.demand_id,
            item_name: supplyOrder.item_name || 'N/A',
            description: supplyOrder.description || 'No description',
            quantity: supplyOrder.quantity || 0,
            unit_price: supplyOrder.unit_price || 0,
            awarded_bid_amount: supplyOrder.total_amount || 0, // Map total_amount to awarded_bid_amount for PDF service with default value
            delivery_date: supplyOrder.delivery_date,
            order_status: supplyOrder.order_status || 'pending',
            urgency: supplyOrder.urgency || 'normal',
            required_by: supplyOrder.required_by,
            company_name: supplyOrder.company_name || 'N/A',
            company_email: supplyOrder.company_email || '',
            delivery_time_days: supplyOrder.delivery_days || 0,
            bid_comments: supplyOrder.bid_comments || '',
            order_date: supplyOrder.created_at
        };console.log(`Generating PDF for supply order ${id}...`);
        console.log('Order data for PDF:', JSON.stringify(orderData, null, 2));
        
        // Generate PDF using the PDF service
        const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
        
        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="supply-order-${supplyOrder.order_number}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        // Send the PDF buffer
        res.send(pdfBuffer);
        
        console.log(`PDF generated successfully for supply order ${id}`);
    } catch (error) {
        console.error('Error generating supply order PDF:', error);
        res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
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
    evaluateDemandPurchase,
    processExpiredTenders,
    getAwardedTenders,
    generateSupplyOrderPDF,
    approveDemand,
    setExpiryForTender,
    getSupplyOrders,
    generateSupplyOrderPDFById,
    updateDemandItemsStatus,
    getDemandWithItems,
    updateItemStatuses,
    getAllDemandsWithItems
};

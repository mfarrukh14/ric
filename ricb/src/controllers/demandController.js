const { getDatabase } = require('../config/database');

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
    }

    try {
        const newStatus = action === 'approve' ? 'vetting_approved' : 'vetting_rejected';
        
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands SET 
                 status = ?, 
                 vetting_remarks = ?, 
                 vetting_evaluated_by = ?,
                 vetting_evaluated_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [newStatus, remarks || null, user.id, id],
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

// Process expired tenders (placeholder)
const processExpiredTenders = async (req, res) => {
    try {
        // If called from scheduler (no res object), just process and return
        if (!res) {
            console.log('Processing expired tenders from scheduler...');
            // Add actual tender processing logic here
            return { success: true, message: 'Expired tenders processed' };
        }
        
        // If called as HTTP endpoint, return JSON response
        res.json({ message: 'Expired tenders processed' });
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

// Approve demand (placeholder)
const approveDemand = async (req, res) => {
    try {
        // Placeholder for demand approval
        res.json({ message: 'Demand approved' });
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

// Get supply orders (placeholder)
const getSupplyOrders = async (req, res) => {
    try {
        // Placeholder for supply orders
        res.json([]);
    } catch (error) {
        console.error('Error fetching supply orders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate supply order PDF by ID (placeholder)
const generateSupplyOrderPDFById = async (req, res) => {
    try {
        // Placeholder for PDF generation by ID
        res.json({ message: 'Supply order PDF generated' });
    } catch (error) {
        console.error('Error generating supply order PDF:', error);
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

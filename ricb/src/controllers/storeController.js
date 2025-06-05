const { getDatabase } = require('../config/database');

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
        });

        res.json({ message: 'Demand status updated successfully' });
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

                // If partially fulfilled, handle the split properly
                if (update.status === 'partial' && update.availableQuantity < update.requestedQuantity) {
                    const remainingQty = update.requestedQuantity - update.availableQuantity;
                    
                    // Get original item details
                    const originalItem = await new Promise((resolve, reject) => {
                        db.get('SELECT * FROM demand_items WHERE id = ?', [update.itemId], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });

                    // Mark the original item as fulfilled (store_fulfilled = true) with available quantity
                    await new Promise((resolve, reject) => {
                        db.run(`UPDATE demand_items 
                                SET quantity = ?, 
                                    store_fulfilled = 1,
                                    store_status = 'available'
                                WHERE id = ?`, [
                            update.availableQuantity,
                            update.itemId
                        ], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Create new item for remaining quantity that needs tender
                    const insertItemQuery = `
                        INSERT INTO demand_items (
                            demand_id, item_name, quantity, estimated_cost, unit, 
                            store_status, store_fulfilled
                        ) VALUES (?, ?, ?, ?, ?, 'not_available', 0)
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
                } else if (update.status === 'available') {
                    // Mark as fulfilled by store
                    await new Promise((resolve, reject) => {
                        db.run('UPDATE demand_items SET store_fulfilled = 1 WHERE id = ?', [
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

module.exports = {
    updateDemandStatus,
    updateDemandItemsStatus,
    updateItemStatuses
};
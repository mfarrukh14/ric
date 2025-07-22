const { getDatabase } = require('../config/database');
const auditLogger = require('../utils/auditLogger');

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

        // Log store demand status update
        await auditLogger.logDemandManagement(
            user.id,
            user.role,
            user.name,
            'DEMAND_STATUS_UPDATED',
            id,
            `Status: ${status} | Response: ${response || 'None'} | Previous Status: ${demand.status}`,
            req
        );

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

        // Check if any items need to go to purchase (partial or not_available)
        const itemsNeedingPurchase = await new Promise((resolve, reject) => {
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
        if (itemsNeedingPurchase.length > 0) {
            newDemandStatus = 'purchase_pending';
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
            itemsToPurchase: itemsNeedingPurchase.length
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
                        specifications = ?,
                        drug_category_id = ?,
                        drug_name_id = ?,
                        strength_value = ?,
                        strength_unit_id = ?,
                        dosage_form_id = ?,
                        preparation_id = ?,
                        equipment_category_id = ?,
                        equipment_type_id = ?,
                        store_response_at = datetime('now'),
                        store_response_by = ?,
                        stock_in_hand = ?,
                        consumption_type = ?,
                        consumption_amount = ?,
                        calculated_required_qty = ?,
                        store_estimated_cost = ?,
                        removal_reason = ?,
                        is_removed = ?
                    WHERE id = ? AND demand_id = ?
                `;
                
                await new Promise((resolve, reject) => {
                    db.run(updateItemQuery, [
                        update.status,
                        update.availableQuantity,
                        update.remarks || null,
                        update.specifications || null,
                        update.drugCategoryId || null,
                        update.drugNameId || null,
                        update.strengthValue || null,
                        update.strengthUnitId || null,
                        update.dosageFormId || null,
                        update.preparationId || null,
                        update.equipmentCategoryId || null,
                        update.equipmentTypeId || null,
                        userId,
                        update.stockInHand || 0,
                        update.consumptionType || 'monthly',
                        update.consumptionAmount || 0,
                        update.calculatedRequiredQty || update.availableQuantity,
                        update.storeEstimatedCost || update.estimatedCost,
                        update.removalReason || null,
                        update.isRemoved || 0,
                        update.itemId,
                        id
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                // Handle quantity calculation based on consumption logic
                let finalRequiredQty = 0;
                let shouldGoToTender = false;

                if (update.status === 'available') {
                    // Item is fully available in store - no tender needed
                    finalRequiredQty = 0;
                    shouldGoToTender = false;
                } else if (update.status === 'not_available') {
                    // Item is not available in store - full quantity goes to tender
                    finalRequiredQty = update.requestedQuantity;
                    shouldGoToTender = true;
                } else if (update.status === 'partial') {
                    // Calculate required quantity based on consumption logic
                    const stockInHand = update.stockInHand || 0;
                    const consumptionAmount = update.consumptionAmount || 0;
                    const requestedQuantity = update.requestedQuantity;

                    if (consumptionAmount === 0) {
                        // If monthly consumption is 0, compare against requested quantity
                        finalRequiredQty = Math.max(0, requestedQuantity - stockInHand);
                    } else {
                        // If monthly consumption is set, compare against consumption
                        finalRequiredQty = Math.max(0, consumptionAmount - stockInHand);
                    }
                    
                    shouldGoToTender = finalRequiredQty > 0;
                }

                // Update the original item with calculated values
                if (shouldGoToTender && finalRequiredQty > 0) {
                    // Update item to go to tender with calculated required quantity
                    await new Promise((resolve, reject) => {
                        db.run(`UPDATE demand_items 
                                SET quantity = ?,
                                    store_fulfilled = 0,
                                    store_status = 'not_available'
                                WHERE id = ?`, [
                            finalRequiredQty,
                            update.itemId
                        ], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                } else {
                    // Mark as fulfilled by store - no tender needed
                    await new Promise((resolve, reject) => {
                        db.run(`UPDATE demand_items 
                                SET store_fulfilled = 1,
                                    store_status = 'available'
                                WHERE id = ?`, [
                            update.itemId
                        ], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }
            }

            // Determine overall demand status based on final database state
            const finalItems = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT store_fulfilled FROM demand_items WHERE demand_id = ? AND is_removed != 1',
                    [id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            let demandStatus;
            const hasUnfulfilledItems = finalItems.some(item => item.store_fulfilled === 0);
            
            if (hasUnfulfilledItems) {
                demandStatus = 'purchase_pending'; // Items need to go to tender
            } else {
                demandStatus = 'available'; // All items fulfilled by store
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
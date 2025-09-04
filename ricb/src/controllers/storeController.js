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
            newDemandStatus = 'pending_hod_approval';
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
// NEW WORKFLOW: Store submits fulfillment -> HOD approval -> Purchase department (if needed)
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

            // After store processing, send to STORE HOD for approval before going to purchase
            // Reset hod_status to NULL since this is a new approval stage (Store HOD, not original department HOD)
            const demandStatus = 'pending_store_hod_approval';

            // Update demand status and store response, reset HOD approval fields for Store HOD stage
            const updateDemandQuery = `
                UPDATE demands 
                SET status = ?, 
                    store_response = ?, 
                    store_response_by = ?, 
                    store_response_at = datetime('now'),
                    hod_status = NULL,
                    hod_response_by = NULL,
                    hod_response_at = NULL,
                    hod_rejection_reason = NULL
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
                message: 'Fulfillment updated successfully. Sent to HOD for approval.', 
                status: demandStatus,
                redirectsToHod: true
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

// Get pending demands for Store HOD approval
const getStorePendingForHodApproval = async (req, res) => {
    try {
        const db = getDatabase();
        const userId = req.user.id;

        // Verify user is Store HOD
        const user = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.*, d.name as departmentName 
                 FROM users u 
                 LEFT JOIN departments d ON u.department_id = d.id 
                 WHERE u.id = ? AND u.is_hod = 1 AND LOWER(d.name) = 'store'`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(403).json({ message: 'Access denied. Store HOD access required.' });
        }

        // Get demands pending Store HOD approval
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, 
                        u.name as createdByName, 
                        dept.name as departmentName,
                        stor.name as storeResponseByName
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users stor ON d.store_response_by = stor.id
                 WHERE d.status = 'pending_store_hod_approval'
                 ORDER BY d.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        res.json(demands);
    } catch (error) {
        console.error('Get store pending for HOD approval error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Approve Store fulfillment by Store HOD
const approveStoreFulfillmentByHod = async (req, res) => {
    try {
        const db = getDatabase();
        const { demandId } = req.params;
        const userId = req.user.id;

        // Verify user is Store HOD
        const user = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.*, d.name as departmentName 
                 FROM users u 
                 LEFT JOIN departments d ON u.department_id = d.id 
                 WHERE u.id = ? AND u.is_hod = 1 AND LOWER(d.name) = 'store'`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(403).json({ message: 'Access denied. Store HOD access required.' });
        }

        // Get demand details and check if items need purchase
        const demand = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demands WHERE id = ? AND status = ?',
                [demandId, 'pending_store_hod_approval'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found or not in correct status for Store HOD approval' });
        }

        // Check if any items need to go to purchase (not fully fulfilled by store)
        const unfulfilled = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM demand_items 
                 WHERE demand_id = ? AND store_fulfilled = 0`,
                [demandId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Determine the appropriate status after Store HOD approval
        const hasUnfulfilledItems = unfulfilled.length > 0;
        const finalStatus = hasUnfulfilledItems ? 'purchase_pending' : 'available';

        // Update demand status based on whether items need purchase
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands SET 
                    status = ?,
                    hod_status = 'approved',
                    hod_response_by = ?,
                    hod_response_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [finalStatus, userId, demandId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });

        res.json({ 
            message: `Store fulfillment approved successfully by Store HOD. Status: ${finalStatus}`,
            demandId: demandId,
            status: finalStatus,
            needsPurchase: hasUnfulfilledItems
        });

    } catch (error) {
        console.error('Approve store fulfillment by HOD error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Reject Store fulfillment by Store HOD
const rejectStoreFulfillmentByHod = async (req, res) => {
    try {
        const db = getDatabase();
        const { demandId } = req.params;
        const { rejectionReason } = req.body;
        const userId = req.user.id;
        
        if (!rejectionReason || rejectionReason.trim() === '') {
            return res.status(400).json({ message: 'Rejection reason is required' });
        }

        // Verify user is Store HOD
        const user = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.*, d.name as departmentName 
                 FROM users u 
                 LEFT JOIN departments d ON u.department_id = d.id 
                 WHERE u.id = ? AND u.is_hod = 1 AND LOWER(d.name) = 'store'`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(403).json({ message: 'Access denied. Store HOD access required.' });
        }

        // Get demand details
        const demand = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demands WHERE id = ? AND status = ?',
                [demandId, 'pending_store_hod_approval'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found or not in correct status for Store HOD approval' });
        }

        // Update demand status to rejected by Store HOD
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands SET 
                    status = 'rejected',
                    hod_status = 'rejected',
                    hod_response_by = ?,
                    hod_response_at = CURRENT_TIMESTAMP,
                    hod_rejection_reason = ?
                 WHERE id = ?`,
                [userId, rejectionReason.trim(), demandId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });

        res.json({ 
            message: 'Store fulfillment rejected successfully by Store HOD',
            demandId: demandId,
            rejectionReason: rejectionReason.trim()
        });

    } catch (error) {
        console.error('Reject store fulfillment by HOD error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    updateDemandStatus,
    updateDemandItemsStatus,
    updateItemStatuses,
    getStorePendingForHodApproval,
    approveStoreFulfillmentByHod,
    rejectStoreFulfillmentByHod
};
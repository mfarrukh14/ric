const { dbAll, dbGet, dbRun } = require('../db');

// Update item statuses and handle fulfillment logic
// WORKFLOW: Store submits fulfillment -> if every item is fully in stock, the
// demand is closed out immediately and the creator is notified directly ("stock
// allotted") - no HOD approval needed. Otherwise it goes to Store HOD approval,
// then Purchase department if still needed.
//
// Note: this does NOT wrap the sequence in an explicit SQL transaction. The
// mssql adapter hands out a different pooled connection per query, so a raw
// BEGIN TRANSACTION/COMMIT here would run on different connections and SQL
// Server would reject it ("mismatching number of BEGIN and COMMIT statements") -
// that used to make this whole endpoint fail on every submission.
/**
 * How many units purchase must buy for an item after store's check. The fulfilment screen uses
 * the same rule (ricf FulfillmentPage computeAutoFields), so what store sees is what is saved.
 *   available      → 0 (store supplies it)
 *   not_available  → the full requested quantity
 *   partial        → consumption (or the request, if no consumption is given) minus stock in hand
 */
function procurementQuantity(status, { requested, stockInHand, consumption }) {
    if (status === 'available') return 0;
    if (status === 'not_available') return Math.max(0, requested);
    return Math.max(0, (consumption || requested) - stockInHand);
}

const updateItemStatuses = async (req, res) => {
    try {
        const { id } = req.params;
        const { itemUpdates, response } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!itemUpdates || !Array.isArray(itemUpdates) || !response) {
            return res.status(400).json({ message: 'Item updates and response are required' });
        }

        // Only demands waiting on the store may be fulfilled; anything further along
        // (with the store HOD, purchase or a tender) must not be reset.
        const demand = await dbGet('SELECT status FROM demands WHERE id = ?', [id]);
        if (!demand) return res.status(404).json({ message: 'Demand not found' });
        if (demand.status !== 'pending') {
            return res.status(409).json({ message: 'This demand is no longer waiting for the store' });
        }

        {
            let anyItemNeedsTender = false;
            const items = new Map((await dbAll('SELECT id, quantity, requested_quantity FROM demand_items WHERE demand_id = ?', [id])).map((i) => [i.id, i]));

            for (const update of itemUpdates) {
                const item = items.get(Number(update.itemId));
                if (!item) continue;
                // What the department asked for; kept once the quantity becomes "to procure".
                const requested = item.requested_quantity ?? item.quantity;
                const toProcure = procurementQuantity(update.status, {
                    requested,
                    stockInHand: Number(update.stockInHand) || 0,
                    consumption: Number(update.consumptionAmount) || 0,
                });
                // Rates are per unit; the store's estimate is the cost of what is left to buy.
                const unitRate = Math.max(0, Number(update.currentYearCost) || 0);
                const lastRate = Math.max(0, Number(update.prevYearCost) || 0);
                const goesToTender = !update.isRemoved && toProcure > 0;
                if (goesToTender) anyItemNeedsTender = true;

                await dbRun(
                    `UPDATE demand_items
                     SET store_status = ?, store_available_quantity = ?, remarks = ?, specifications = ?,
                         store_response_at = CURRENT_TIMESTAMP, store_response_by = ?,
                         stock_in_hand = ?, consumption_type = ?, consumption_amount = ?,
                         requested_quantity = ?, quantity = ?, calculated_required_qty = ?,
                         prev_year_cost = ?, current_year_cost = ?, estimated_cost = ?, store_estimated_cost = ?,
                         store_fulfilled = ?, removal_reason = ?, is_removed = ?
                     WHERE id = ? AND demand_id = ?`,
                    [
                        goesToTender ? 'not_available' : 'available',
                        Math.max(0, Number(update.availableQuantity) || 0),
                        update.remarks || null,
                        update.specifications || null,
                        userId,
                        Number(update.stockInHand) || 0,
                        update.consumptionType || 'monthly',
                        Number(update.consumptionAmount) || 0,
                        requested,
                        goesToTender ? toProcure : requested,
                        toProcure,
                        lastRate,
                        unitRate,
                        unitRate,
                        toProcure * unitRate,
                        goesToTender ? 0 : 1,
                        update.removalReason || null,
                        update.isRemoved ? 1 : 0,
                        item.id,
                        id,
                    ],
                );
            }

            let demandStatus;
            let updateDemandQuery;
            let updateDemandParams;

            if (!anyItemNeedsTender) {
                // Everything requested was fully in stock - no HOD approval or
                // purchase involvement needed. Close the demand out immediately
                // and let the creator know their stock was allotted directly.
                demandStatus = 'available';
                updateDemandQuery = `
                    UPDATE demands
                    SET status = ?,
                        store_response = ?,
                        store_response_by = ?,
                        store_response_at = datetime('now')
                    WHERE id = ?
                `;
                updateDemandParams = [demandStatus, response, userId, id];
            } else {
                // At least one item needs to go to purchase - send to STORE HOD
                // for approval first. Reset hod_status to NULL since this is a new
                // approval stage (Store HOD, not the original department HOD).
                demandStatus = 'pending_store_hod_approval';
                updateDemandQuery = `
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
                updateDemandParams = [demandStatus, response, userId, id];
            }

            await dbRun(updateDemandQuery, updateDemandParams);

            res.json(
                anyItemNeedsTender
                    ? {
                        message: 'Fulfillment updated successfully. Sent to HOD for approval.',
                        status: demandStatus,
                        redirectsToHod: true
                    }
                    : {
                        message: 'All items were in stock - demand fulfilled directly, no HOD approval needed.',
                        status: demandStatus,
                        redirectsToHod: false
                    }
            );
        }

    } catch (error) {
        console.error('Update item statuses error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get pending demands for Store HOD approval
const getStorePendingForHodApproval = async (req, res) => {
    try {
        const userId = req.user.id;

        // Verify user is Store HOD
        const user = await dbGet(`SELECT u.*, d.name as departmentName 
         FROM users u 
         LEFT JOIN departments d ON u.department_id = d.id 
         WHERE u.id = ? AND u.is_hod = 1 AND LOWER(d.name) = 'store'`, [userId]);

        if (!user) {
            return res.status(403).json({ message: 'Access denied. Store HOD access required.' });
        }

        // Get demands pending Store HOD approval
        const demands = await dbAll(`SELECT d.*, 
                u.name as createdByName, 
                dept.name as departmentName,
                stor.name as storeResponseByName
         FROM demands d
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         LEFT JOIN users stor ON d.store_response_by = stor.id
         WHERE d.status = 'pending_store_hod_approval'
         ORDER BY d.created_at DESC`, []);

        res.json(demands);
    } catch (error) {
        console.error('Get store pending for HOD approval error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Approve Store fulfillment by Store HOD
const approveStoreFulfillmentByHod = async (req, res) => {
    try {
        const { demandId } = req.params;
        const userId = req.user.id;

        // Verify user is Store HOD
        const user = await dbGet(`SELECT u.*, d.name as departmentName 
         FROM users u 
         LEFT JOIN departments d ON u.department_id = d.id 
         WHERE u.id = ? AND u.is_hod = 1 AND LOWER(d.name) = 'store'`, [userId]);

        if (!user) {
            return res.status(403).json({ message: 'Access denied. Store HOD access required.' });
        }

        // Get demand details and check if items need purchase
        const demand = await dbGet(
            'SELECT * FROM demands WHERE id = ? AND status = ?',
            [demandId, 'pending_store_hod_approval']
        );

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found or not in correct status for Store HOD approval' });
        }

        // Check if any items need to go to purchase (not fully fulfilled by store)
        const unfulfilled = await dbAll(`SELECT * FROM demand_items 
         WHERE demand_id = ? AND store_fulfilled = 0`, [demandId]);

        // Determine the appropriate status after Store HOD approval
        const hasUnfulfilledItems = unfulfilled.length > 0;
        const finalStatus = hasUnfulfilledItems ? 'purchase_pending' : 'available';

        // Update demand status based on whether items need purchase
        await dbRun(`UPDATE demands SET 
            status = ?,
            hod_status = 'approved',
            hod_response_by = ?,
            hod_response_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [finalStatus, userId, demandId]).then(result => this);

        res.json({ 
            message: `Store fulfillment approved successfully by Store HOD. Status: ${finalStatus}`,
            demandId: demandId,
            status: finalStatus,
            needsPurchase: hasUnfulfilledItems
        });

    } catch (error) {
        console.error('Approve store fulfillment by HOD error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Reject Store fulfillment by Store HOD
const rejectStoreFulfillmentByHod = async (req, res) => {
    try {
        const { demandId } = req.params;
        const { rejectionReason } = req.body;
        const userId = req.user.id;
        
        if (!rejectionReason || rejectionReason.trim() === '') {
            return res.status(400).json({ message: 'Rejection reason is required' });
        }

        // Verify user is Store HOD
        const user = await dbGet(`SELECT u.*, d.name as departmentName 
         FROM users u 
         LEFT JOIN departments d ON u.department_id = d.id 
         WHERE u.id = ? AND u.is_hod = 1 AND LOWER(d.name) = 'store'`, [userId]);

        if (!user) {
            return res.status(403).json({ message: 'Access denied. Store HOD access required.' });
        }

        // Get demand details
        const demand = await dbGet(
            'SELECT * FROM demands WHERE id = ? AND status = ?',
            [demandId, 'pending_store_hod_approval']
        );

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found or not in correct status for Store HOD approval' });
        }

        // Update demand status to rejected by Store HOD
        await dbRun(`UPDATE demands SET 
            status = 'rejected',
            hod_status = 'rejected',
            hod_response_by = ?,
            hod_response_at = CURRENT_TIMESTAMP,
            hod_rejection_reason = ?
         WHERE id = ?`, [userId, rejectionReason.trim(), demandId]).then(result => this);

        res.json({ 
            message: 'Store fulfillment rejected successfully by Store HOD',
            demandId: demandId,
            rejectionReason: rejectionReason.trim()
        });

    } catch (error) {
        console.error('Reject store fulfillment by HOD error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    updateItemStatuses,
    getStorePendingForHodApproval,
    approveStoreFulfillmentByHod,
    rejectStoreFulfillmentByHod
};
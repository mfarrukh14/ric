const { getDatabase } = require('../config/database');

// Get expired tenders for technical evaluation committee
const getExpiredTenders = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from technical evaluation committee
    const canView = user.role === 'superadmin' || 
                   (user.committee_name && user.committee_name.toLowerCase().includes('technical evaluation'));

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view expired tenders' });
    }

    try {
        // Get expired tenders that haven't been processed yet
        const expiredTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE dt.tender_status = 'active' 
                 AND dt.bidding_end_time <= datetime('now', 'localtime')
                 ORDER BY dt.bidding_end_time ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // For each tender, get the demand items and bids
        for (const tender of expiredTenders) {
            // Get demand items
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id`,
                    [tender.demand_id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            // If no items found (legacy single-item demand), create from main demand
            if (items.length === 0) {
                tender.items = [{
                    id: 0,
                    item_name: tender.item_name,
                    quantity: tender.quantity || 0,
                    estimated_cost: tender.estimated_cost || 0,
                    unit: 'pieces'
                }];
            } else {
                tender.items = items;
            }

            // Get all bids for this tender with supplier details
            const bids = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT sb.*, s.company_name, s.company_email, s.contact_person
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

            tender.bids = bids;
        }

        res.json(expiredTenders);
    } catch (error) {
        console.error('Error fetching expired tenders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get tender details with all bids for evaluation
const getTenderDetails = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from technical evaluation committee
    const canView = user.role === 'superadmin' || 
                   (user.committee_name && user.committee_name.toLowerCase().includes('technical evaluation'));

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view tender details' });
    }

    try {
        // Get tender details
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE dt.id = ?`,
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

        // Get demand items
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id`,
                [tender.demand_id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // If no items found (legacy single-item demand), create from main demand
        if (items.length === 0) {
            tender.items = [{
                id: 0,
                item_name: tender.item_name,
                quantity: tender.quantity || 0,
                estimated_cost: tender.estimated_cost || 0,
                unit: 'pieces'
            }];
        } else {
            tender.items = items;
        }

        // Get all bids with supplier details
        const bids = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sb.*, s.company_name, s.company_email, s.contact_person, s.contact_number
                 FROM supplier_bids sb
                 JOIN suppliers s ON sb.supplier_id = s.id
                 WHERE sb.tender_id = ? AND s.status = 'approved'
                 ORDER BY sb.total_cost ASC, sb.created_at ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        tender.bids = bids;

        res.json(tender);
    } catch (error) {
        console.error('Error fetching tender details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Download technical bid document
const downloadTechnicalBid = async (req, res) => {
    const db = getDatabase();
    const { bidId } = req.params;
    const user = req.user;

    // Check if user is from technical evaluation committee
    const canDownload = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase().includes('technical evaluation'));

    if (!canDownload) {
        return res.status(403).json({ message: 'You do not have permission to download bid documents' });
    }

    try {
        // Get bid details
        const bid = await new Promise((resolve, reject) => {
            db.get(
                'SELECT technical_bid_document FROM supplier_bids WHERE id = ?',
                [bidId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!bid || !bid.technical_bid_document) {
            return res.status(404).json({ message: 'Technical bid document not found' });
        }

        const fs = require('fs');
        if (!fs.existsSync(bid.technical_bid_document)) {
            return res.status(404).json({ message: 'Technical bid document file not found' });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="technical-bid-${bidId}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');
        
        // Send file
        res.sendFile(bid.technical_bid_document);
    } catch (error) {
        console.error('Error downloading technical bid:', error);
        res.status(500).json({ message: 'Failed to download technical bid document' });
    }
};

// Award tender to selected supplier
const awardTender = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { selectedBidId, remarks } = req.body;
    const user = req.user;

    // Check if user is from technical evaluation committee
    const canAward = user.role === 'superadmin' || 
                    (user.committee_name && user.committee_name.toLowerCase().includes('technical evaluation'));

    if (!canAward) {
        return res.status(403).json({ message: 'Only technical evaluation committee members can award tenders' });
    }

    if (!selectedBidId) {
        return res.status(400).json({ message: 'Selected bid ID is required' });
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
            // Get the winning bid details
            const winningBid = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT sb.*, s.company_name, s.company_email, dt.demand_id, d.item_name
                     FROM supplier_bids sb
                     JOIN suppliers s ON sb.supplier_id = s.id
                     JOIN demand_tenders dt ON sb.tender_id = dt.id
                     JOIN demands d ON dt.demand_id = d.id
                     WHERE sb.id = ? AND sb.tender_id = ?`,
                    [selectedBidId, tenderId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!winningBid) {
                throw new Error('Selected bid not found');
            }

            // Update tender status to awarded
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demand_tenders SET 
                     tender_status = 'awarded', 
                     awarded_supplier_id = ?, 
                     awarded_bid_amount = ?,
                     awarded_at = CURRENT_TIMESTAMP,
                     evaluation_remarks = ?
                     WHERE id = ?`,
                    [winningBid.supplier_id, winningBid.total_cost, remarks, tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Create supply order
            const orderNumber = `SO-${Date.now()}-${tenderId}`;
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO supply_orders (
                        order_number, demand_id, supplier_id, tender_id, bid_id,
                        item_name, quantity, unit_price, total_amount, delivery_date, order_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '+' || ? || ' days'), 'pending')`,
                    [
                        orderNumber,
                        winningBid.demand_id,
                        winningBid.supplier_id, 
                        tenderId,
                        winningBid.id,
                        winningBid.item_name,
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

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({ 
                message: `Tender awarded successfully to ${winningBid.company_name}`,
                awardedTo: winningBid.company_name,
                awardAmount: winningBid.total_cost
            });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Error awarding tender:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getExpiredTenders,
    getTenderDetails,
    downloadTechnicalBid,
    awardTender
};
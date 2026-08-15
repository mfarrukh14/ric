const { getDatabase } = require('../config/database');
const path = require('path');
const fs = require('fs');

// Get supplier's won bids (awards)
const getSupplierAwards = async (req, res) => {
    try {
        const supplierId = req.user.id;
        const db = getDatabase();

        const query = `
            SELECT 
                sa.id,
                sa.tender_id,
                sa.award_amount,
                sa.awarded_items,
                sa.award_status,
                sa.awarded_at,
                sa.contract_signed_at,
                sa.completion_date,
                sa.notes,
                dt.tender_number,
                d.item_name as tender_title,
                d.description as tender_description,
                tl.id as award_letter_id,
                tl.letter_title,
                tl.letter_file_path,
                tl.letter_original_name,
                tl.sent_at as letter_sent_at
            FROM supplier_awards sa
            JOIN demand_tenders dt ON sa.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN tender_letters tl ON sa.award_letter_id = tl.id
            WHERE sa.supplier_id = ?
            ORDER BY sa.awarded_at DESC
        `;

        db.all(query, [supplierId], (err, awards) => {
            if (err) {
                console.error('Error fetching supplier awards:', err);
                return res.status(500).json({ error: 'Failed to fetch awards' });
            }

            // Parse awarded_items JSON for each award
            const parsedAwards = awards.map(award => ({
                ...award,
                awarded_items: award.awarded_items ? JSON.parse(award.awarded_items) : []
            }));

            res.json(parsedAwards);
        });
    } catch (error) {
        console.error('Error in getSupplierAwards:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get award details by ID
const getAwardDetails = async (req, res) => {
    try {
        const { awardId } = req.params;
        const supplierId = req.user.id;
        const db = getDatabase();

        const query = `
            SELECT 
                sa.*,
                dt.tender_number,
                d.item_name as tender_title,
                d.description as tender_description,
                d.required_by,
                tl.letter_title,
                tl.letter_content,
                tl.letter_file_path,
                tl.letter_original_name,
                tl.sent_at as letter_sent_at,
                sb.delivery_days,
                sb.bid_comments
            FROM supplier_awards sa
            JOIN demand_tenders dt ON sa.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN tender_letters tl ON sa.award_letter_id = tl.id
            LEFT JOIN supplier_bids sb ON sa.bid_id = sb.id
            WHERE sa.id = ? AND sa.supplier_id = ?
        `;

        db.get(query, [awardId, supplierId], (err, award) => {
            if (err) {
                console.error('Error fetching award details:', err);
                return res.status(500).json({ error: 'Failed to fetch award details' });
            }

            if (!award) {
                return res.status(404).json({ error: 'Award not found' });
            }

            // Parse awarded_items JSON
            award.awarded_items = award.awarded_items ? JSON.parse(award.awarded_items) : [];

            res.json(award);
        });
    } catch (error) {
        console.error('Error in getAwardDetails:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Download award letter
const downloadAwardLetter = async (req, res) => {
    try {
        const { awardId } = req.params;
        const supplierId = req.user.id;
        const db = getDatabase();

        // Verify that this award belongs to the requesting supplier
        const award = await new Promise((resolve, reject) => {
            db.get(
                `SELECT sa.id, tl.letter_file_path, tl.letter_original_name
                 FROM supplier_awards sa
                 LEFT JOIN tender_letters tl ON sa.award_letter_id = tl.id
                 WHERE sa.id = ? AND sa.supplier_id = ?`,
                [awardId, supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!award) {
            return res.status(404).json({ error: 'Award not found' });
        }

        if (!award.letter_file_path) {
            return res.status(404).json({ error: 'Award letter file not found' });
        }

        const filePath = path.join(__dirname, '../../tender-letters', award.letter_file_path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Award letter file not found on server' });
        }

        // Update download tracking
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE letter_recipients 
                 SET downloaded_at = CURRENT_TIMESTAMP 
                 WHERE letter_id = (SELECT award_letter_id FROM supplier_awards WHERE id = ?) 
                 AND supplier_id = ?`,
                [awardId, supplierId],
                (err) => {
                    if (err) console.error('Error updating download tracking:', err);
                    resolve();
                }
            );
        });

        res.download(filePath, award.letter_original_name || 'award-letter.pdf');
    } catch (error) {
        console.error('Error downloading award letter:', error);
        res.status(500).json({ error: 'Failed to download award letter' });
    }
};

// Update award status (for contract signing, completion, etc.)
const updateAwardStatus = async (req, res) => {
    try {
        const { awardId } = req.params;
        const { status, notes, contractSignedAt, completionDate } = req.body;
        const supplierId = req.user.id;
        const db = getDatabase();

        // Verify award belongs to supplier
        const award = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM supplier_awards WHERE id = ? AND supplier_id = ?',
                [awardId, supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!award) {
            return res.status(404).json({ error: 'Award not found' });
        }

        // Build update query dynamically
        let updateFields = [];
        let updateValues = [];

        if (status) {
            updateFields.push('award_status = ?');
            updateValues.push(status);
        }

        if (notes) {
            updateFields.push('notes = ?');
            updateValues.push(notes);
        }

        if (contractSignedAt) {
            updateFields.push('contract_signed_at = ?');
            updateValues.push(contractSignedAt);
        }

        if (completionDate) {
            updateFields.push('completion_date = ?');
            updateValues.push(completionDate);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updateValues.push(awardId);

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE supplier_awards SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Award status updated successfully' });
    } catch (error) {
        console.error('Error updating award status:', error);
        res.status(500).json({ error: 'Failed to update award status' });
    }
};

// Get award statistics for supplier dashboard
const getSupplierAwardStats = async (req, res) => {
    try {
        const supplierId = req.user.id;
        const db = getDatabase();

        const stats = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as total_awards,
                    COUNT(CASE WHEN award_status = 'awarded' THEN 1 END) as pending_awards,
                    COUNT(CASE WHEN award_status = 'contract_signed' THEN 1 END) as contracts_signed,
                    COUNT(CASE WHEN award_status = 'completed' THEN 1 END) as completed_awards,
                    SUM(award_amount) as total_award_value,
                    SUM(CASE WHEN award_status = 'completed' THEN award_amount ELSE 0 END) as completed_value
                 FROM supplier_awards 
                 WHERE supplier_id = ?`,
                [supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        res.json({
            total_awards: stats.total_awards || 0,
            pending_awards: stats.pending_awards || 0,
            contracts_signed: stats.contracts_signed || 0,
            completed_awards: stats.completed_awards || 0,
            total_award_value: stats.total_award_value || 0,
            completed_value: stats.completed_value || 0
        });
    } catch (error) {
        console.error('Error in getSupplierAwardStats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getSupplierAwards,
    getAwardDetails,
    downloadAwardLetter,
    updateAwardStatus,
    getSupplierAwardStats
};

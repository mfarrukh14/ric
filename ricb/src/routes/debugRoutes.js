const express = require('express');
const router = express.Router();
const { getDatabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Debug endpoint to check tender status for letter of intent
router.get('/debug-tender/:tenderId', authenticateToken, async (req, res) => {
    try {
        const { tenderId } = req.params;
        const db = getDatabase();
        
        // Get tender basic info
        const tenderInfo = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.item_name, d.description 
                 FROM demand_tenders dt 
                 JOIN demands d ON dt.demand_id = d.id 
                 WHERE dt.id = ?`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Get financial opening status
        const financialOpening = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM financial_openings WHERE tender_id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Get supplier bids
        const supplierBids = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sb.*, s.business_email, sbp.business_name 
                 FROM supplier_bids sb 
                 LEFT JOIN suppliers s ON sb.supplier_id = s.id 
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id 
                 WHERE sb.tender_id = ?`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get technical evaluations
        const technicalEvaluations = await new Promise((resolve, reject) => {
            db.all(
                `SELECT te.*, sb.supplier_id 
                 FROM technical_evaluations te 
                 JOIN supplier_bids sb ON te.bid_id = sb.id 
                 WHERE sb.tender_id = ?`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get existing letters
        const existingLetters = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM tender_letters WHERE tender_id = ?',
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Check the exact query from letter controller
        const letterControllerQuery = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    dt.id,
                    dt.tender_number,
                    dt.demand_id,
                    dt.tender_status,
                    d.item_name,
                    d.description,
                    u.name as created_by_name,
                    fo.opened_at as financial_opened_at,
                    fo.opened_by,
                    fo.status as financial_status,
                    COUNT(DISTINCT sb.supplier_id) as total_bidders,
                    COUNT(DISTINCT te.supplier_id) as approved_bidders,
                    tl_intent.id as intent_letter_sent,
                    tl_intent.sent_at as intent_sent_at
                FROM demand_tenders dt
                JOIN demands d ON dt.demand_id = d.id
                LEFT JOIN users u ON d.created_by = u.id
                LEFT JOIN financial_openings fo ON dt.id = fo.tender_id AND fo.status = 'opened'
                LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id
                LEFT JOIN technical_evaluations te ON sb.id = te.bid_id AND te.status = 'approved'
                LEFT JOIN tender_letters tl_intent ON dt.id = tl_intent.tender_id AND tl_intent.letter_type = 'intent'
                WHERE dt.id = ?
                GROUP BY dt.id`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({
            tenderId: parseInt(tenderId),
            tenderInfo,
            financialOpening,
            supplierBids: supplierBids.length,
            technicalEvaluations: technicalEvaluations.length,
            approvedEvaluations: technicalEvaluations.filter(te => te.status === 'approved').length,
            existingLetters: existingLetters.length,
            letterControllerQueryResult: letterControllerQuery[0] || null,
            debug: {
                hasFinancialOpening: !!financialOpening,
                financialOpeningStatus: financialOpening?.status,
                isFinancialOpened: financialOpening?.status === 'opened',
                hasApprovedBids: technicalEvaluations.filter(te => te.status === 'approved').length > 0,
                tenderStatus: tenderInfo?.tender_status,
                qualifiesForLetterIntent: !!(
                    financialOpening?.status === 'opened' &&
                    technicalEvaluations.filter(te => te.status === 'approved').length > 0 &&
                    tenderInfo?.tender_status !== 'awarded' &&
                    tenderInfo?.tender_status !== 'cancelled'
                )
            }
        });

    } catch (error) {
        console.error('Error in debug endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

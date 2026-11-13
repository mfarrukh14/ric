const { getDatabase, dbAll, dbGet, dbRun } = require('../db');
const path = require('path');
const fs = require('fs');
const { getFieldValuesByItemIds, formatItemFields } = require('../utils/itemFieldFormatter');
const { resolveInside } = require('../utils/files');
const { buildEvaluationWorkbook } = require('../reports/technicalReport');


// Get expired tenders for technical evaluation committee
const getExpiredTenders = async (req, res) => {
    const db = getDatabase();

    // Check if user is from technical evaluation committee

    try {
        // Get expired tenders that are ready for technical evaluation
        const expiredTenders = await dbAll(`SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                u.name as created_by_name, dept.name as creator_department
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         WHERE dt.tender_status = 'expired'
         ORDER BY dt.bidding_end_time ASC`, []);

        // For each tender, get the demand items and bids
        for (const tender of expiredTenders) {
            // Get demand items with category info
            const items = await dbAll(`SELECT di.*,
                    ic.name as category_name,
                    in_t.name as item_name_full
             FROM demand_items di
             LEFT JOIN item_categories ic ON di.category_id = ic.id
             LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
             WHERE di.demand_id = ?
             AND (di.store_fulfilled IS NULL OR di.store_fulfilled = 0)
             AND (di.store_status != 'available' OR di.store_status IS NULL)
             ORDER BY di.id`, [tender.demand_id]);

            // Format items, attaching each item's generic custom field values
            const fieldValuesByItem = await getFieldValuesByItemIds(db, items.map(item => item.id));
            const formattedItems = items.map(item => {
                const formatted = formatItemFields(fieldValuesByItem[item.id] || []);
                return {
                    id: item.id,
                    item_name: item.item_name || item.item_name_full || formatted.name || 'Unknown Item',
                    category: item.category_name || 'Unknown Category',
                    quantity: item.quantity,
                    unit: item.unit,
                    specifications: item.specifications,
                    estimated_cost: item.current_year_cost,
                    custom_fields: formatted.fields
                };
            });

            // If no items found (legacy single-item demand), create from main demand
            if (formattedItems.length === 0) {
                tender.items = [{
                    id: 0,
                    item_name: tender.item_name,
                    category: 'General',
                    quantity: tender.quantity || 0,
                    estimated_cost: tender.estimated_cost || 0,
                    unit: 'pieces',
                    item_type: 'general'
                }];
            } else {
                tender.items = formattedItems;
            }

            // Get all bids for this tender with supplier details
            const bids = await dbAll(`SELECT sb.*, 
                    s.business_email as company_email,
                    s.username,
                    bp.business_name as company_name,
                    bp.contact_person_name as contact_person
             FROM supplier_bids sb
             JOIN suppliers s ON sb.supplier_id = s.id
             LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
             WHERE sb.tender_id = ? AND s.status = 'approved'
             ORDER BY sb.total_cost ASC, sb.created_at ASC`, [tender.id]);

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

    // Check if user is from technical evaluation committee

    try {
        // Get tender details
        const tender = await dbGet(`SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                u.name as created_by_name, dept.name as creator_department
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         WHERE dt.id = ?`, [tenderId]);

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found' });
        }

        // Get demand items with category info
        const items = await dbAll(`SELECT di.*,
                ic.name as category_name,
                in_t.name as item_name_full
         FROM demand_items di
         LEFT JOIN item_categories ic ON di.category_id = ic.id
         LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
         WHERE di.demand_id = ?
         AND (di.store_fulfilled IS NULL OR di.store_fulfilled = 0)
         AND (di.store_status != 'available' OR di.store_status IS NULL)
         ORDER BY di.id`, [tender.demand_id]);

        // Format items, attaching each item's generic custom field values
        const fieldValuesByItem = await getFieldValuesByItemIds(db, items.map(item => item.id));
        const formattedItems = items.map(item => {
            const formatted = formatItemFields(fieldValuesByItem[item.id] || []);
            return {
                id: item.id,
                item_name: item.item_name || item.item_name_full || formatted.name || 'Unknown Item',
                category: item.category_name || 'Unknown Category',
                quantity: item.quantity,
                unit: item.unit,
                specifications: item.specifications,
                estimated_cost: item.current_year_cost,
                custom_fields: formatted.fields
            };
        });

        // If no items found (legacy single-item demand), create from main demand
        if (formattedItems.length === 0) {
            tender.items = [{
                id: 0,
                item_name: tender.item_name,
                category: 'General',
                quantity: tender.quantity || 0,
                estimated_cost: tender.estimated_cost || 0,
                unit: 'pieces',
                item_type: 'general'
            }];
        } else {
            tender.items = formattedItems;
        }

        // Get all bids with supplier details and their item-specific bids
        const bids = await dbAll(`SELECT sb.*, 
                s.business_email as company_email,
                s.username,
                bp.business_name as company_name,
                bp.contact_person_name as contact_person,
                bp.business_mobile_number as contact_number
         FROM supplier_bids sb
         JOIN suppliers s ON sb.supplier_id = s.id
         LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
         WHERE sb.tender_id = ? AND s.status = 'approved'
         ORDER BY sb.total_cost ASC, sb.created_at ASC`, [tender.id]);

        // For each bid, get the item-specific bid details
        for (const bid of bids) {
            const bidItems = await dbAll(
                `SELECT * FROM supplier_bid_items WHERE bid_id = ? ORDER BY item_id`,
                [bid.id]
            );
            bid.bidItems = bidItems;
        }

        tender.bids = bids;

        // Fetch evaluation criteria (knockout + scoring) for context
        const criteria = await dbAll(
            `SELECT id, criteria_title, criteria_description, is_knockout, minimum_requirement, weightage
             FROM tender_evaluation_criteria
             WHERE tender_id = ?
             ORDER BY is_knockout DESC, id ASC`,
            [tenderId]
        );
        tender.knockoutClauses = criteria.filter(c => c.is_knockout);
        tender.scoringCriteria = criteria.filter(c => !c.is_knockout);

        res.json(tender);
    } catch (error) {
        console.error('Error fetching tender details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Download technical bid document
const downloadTechnicalBid = async (req, res) => {
    const { bidId } = req.params;
    const user = req.user;

    // Check if user is from technical evaluation committee or purchase department
    const canDownload = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase().includes('technical evaluation')) ||
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canDownload) {
        return res.status(403).json({ message: 'You do not have permission to download technical bid documents' });
    }

    try {
        // Get bid details
        const bid = await dbGet('SELECT technical_bid_document FROM supplier_bids WHERE id = ?', [bidId]);

        if (!bid || !bid.technical_bid_document) {
            return res.status(404).json({ message: 'Technical bid document not found' });
        }

        const fs = require('fs');
        const path = require('path');
        // If we stored only filename, build absolute path inside uploads directory
        let filePath = bid.technical_bid_document;
        if (!path.isAbsolute(filePath)) {
            filePath = path.join(__dirname, '../../uploads', filePath);
        }
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Technical bid document file not found' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="technical-bid-${bidId}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error downloading technical bid:', error);
        res.status(500).json({ message: 'Failed to download technical bid document' });
    }
};

// Submit item-wise technical evaluation.
// evaluations: { [itemId]: { approvedCompanies: [{ bidId, knockoutChecks: { clauseId: bool } }],
//                            rejectedCompanies: [{ bidId, reason, knockoutChecks: [{ id, checked }], grievanceMarked }] } }
// scoring: { [bidId]: { total, breakdown } }
const submitItemWiseEvaluation = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { evaluations, scoring = {} } = req.body;
    const user = req.user;

    if (!evaluations || typeof evaluations !== 'object' || Object.keys(evaluations).length === 0) {
        return res.status(400).json({ message: 'Evaluation data is required' });
    }

    try {
        const tender = await dbGet('SELECT tender_status FROM demand_tenders WHERE id = ?', [tenderId]);
        if (!tender) return res.status(404).json({ message: 'Tender not found' });
        if (tender.tender_status !== 'expired') {
            return res.status(409).json({ message: 'This tender is not waiting for technical evaluation' });
        }

        // Validate everything before touching the stored evaluation.
        const bids = new Map((await dbAll('SELECT id, supplier_id FROM supplier_bids WHERE tender_id = ?', [tenderId])).map((b) => [String(b.id), b]));
        const score = (bidId) => {
            const entry = scoring[bidId];
            return {
                total: typeof entry?.total === 'number' ? entry.total : null,
                breakdown: entry?.breakdown ? JSON.stringify(entry.breakdown) : null,
            };
        };
        const rows = [];
        for (const [itemId, itemEval] of Object.entries(evaluations)) {
            for (const approved of itemEval.approvedCompanies || []) {
                const bid = bids.get(String(approved.bidId));
                if (!bid) return res.status(400).json({ message: `Bid ${approved.bidId} is not part of this tender` });
                if (!Object.values(approved.knockoutChecks || {}).every((passed) => passed === true)) {
                    return res.status(400).json({ message: 'A bid can only be approved when every knockout clause is satisfied', bidId: approved.bidId });
                }
                rows.push({ itemId, bid, status: 'approved', reason: null, knockoutOk: 1, failures: null, grievance: 0, ...score(approved.bidId) });
            }
            for (const rejected of itemEval.rejectedCompanies || []) {
                const bid = bids.get(String(rejected.bidId));
                if (!bid) return res.status(400).json({ message: `Bid ${rejected.bidId} is not part of this tender` });
                const failed = (Array.isArray(rejected.knockoutChecks) ? rejected.knockoutChecks : []).filter((k) => !k.checked).map((k) => k.id);
                rows.push({
                    itemId, bid, status: 'rejected', reason: rejected.reason || null,
                    knockoutOk: failed.length ? 0 : 1, failures: failed.length ? failed.join(',') : null,
                    grievance: rejected.grievanceMarked ? 1 : 0, ...score(rejected.bidId),
                });
            }
        }

        {
            await dbRun('DELETE FROM technical_evaluations WHERE tender_id = ?', [tenderId]);
            await dbRun('DELETE FROM temporary_approved_pools WHERE tender_id = ?', [tenderId]);

            for (const row of rows) {
                await dbRun(
                    `INSERT INTO technical_evaluations
                     (tender_id, item_id, bid_id, supplier_id, status, rejection_reason, evaluated_by, knockout_clauses_checked, knockout_clause_failures, grievance_marked, total_score, scoring_breakdown)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [tenderId, row.itemId, row.bid.id, row.bid.supplier_id, row.status, row.reason, user.id, row.knockoutOk, row.failures, row.grievance, row.total, row.breakdown],
                );
                if (row.status === 'approved') {
                    await dbRun(
                        'INSERT INTO temporary_approved_pools (tender_id, item_id, supplier_id, bid_id) VALUES (?, ?, ?, ?)',
                        [tenderId, row.itemId, row.bid.supplier_id, row.bid.id],
                    );
                }
            }

            await dbRun(
                `UPDATE demand_tenders SET tender_status = 'technically_evaluated',
                 technical_evaluation_completed_at = CURRENT_TIMESTAMP, technical_evaluation_completed_by = ?
                 WHERE id = ?`,
                [user.id, tenderId],
            );

            // Start grievance deadline timer
            await startGrievanceDeadlineTimer(db, tenderId);

            // Send email notifications to rejected suppliers

            // Process email notifications in the background
            setTimeout(async () => {
                try {
                    
                    for (const [itemId, itemEval] of Object.entries(evaluations)) {
                        // Get item name for the emails
                        let itemName = 'Unknown Item';
                        
                        // Find the item name from the tender details
                        const tender = await dbGet(`SELECT dt.*, d.item_name
                         FROM demand_tenders dt
                         JOIN demands d ON dt.demand_id = d.id
                         WHERE dt.id = ?`, [tenderId]);

                        if (tender) {
                            if (itemId === '0') {
                                // Legacy single-item tender
                                itemName = tender.item_name;
                            } else {
                                // Multi-item tender - get specific item name
                                const item = await dbGet('SELECT item_name FROM demand_items WHERE id = ?', [itemId]);
                                if (item) {
                                    itemName = item.item_name;
                                }
                            }
                        }

                        // Create grievance records for purchase department approval instead of sending emails directly
                        for (const rejected of itemEval.rejectedCompanies) {
                            try {
                                // Get supplier details from bid
                                const supplierDetails = await dbGet(`SELECT s.business_email as company_email,
                                        s.username,
                                        s.id as supplier_id,
                                        bp.business_name as company_name,
                                        bp.contact_person_name as contact_person
                                 FROM supplier_bids sb
                                 JOIN suppliers s ON sb.supplier_id = s.id
                                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                                 WHERE sb.id = ?`, [rejected.bidId]);

                                if (supplierDetails && supplierDetails.company_email) {
                                    
                                    // Insert into purchase_department_grievances table
                                    await dbRun(`INSERT INTO purchase_department_grievances 
                                     (tender_id, supplier_id, bid_id, item_name, rejection_reason, 
                                      supplier_email, supplier_name, contact_person) 
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                                        tenderId,
                                        supplierDetails.supplier_id,
                                        rejected.bidId,
                                        itemName,
                                        rejected.reason,
                                        supplierDetails.company_email,
                                        supplierDetails.company_name,
                                        supplierDetails.contact_person
                                    ]);
                                } else {
                                    console.warn(`⚠️ No email found for bid ID: ${rejected.bidId}`);
                                }
                            } catch (recordError) {
                                console.error(`❌ Failed to create grievance record for bid ${rejected.bidId}:`, recordError);
                                // Continue with other records even if one fails
                            }
                        }
                    }

                } catch (error) {
                    console.error('❌ Error creating grievance records:', error);
                }
            }, 1000); // Send emails 1 second after the response to avoid blocking

            // Generate Excel report after successful evaluation
            const excelFilePath = await generateTechnicalEvaluationReport(db, tenderId, evaluations);

            res.json({ 
                message: 'Technical evaluation completed successfully. Approved companies have been added to temporary pools for each item. Rejected companies\' grievance notifications have been sent to purchase department for approval.',
                tenderId: tenderId,
                reportFile: excelFilePath
            });
        }

    } catch (error) {
        console.error('Error submitting technical evaluation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Award tender to selected supplier
const awardTender = async (req, res) => {
    const { tenderId } = req.params;
    const { selectedBidId, remarks } = req.body;

    // Check if user is from technical evaluation committee

    if (!selectedBidId) {
        return res.status(400).json({ message: 'Selected bid ID is required' });
    }

    try {
        {
            // Get the winning bid details
            const winningBid = await dbGet(`SELECT sb.*, 
                    s.business_email as company_email,
                    s.username,
                    bp.business_name as company_name,
                    dt.demand_id, d.item_name
             FROM supplier_bids sb
             JOIN suppliers s ON sb.supplier_id = s.id
             LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
             JOIN demand_tenders dt ON sb.tender_id = dt.id
             JOIN demands d ON dt.demand_id = d.id
             WHERE sb.id = ? AND sb.tender_id = ?`, [selectedBidId, tenderId]);

            if (!winningBid) {
                throw new Error('Selected bid not found');
            }

            // Update tender status to awarded
            await dbRun(`UPDATE demand_tenders SET 
             tender_status = 'awarded', 
             awarded_supplier_id = ?, 
             awarded_bid_amount = ?,
             awarded_at = CURRENT_TIMESTAMP,
             evaluation_remarks = ?
             WHERE id = ?`, [winningBid.supplier_id, winningBid.total_cost, remarks, tenderId]);

            // Create supply order
            const orderNumber = `SO-${Date.now()}-${tenderId}`;
            await dbRun(`INSERT INTO supply_orders (
                order_number, demand_id, supplier_id, tender_id, bid_id,
                item_name, quantity, unit_price, total_amount, delivery_date, order_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(DATEADD(DAY, ?, GETDATE()) AS DATE), 'pending')`, [
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
            ]);

            res.json({
                message: `Tender awarded successfully to ${winningBid.company_name}`,
                awardedTo: winningBid.company_name,
                awardAmount: winningBid.total_cost
            });
        }

    } catch (error) {
        console.error('Error awarding tender:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Download generated evaluation report
const downloadEvaluationReport = async (req, res) => {
    const { fileName } = req.params;

    // Check if user is from technical evaluation committee

    try {
        // Route params arrive URL-decoded: "..%2F.env" must not escape the reports folder.
        const filePath = resolveInside(path.join(__dirname, '../../reports'), fileName);

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Report file not found' });
        }

        res.download(filePath, path.basename(filePath));
    } catch (error) {
        console.error('Error downloading evaluation report:', error);
        res.status(500).json({ message: 'Failed to download evaluation report' });
    }
};

/** Writes the committee's evaluation workbook (no prices: financial bids are still sealed). */
const generateTechnicalEvaluationReport = async (db, tenderId) => {
    const reportsDir = path.join(__dirname, '../../reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const fileName = `Technical_evaluation_${tenderId}_${Date.now()}.xlsx`;
    fs.writeFileSync(path.join(reportsDir, fileName), await buildEvaluationWorkbook(tenderId));
    return fileName;
};

// Start grievance deadline timer for a tender
const startGrievanceDeadlineTimer = async (db, tenderId) => {
    try {
        // Get the configured grievance deadline hours
        const config = await dbGet(
            "SELECT config_value FROM system_configurations WHERE config_key = 'grievance_deadline_hours'",
            []
        );

        const deadlineHours = config ? parseInt(config.config_value) : 72; // Default to 72 hours
        
        // Calculate deadline
        const deadlineStart = new Date();
        const deadlineEnd = new Date(deadlineStart.getTime() + (deadlineHours * 60 * 60 * 1000));

        // Insert or update grievance deadline
        await dbRun(`INSERT OR REPLACE INTO grievance_deadlines 
         (tender_id, deadline_start, deadline_end, is_active) 
         VALUES (?, ?, ?, 1)`, [tenderId, deadlineStart, deadlineEnd]);

        // Schedule automatic deadline expiry check
        scheduleGrievanceDeadlineCheck(tenderId, deadlineEnd);

    } catch (error) {
        console.error('Error starting grievance deadline timer:', error);
        throw error;
    }
};

// Schedule automatic grievance deadline expiry check
const scheduleGrievanceDeadlineCheck = (tenderId, deadlineEnd) => {
    const now = new Date();
    const timeUntilDeadline = deadlineEnd.getTime() - now.getTime();

    if (timeUntilDeadline > 0) {
        setTimeout(async () => {
            await processExpiredGrievanceDeadline(tenderId);
        }, timeUntilDeadline);

    } else {
        // Deadline has already passed, process immediately
        setImmediate(async () => {
            await processExpiredGrievanceDeadline(tenderId);
        });
    }
};

// Process expired grievance deadline
const processExpiredGrievanceDeadline = async (tenderId) => {
    try {
        // Mark grievance deadline as inactive
        await dbRun(
            'UPDATE grievance_deadlines SET is_active = 0 WHERE tender_id = ? AND is_active = 1',
            [tenderId]
        );

        // Get all rejected suppliers who haven't submitted grievances
        const rejectedSuppliers = await dbAll(
            `SELECT DISTINCT te.supplier_id, te.tender_id, te.item_id, te.rejection_reason,
                    s.business_email as company_email,
                    s.username,
                    bp.business_name as company_name,
                    bp.contact_person_name as contact_person,
                    di.item_name,
                    dt.demand_id
             FROM technical_evaluations te
             JOIN suppliers s ON te.supplier_id = s.id
             LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
             LEFT JOIN demand_items di ON te.item_id = di.id
             LEFT JOIN demand_tenders dt ON te.tender_id = dt.id
             LEFT JOIN demands d ON dt.demand_id = d.id
             WHERE te.tender_id = ? 
               AND te.status = 'rejected'
               AND NOT EXISTS (
                   SELECT 1 FROM grievance_applications ga 
                   WHERE ga.supplier_id = te.supplier_id 
                     AND ga.tender_id = te.tender_id 
                     AND ga.item_id = te.item_id
               )`,
            [tenderId]
        );

        // Send deadline expiry emails and create automatic rejection records
        const EmailService = require('../utils/emailService');
        const emailService = new EmailService();

        for (const supplier of rejectedSuppliers) {
            try {
                // Get proper item name
                let itemName = supplier.item_name;
                if (!itemName && supplier.item_id === 0) {
                    // Legacy single-item tender
                    const tender = await dbGet(
                        'SELECT d.item_name FROM demand_tenders dt JOIN demands d ON dt.demand_id = d.id WHERE dt.id = ?',
                        [tenderId]
                    );
                    itemName = tender ? tender.item_name : 'Unknown Item';
                }

                // Create automatic grievance rejection record
                await dbRun(`INSERT INTO grievance_applications 
                 (technical_evaluation_id, supplier_id, tender_id, item_id, 
                  grievance_reason, status, submitted_at, resolution)
                 VALUES (?, ?, ?, ?, ?, 'rejected', CURRENT_TIMESTAMP, ?)`, [
                    0, // No actual technical evaluation ID since it wasn't submitted
                    supplier.supplier_id,
                    supplier.tender_id,
                    supplier.item_id,
                    'Deadline expired - No grievance submitted',
                    'Automatic rejection due to missed deadline. Supplier did not submit grievance application within the required timeframe.'
                ]);

                // Send deadline expiry email
                if (supplier.company_email) {
                    await emailService.sendGrievanceDeadlineExpiredEmail(
                        supplier.company_email,
                        supplier.company_name,
                        itemName,
                        supplier.contact_person
                    );
                    
                }

            } catch (error) {
                console.error(`❌ Error processing expired deadline for supplier ${supplier.supplier_id}:`, error);
            }
        }

    } catch (error) {
        console.error(`❌ Error processing expired grievance deadline for tender ${tenderId}:`, error);
    }
};

module.exports = {
    getExpiredTenders,
    getTenderDetails,
    downloadTechnicalBid,
    submitItemWiseEvaluation,
    awardTender,
    downloadEvaluationReport,
    startGrievanceDeadlineTimer,
    processExpiredGrievanceDeadline
};
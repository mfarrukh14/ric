const { getDatabase, dbAll, dbGet, dbRun } = require('../db');
const path = require('path');
const fs = require('fs');
const { resolveInside } = require('../utils/files');
const { parseInstant } = require('../utils/time');
const { analyseBids, bestCombinations, buildFinancialReport } = require('../reports/financialReport');
const { safeFileName } = require('../reports/brand');


// Get tenders ready for financial opening
const getTendersReadyForFinancialOpening = async (req, res) => {
    try {
        const db = getDatabase();
        
        const query = `
            SELECT 
                dt.id,
                dt.tender_number,
                dt.demand_id,
                dt.bidding_end_time,
                dt.technical_evaluation_completed_at,
                dt.tender_status,
                d.item_name,
                d.description,
                d.urgency,
                d.required_by,
                u.name as created_by_name,
                dept.name as creator_department,
                COUNT(DISTINCT sb.id) as total_bids,
                COUNT(DISTINCT te.id) as evaluated_bids,
                fo.scheduled_opening_time,
                fo.status as opening_status,
                fo.opened_at,
                fo.opened_by,
                COUNT(DISTINCT ga.id) as total_grievances,
                COUNT(DISTINCT CASE WHEN ga.status NOT IN ('resolved', 'rejected') THEN ga.id END) as unresolved_grievances,
                COUNT(DISTINCT CASE WHEN ga.status = 'resolved' THEN ga.id END) as resolved_grievances_count,
                COUNT(DISTINCT CASE WHEN ga.status = 'rejected' THEN ga.id END) as rejected_grievances_count,
                fg.id as financial_grievance_id,
                fg.meeting_datetime as grievance_meeting_datetime,
                fg.status as grievance_status,
                fg.created_at as grievance_sent_at,
                CASE WHEN fo.status = 'opened' THEN 1 ELSE 0 END as is_financially_opened
            FROM demand_tenders dt
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN users u ON d.created_by = u.id
            LEFT JOIN departments dept ON u.department_id = dept.id
            LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id
            LEFT JOIN technical_evaluations te ON sb.id = te.bid_id AND te.status = 'approved'
            LEFT JOIN financial_openings fo ON dt.id = fo.tender_id
            LEFT JOIN grievance_applications ga ON dt.id = ga.tender_id
            LEFT JOIN financial_grievances fg ON dt.id = fg.tender_id
            WHERE dt.technical_evaluation_completed_at IS NOT NULL
            AND dt.tender_status NOT IN ('awarded', 'cancelled')
            GROUP BY dt.id, dt.tender_number, dt.demand_id, dt.bidding_end_time,
                dt.technical_evaluation_completed_at, dt.tender_status, dt.created_at,
                d.item_name, d.description, d.urgency, d.required_by,
                u.name, dept.name,
                fo.scheduled_opening_time, fo.status, fo.opened_at, fo.opened_by,
                fg.id, fg.meeting_datetime, fg.status, fg.created_at
            HAVING COUNT(DISTINCT te.id) > 0
            AND COUNT(DISTINCT CASE WHEN ga.status NOT IN ('resolved', 'rejected') THEN ga.id END) = 0
            ORDER BY 
                CASE WHEN fo.status = 'opened' THEN 0 ELSE 1 END,
                dt.created_at DESC
        `;

        db.all(query, [], (err, tenders) => {
            if (err) {
                console.error('Error fetching tenders ready for financial opening:', err);
                return res.status(500).json({ error: 'Failed to fetch tenders' });
            }

            // Enhance tenders with additional information
            const enhancedTenders = tenders.map(tender => {
                const financial_opening = tender.scheduled_opening_time ? {
                    scheduled_opening_time: tender.scheduled_opening_time,
                    status: tender.opening_status,
                    opened_at: tender.opened_at
                } : null;

                const financial_grievance_details = tender.financial_grievance_id ? {
                    meeting_datetime: tender.grievance_meeting_datetime,
                    status: tender.grievance_status,
                    sent_at: tender.grievance_sent_at
                } : null;

                return {
                    ...tender,
                    financial_opening,
                    financial_grievance_details,
                    grievances_count: tender.total_grievances || 0,
                    resolved_grievances_count: tender.resolved_grievances_count || 0,
                    rejected_grievances_count: tender.rejected_grievances_count || 0
                };
            });

            res.json(enhancedTenders);
        });
    } catch (error) {
        console.error('Error in getTendersReadyForFinancialOpening:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Schedule financial opening for a tender
const scheduleFinancialOpening = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { scheduledDateTime, openingDateTime } = req.body;
        const userId = req.user.id;

        // Use scheduledDateTime or openingDateTime (for compatibility)
        const finalDateTime = scheduledDateTime || openingDateTime;

        if (!finalDateTime) {
            return res.status(400).json({ error: 'Scheduled date and time is required' });
        }
        const dateTime = parseInstant(finalDateTime);
        if (!dateTime) {
            return res.status(400).json({ error: 'Invalid date and time' });
        }

        const tender = await dbGet('SELECT tender_status FROM demand_tenders WHERE id = ?', [tenderId]);
        if (!tender) return res.status(404).json({ error: 'Tender not found' });
        if (tender.tender_status !== 'technically_evaluated') {
            return res.status(409).json({ error: 'This tender is not ready for financial opening' });
        }

        const existingOpening = await dbGet(
            'SELECT id, scheduled_opening_time, status FROM financial_openings WHERE tender_id = ?',
            [tenderId]
        );
        if (existingOpening?.status === 'opened') {
            return res.status(409).json({ error: 'The financial bids have already been opened' });
        }

        if (existingOpening) {
            
            // Update existing schedule instead of creating new one
            await dbRun(`UPDATE financial_openings 
             SET scheduled_opening_time = ?, scheduled_by = ?, status = 'scheduled'
             WHERE tender_id = ?`, [dateTime, userId, tenderId]);

            return res.json({ 
                message: 'Financial opening schedule updated successfully',
                scheduledDateTime: dateTime.toISOString(),
                action: 'updated'
            });
        }

        // Insert financial opening schedule
        await dbRun(`INSERT INTO financial_openings 
        (tender_id, scheduled_opening_time, scheduled_by, status) 
        VALUES (?, ?, ?, 'scheduled')`, [tenderId, dateTime, userId]).then(result => result.lastID);

        res.json({ 
            message: 'Financial opening scheduled successfully',
            scheduledDateTime: dateTime.toISOString(),
            action: 'created'
        });

    } catch (error) {
        console.error('Error scheduling financial opening:', error);
        res.status(500).json({ error: 'Failed to schedule financial opening' });
    }
};

// Get scheduled financial openings
const getScheduledFinancialOpenings = async (req, res) => {
    try {
        const db = getDatabase();
        
        const query = `
            SELECT 
                fo.id,
                fo.tender_id,
                fo.scheduled_opening_time,
                fo.status,
                fo.opened_at,
                fo.opened_by,
                dt.tender_number,
                d.item_name,
                d.description,
                u1.name as scheduled_by_name,
                u2.name as opened_by_name,
                COUNT(sb.id) as total_bids
            FROM financial_openings fo
            JOIN demand_tenders dt ON fo.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN users u1 ON fo.scheduled_by = u1.id
            LEFT JOIN users u2 ON fo.opened_by = u2.id
            LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id
            GROUP BY fo.id, fo.tender_id, fo.scheduled_opening_time, fo.status,
                fo.opened_at, fo.opened_by, dt.tender_number,
                d.item_name, d.description, u1.name, u2.name, fo.scheduled_by
            ORDER BY fo.scheduled_opening_time DESC
        `;

        db.all(query, [], (err, openings) => {
            if (err) {
                console.error('Error fetching scheduled financial openings:', err);
                return res.status(500).json({ error: 'Failed to fetch scheduled openings' });
            }

            // Separate into ready to open and future scheduled
            const now = new Date();
            const readyToOpen = openings.filter(opening => 
                opening.status === 'scheduled' && new Date(opening.scheduled_opening_time) <= now
            );
            const scheduledFuture = openings.filter(opening => 
                opening.status === 'scheduled' && new Date(opening.scheduled_opening_time) > now
            );
            const opened = openings.filter(opening => opening.status === 'opened');

            res.json({
                ready_to_open: readyToOpen,
                scheduled_future: scheduledFuture,
                opened: opened
            });
        });
    } catch (error) {
        console.error('Error in getScheduledFinancialOpenings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Open financial bids and display comparative analysis (no automatic award)
const openFinancialBids = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const userId = req.user.id;

        // Financial bids stay sealed until the scheduled opening time. Once opened,
        // calling this again just rebuilds the comparison.
        const opening = await dbGet('SELECT status, scheduled_opening_time FROM financial_openings WHERE tender_id = ?', [tenderId]);
        if (!opening || opening.status === 'cancelled') {
            return res.status(409).json({ error: 'Schedule the financial opening first' });
        }
        if (opening.status === 'scheduled') {
            if (new Date(opening.scheduled_opening_time) > new Date()) {
                return res.status(409).json({ error: 'Financial bids cannot be opened before the scheduled time' });
            }
            await dbRun(
                "UPDATE financial_openings SET status = 'opened', opened_at = CURRENT_TIMESTAMP, opened_by = ? WHERE tender_id = ?",
                [userId, tenderId]
            );
        }

        // Approved (bid, item) pairs: technical approval is per item, so join it per item.
        const rows = await dbAll(
            `SELECT sb.id AS bid_id, sb.supplier_id, sb.delivery_days,
                    sbp.business_name,
                    sbi.item_id, sbi.item_name, sbi.required_quantity, sbi.proposed_quantity AS item_proposed_quantity,
                    sbi.unit_price, sbi.total_cost AS item_total_cost, sbi.unit, sbi.manufacturer_brand,
                    di.specifications
             FROM supplier_bids sb
             JOIN supplier_bid_items sbi ON sbi.bid_id = sb.id
             JOIN technical_evaluations te ON te.bid_id = sb.id AND te.item_id = sbi.item_id AND te.status = 'approved'
             LEFT JOIN supplier_business_profile sbp ON sbp.supplier_id = sb.supplier_id
             LEFT JOIN demand_items di ON di.id = sbi.item_id
             WHERE sb.tender_id = ?
             ORDER BY sbi.item_id, sbi.unit_price`,
            [tenderId],
        );

        const items = analyseBids(rows);
        const combinations = bestCombinations(items, 10);

        const tenderInfo = await dbGet(
            `SELECT dt.id, dt.tender_number, d.item_name, fo.opened_at
             FROM demand_tenders dt JOIN demands d ON d.id = dt.demand_id
             LEFT JOIN financial_openings fo ON fo.tender_id = dt.id
             WHERE dt.id = ?`,
            [tenderId],
        );
        const buffer = await buildFinancialReport(tenderInfo, items, combinations);
        const reportsDir = path.join(__dirname, '../../financial-reports');
        fs.mkdirSync(reportsDir, { recursive: true });
        const reportFileName = `Comparative_statement_${safeFileName(tenderInfo.tender_number || tenderId)}_${Date.now()}.xlsx`;
        fs.writeFileSync(path.join(reportsDir, reportFileName), buffer);
        await dbRun(
            `INSERT INTO financial_opening_reports (tender_id, report_file_path, original_filename, file_size, generated_by)
             VALUES (?, ?, ?, ?, ?)`,
            [tenderId, reportFileName, reportFileName, buffer.length, userId],
        ).catch((err) => console.error('Error saving report info:', err));

        res.json({
            message: 'Financial bids opened',
            comparative_analysis: items,
            optimal_combinations: combinations,
            report_file: reportFileName,
            total_items: items.length,
            opened_at: new Date().toISOString(),
        });

    } catch (error) {
        console.error('Error opening financial bids:', error);
        res.status(500).json({ error: 'Failed to open financial bids' });
    }
};

// Download financial bid document
const downloadFinancialBid = async (req, res) => {
    try {
        const { bidId } = req.params;

        const bid = await dbGet('SELECT financial_bid_document FROM supplier_bids WHERE id = ?', [bidId]);

        if (!bid || !bid.financial_bid_document) {
            return res.status(404).json({ error: 'Financial bid document not found' });
        }

        const filePath = path.join(__dirname, '../../uploads', bid.financial_bid_document);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath, `financial-bid-${bidId}.pdf`);
    } catch (error) {
        console.error('Error downloading financial bid:', error);
        res.status(500).json({ error: 'Failed to download financial bid' });
    }
};

// Download bid CDR document
const downloadBidCdrDocument = async (req, res) => {
    try {
        const { bidId } = req.params;

        const bid = await dbGet('SELECT bid_cdr_document FROM supplier_bids WHERE id = ?', [bidId]);

        if (!bid || !bid.bid_cdr_document) {
            return res.status(404).json({ error: 'Bid CDR document not found' });
        }

        const filePath = path.join(__dirname, '../../uploads', bid.bid_cdr_document);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath, `bid-cdr-${bidId}.pdf`);
    } catch (error) {
        console.error('Error downloading bid CDR document:', error);
        res.status(500).json({ error: 'Failed to download bid CDR document' });
    }
};

// Download financial opening report
const downloadFinancialOpeningReport = async (req, res) => {
    try {
        const { fileName } = req.params;
        // Route params arrive URL-decoded: "..%2F.env" must not escape the reports folder.
        const filePath = resolveInside(path.join(__dirname, '../../financial-reports'), fileName);

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Report file not found' });
        }

        res.download(filePath, fileName);
    } catch (error) {
        console.error('Error downloading financial opening report:', error);
        res.status(500).json({ error: 'Failed to download report' });
    }
};

module.exports = {
    getTendersReadyForFinancialOpening,
    scheduleFinancialOpening,
    getScheduledFinancialOpenings,
    openFinancialBids,
    downloadFinancialBid,
    downloadBidCdrDocument,
    downloadFinancialOpeningReport
};

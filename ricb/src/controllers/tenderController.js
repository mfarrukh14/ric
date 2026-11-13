const { getDatabase, dbAll, dbGet, dbRun } = require('../db');
const { calendarDate, clockTime, parseInstant } = require('../utils/time');
const { buildOpeningReport } = require('../reports/openingReport');
const path = require('path');
const fs = require('fs');
const { getFieldValuesByItemIds, formatItemFields } = require('../utils/itemFieldFormatter');

// Generate unique tender number
const generateTenderNumber = async () => {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    
    // Get count of tenders created today
    const todayStart = `${year}-${month}-${day} 00:00:00`;
    const todayEnd = `${year}-${month}-${day} 23:59:59`;
    
    const todayCount = await dbGet(`SELECT COUNT(*) as count FROM demand_tenders 
     WHERE created_at >= ? AND created_at <= ?`, [todayStart, todayEnd]).then(row => row.count);
    
    // Generate sequential number for today (starting from 001)
    const sequentialNumber = String(todayCount + 1).padStart(3, '0');
    
    // Format: RIC-DDMMYYYY-XXX (e.g., RIC-12082025-001)
    const tenderNumber = `RIC-${day}${month}${year}-${sequentialNumber}`;
    
    // Check if this number already exists (very unlikely but safety check)
    const exists = await dbGet('SELECT id FROM demand_tenders WHERE tender_number = ?', [tenderNumber]).then(row => !!row);
    
    if (exists) {
        // If somehow it exists, add a random suffix
        const randomSuffix = Math.floor(Math.random() * 99) + 1;
        return `${tenderNumber}-${String(randomSuffix).padStart(2, '0')}`;
    }
    
    return tenderNumber;
};

// Mark expired tenders for purchase department opening (modified function)
const markExpiredTendersForOpening = async () => {
    try {
        // Active tenders whose deadline has passed (stored and compared in UTC).
        const expiredTenders = await dbAll(`SELECT dt.*, d.item_name, d.description, d.urgency
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         WHERE dt.tender_status = 'active'
         AND dt.bidding_end_time <= ?
         ORDER BY dt.bidding_end_time ASC`, [new Date()]);

        if (expiredTenders.length === 0) {
            return 0; // No expired tenders to process
        }

        // Update status to 'pending_opening' for purchase department
        for (const tender of expiredTenders) {
            try {
                await dbRun(
                    'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                    ['pending_opening', tender.id]
                );
            } catch (error) {
                console.error(`Error marking tender ${tender.id} as pending opening:`, error);
            }
        }

        return expiredTenders.length;
    } catch (error) {
        console.error('Error marking expired tenders for opening:', error);
        throw error;
    }
};

// Create tender with evaluation criteria (new endpoint for multi-step wizard)
const createTenderWithCriteria = async (req, res) => {
    
    try {
        const { demandId, biddingEndTime, minimumSuppliers, evaluationCriteria } = req.body;
        const createdBy = req.user.id;
        
        // Parse evaluation criteria if it's a string
        let parsedCriteria = [];
        try {
            parsedCriteria = typeof evaluationCriteria === 'string' 
                ? JSON.parse(evaluationCriteria) 
                : evaluationCriteria || [];
        } catch (parseError) {
            console.error('Error parsing evaluation criteria:', parseError);
            return res.status(400).json({ message: 'Invalid evaluation criteria format' });
        }

        // Validate required fields
        if (!demandId || !biddingEndTime) {
            return res.status(400).json({ message: 'Demand ID and bidding end time are required' });
        }

        // Parse into a real Date so the driver binds it as a proper SQL datetime
        // parameter instead of a raw string - MSSQL's implicit string->datetime
        // conversion can reject perfectly valid ISO strings (e.g. without
        // seconds) with "Conversion failed when converting date and/or time
        // from character string."
        const biddingEndDate = parseInstant(biddingEndTime);
        if (!biddingEndDate) {
            return res.status(400).json({ message: 'Invalid bidding end time' });
        }
        // Must leave suppliers at least a 2-minute window to respond.
        if (biddingEndDate.getTime() < Date.now() + 2 * 60 * 1000) {
            return res.status(400).json({ message: 'Bidding end time must be at least 2 minutes from now' });
        }

        const demand = await dbGet('SELECT status FROM demands WHERE id = ?', [demandId]);
        if (!demand) return res.status(404).json({ message: 'Demand not found' });
        if (demand.status !== 'purchase_pending') {
            return res.status(409).json({ message: 'This demand is not waiting for a tender' });
        }

        // Check if tender already exists for this demand
        const existingTender = await dbGet('SELECT id FROM demand_tenders WHERE demand_id = ?', [demandId]);

        if (existingTender) {
            return res.status(400).json({ message: 'Tender already exists for this demand' });
        }

        // Handle file uploads
        let tenderDocumentPath = null;
        let itemsListPath = null;

        if (req.files?.tenderDocument) {
            tenderDocumentPath = req.files.tenderDocument[0].path;
        }
        
        if (req.files?.itemsList) {
            itemsListPath = req.files.itemsList[0].path;
        }

        {
            // Generate unique tender number
            const tenderNumber = await generateTenderNumber();
            
            // Create tender
            const tenderResult = await dbRun(`INSERT INTO demand_tenders (
                demand_id, bidding_end_time, minimum_suppliers, 
                tender_document_path, items_list_path, created_by,
                tender_status, tender_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                demandId,
                biddingEndDate,
                minimumSuppliers || 3,
                tenderDocumentPath,
                itemsListPath,
                createdBy,
                'pending_purchase_hod_approval',
                tenderNumber
            ]).then(result => ({
                tenderId: result.lastID,
                tenderNumber
            }));

            const tenderId = tenderResult.tenderId;

            // Update demand status to indicate tender has been created
            await dbRun(`UPDATE demands SET 
             status = 'tender_created',
             purchase_response = 'Tender created and published',
             purchase_response_by = ?,
             purchase_response_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`, [createdBy, demandId]);

            // Add evaluation criteria
            for (const criteria of parsedCriteria) {
                await dbRun(`INSERT INTO tender_evaluation_criteria (
                    tender_id, criteria_title, criteria_description,
                    is_knockout, minimum_requirement, weightage, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                    tenderId,
                    criteria.title,
                    criteria.description,
                    criteria.isKnockout ? 1 : 0,
                    criteria.minimumRequirement || null,
                    criteria.weightage || 0,
                    createdBy
                ]);
            }

            // Add status history
            await dbRun(`INSERT INTO tender_status_history (
                tender_id, status, comments, changed_by
            ) VALUES (?, ?, ?, ?)`, [tenderId, 'pending_purchase_hod_approval', 'Tender created and submitted for Purchase HOD approval', createdBy]);

            // Get complete tender data
            const completeData = await dbGet(`SELECT dt.*, d.item_name, d.description as demand_description
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             WHERE dt.id = ?`, [tenderId]);

            res.status(201).json({
                message: 'Tender created successfully',
                tender: {
                    id: tenderId,
                    tender_number: tenderResult.tenderNumber,
                    ...completeData,
                    evaluationCriteriaCount: parsedCriteria.length
                }
            });
        }

    } catch (error) {
        console.error('Error creating tender:', error);
        res.status(500).json({ 
            message: 'Failed to create tender', 
            error: error.message 
        });
    }
};

// Get tender details with evaluation criteria for suppliers
const getTenderWithCriteria = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const supplierId = req.user?.id; // Get from auth middleware

    try {
        // Get tender details
        const tender = await dbGet(`SELECT dt.*, d.description, d.description as demand_description, d.urgency, d.required_by, d.item_name
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         WHERE dt.id = ? AND dt.tender_status = 'active'`, [tenderId]);

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not active' });
        }

        // Get demand items for this tender (only unfulfilled items) with category info
        const items = await dbAll(`SELECT di.*,
                ic.name as category_name,
                in_t.name as item_name_full
         FROM demand_items di
         LEFT JOIN item_categories ic ON di.category_id = ic.id
         LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
         WHERE di.demand_id = ?
         AND (di.store_fulfilled IS NULL OR di.store_fulfilled = 0)
         AND (di.is_removed IS NULL OR di.is_removed = 0)
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

        // Get evaluation criteria
        const criteria = await dbAll(`SELECT id, criteria_title, criteria_description, is_knockout,
                minimum_requirement, weightage
         FROM tender_evaluation_criteria
         WHERE tender_id = ?
         ORDER BY is_knockout DESC, id ASC`, [tenderId]);

        // Record supplier view if supplierId is available
        if (supplierId) {
            try {
                await dbRun(`INSERT OR REPLACE INTO supplier_tender_views 
                 (tender_id, supplier_id, viewed_at) VALUES (?, ?, datetime('now'))`, [tenderId, supplierId]);
            } catch (viewError) {
                console.error('Error recording supplier view:', viewError);
            }
        }

        // Format criteria for frontend
        const knockoutClauses = criteria.filter(c => c.is_knockout);
        const scoringCriteria = criteria.filter(c => !c.is_knockout);

        // Fetch supplier acknowledgment details if supplier context
        let criteriaAcknowledged = 0;
        let supplierKnockoutChecklist = null;
        if (supplierId) {
            try {
                const ackRow = await dbGet(
                    `SELECT criteria_acknowledged FROM supplier_tender_views WHERE tender_id = ? AND supplier_id = ?`,
                    [tenderId, supplierId]
                );
                if (ackRow) criteriaAcknowledged = ackRow.criteria_acknowledged || 0;
                const koAck = await dbGet(
                    `SELECT all_clauses_checked, checklist FROM supplier_knockout_acknowledgments WHERE tender_id = ? AND supplier_id = ?`,
                    [tenderId, supplierId]
                );
                if (koAck) {
                    supplierKnockoutChecklist = {
                        all_clauses_checked: koAck.all_clauses_checked,
                        checklist: (() => { try { return JSON.parse(koAck.checklist); } catch { return []; } })()
                    };
                }
            } catch (ackErr) {
                console.error('Error fetching supplier acknowledgment data:', ackErr.message);
            }
        }

        res.json({
            tender: {
                ...tender,
                items: formattedItems,
                knockoutClauses,
                scoringCriteria,
                totalCriteria: criteria.length,
                criteria_acknowledged: criteriaAcknowledged === 1,
                supplier_knockout_ack: supplierKnockoutChecklist
            }
        });

    } catch (error) {
        console.error('Error fetching tender with criteria:', error);
        res.status(500).json({ 
            message: 'Failed to fetch tender details', 
            error: error.message 
        });
    }
};

// Acknowledge evaluation criteria by supplier
const acknowledgeCriteria = async (req, res) => {
    const { tenderId } = req.params;
    const supplierId = req.user.id;

    try {
        const tender = await dbGet(
            "SELECT id FROM demand_tenders WHERE id = ? AND tender_status = 'active' AND bidding_end_time > ?",
            [tenderId, new Date()],
        );
        if (!tender) return res.status(404).json({ message: 'Tender not found or no longer accepting bids' });

        const knockoutDocuments = [];
        
        // Process uploaded files - each file has a field name like 'knockoutDoc_0', 'knockoutDoc_1', etc.
        if (req.files && Array.isArray(req.files)) {
            req.files.forEach(file => {
                if (file.fieldname && file.fieldname.startsWith('knockoutDoc_')) {
                    const clauseIndex = parseInt(file.fieldname.split('_')[1]);
                    
                    knockoutDocuments.push({
                        clauseIndex: clauseIndex,
                        originalName: file.originalname,
                        fileName: file.filename,
                        filePath: file.path,
                        fileSize: file.size,
                        mimeType: file.mimetype
                    });
                }
            });
        }

        // Store knockout clause documents in database
        if (knockoutDocuments.length > 0) {
            // Replace any documents from a previous acknowledgment attempt for this tender/supplier
            await dbRun(
                `DELETE FROM knockout_clause_documents WHERE tender_id = ? AND supplier_id = ?`,
                [tenderId, supplierId]
            );

            for (const doc of knockoutDocuments) {
                await dbRun(`INSERT INTO knockout_clause_documents
                 (tender_id, supplier_id, clause_id, document_filename, original_filename, uploaded_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [
                    tenderId,
                    supplierId,
                    doc.clauseIndex,
                    doc.fileName,
                    doc.originalName
                ]);
            }

            // Update supplier_knockout_acknowledgments with document submission status
            const checklist = JSON.stringify({ documentsUploaded: knockoutDocuments.length });
            const existingAck = await dbGet(
                `SELECT id FROM supplier_knockout_acknowledgments WHERE tender_id = ? AND supplier_id = ?`,
                [tenderId, supplierId]
            );

            if (existingAck) {
                await dbRun(`UPDATE supplier_knockout_acknowledgments
                 SET all_clauses_checked = ?, checklist = ?, acknowledged_at = CURRENT_TIMESTAMP
                 WHERE tender_id = ? AND supplier_id = ?`, [1, checklist, tenderId, supplierId]);
            } else {
                await dbRun(
                    `INSERT INTO supplier_knockout_acknowledgments (tender_id, supplier_id, all_clauses_checked, checklist)
                     VALUES (?, ?, ?, ?)`,
                    [tenderId, supplierId, 1, checklist]
                );
            }
        }

        // Update legacy acknowledgement flag - only after documents (if any) are safely stored,
        // so a failed upload doesn't leave the tender falsely marked as acknowledged.
        await dbRun(`UPDATE supplier_tender_views
         SET criteria_acknowledged = 1
         WHERE tender_id = ? AND supplier_id = ?`, [tenderId, supplierId]);

        res.json({
            message: 'Evaluation criteria acknowledged and knockout clause documents uploaded successfully',
            documentsUploaded: knockoutDocuments.length
        });

    } catch (error) {
        console.error('Error acknowledging criteria:', error);
        res.status(500).json({ 
            message: 'Failed to acknowledge criteria and upload documents', 
            error: error.message 
        });
    }
};

// Get tenders pending opening for purchase department
const getTendersPendingOpening = async (req, res) => {

    try {
        // Get tenders that are pending opening
        const pendingTenders = await dbAll(`SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                u.name as created_by_name, dept.name as creator_department,
                (SELECT COUNT(*) FROM supplier_bids WHERE tender_id = dt.id) as bid_count
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         WHERE dt.tender_status = 'pending_opening'
         ORDER BY dt.bidding_end_time ASC`, []);

        // For each tender, get the supplier bids
        for (const tender of pendingTenders) {
            const bids = await dbAll(`SELECT sb.*, 
                    bp.business_name as company_name, 
                    s.business_email as company_email, 
                    bp.business_mobile_number as contact_phone
             FROM supplier_bids sb
             JOIN suppliers s ON sb.supplier_id = s.id
             LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
             WHERE sb.tender_id = ? AND s.status = 'approved'
             ORDER BY sb.total_cost ASC`, [tender.id]);
            tender.bids = bids;
        }

        res.json(pendingTenders);
    } catch (error) {
        console.error('Error fetching tenders pending opening:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get single tender opening details for purchase department
const getTenderOpeningDetails = async (req, res) => {
    const { tenderId } = req.params;

    try {
        // Get tender details
        const tender = await dbGet(`SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                u.name as created_by_name, dept.name as creator_department
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         WHERE dt.id = ? AND dt.tender_status IN ('pending_opening', 'expired', 'technically_evaluated', 'awarded')`, [tenderId]);

        // Available once bidding has closed (also later, for the record).
        if (!tender) {
            return res.status(404).json({ message: 'Bidding has not closed for this tender' });
        }

        // Get supplier bids (without cost information for confidentiality)
        const bids = await dbAll(`SELECT sb.id, sb.supplier_id, sb.proposed_quantity, sb.delivery_days, 
                sb.bid_comments, sb.created_at,
                bp.business_name as company_name, 
                s.business_email as company_email, 
                bp.business_mobile_number as contact_phone
         FROM supplier_bids sb
         JOIN suppliers s ON sb.supplier_id = s.id
         LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
         WHERE sb.tender_id = ? AND s.status = 'approved'
         ORDER BY sb.created_at ASC`, [tenderId]);

        tender.bids = bids;

        res.json(tender);
    } catch (error) {
        console.error('Error fetching tender opening details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate tender opening report PDF
const generateTenderOpeningReport = async (req, res) => {
    const { tenderId } = req.params;
    const user = req.user;

    try {
        // Get tender details with bids
        const tender = await dbGet(`SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                u.name as created_by_name, dept.name as creator_department
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         WHERE dt.id = ? AND dt.tender_status = 'pending_opening'`, [tenderId]);

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending opening' });
        }

        // Get supplier bids (without cost information)
        const bids = await dbAll(`SELECT sb.id, sb.supplier_id, sb.proposed_quantity, sb.delivery_days, 
                sb.bid_comments, sb.created_at,
                bp.business_name as company_name, 
                s.business_email as company_email, 
                bp.business_mobile_number as contact_phone,
                bp.business_entity_type, bp.origin_classification
         FROM supplier_bids sb
         JOIN suppliers s ON sb.supplier_id = s.id
         LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
         WHERE sb.tender_id = ? AND s.status = 'approved'
         ORDER BY sb.created_at ASC`, [tenderId]);

        const { buffer, filename } = await buildOpeningReport({ tender, bids, generatedBy: user.name });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating tender opening report:', error);
        res.status(500).json({ message: 'Failed to generate opening report' });
    }
};

// Open tender for technical evaluation
const openTender = async (req, res) => {
    const { tenderId } = req.params;
    const user = req.user;

    try {
        // Verify tender exists and is pending opening
        const tender = await dbGet(
            'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ?',
            [tenderId, 'pending_opening']
        );

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending opening' });
        }

        // Update tender status to 'expired' (for technical evaluation)
        await dbRun(`UPDATE demand_tenders 
         SET tender_status = 'expired', 
             opened_by = ?, 
             opened_at = datetime('now')
         WHERE id = ?`, [user.id, tenderId]);

        res.json({ 
            message: 'Tender opened and forwarded to technical evaluation committee successfully',
            tenderId 
        });
    } catch (error) {
        console.error('Error opening tender:', error);
        res.status(500).json({ message: 'Failed to open tender' });
    }
};

// Get published tenders that can have pre-bid meetings scheduled
const getPublishedTenders = async (req, res) => {

    try {
        const publishedTenders = await dbAll(`SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                u.name as created_by_name, dept.name as creator_department,
                pbm.id as meeting_id, pbm.status as meeting_status,
                pbm.meeting_date, pbm.meeting_time
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         LEFT JOIN users u ON d.created_by = u.id
         LEFT JOIN departments dept ON u.department_id = dept.id
         LEFT JOIN pre_bid_meetings pbm ON dt.id = pbm.tender_id
         WHERE dt.tender_status = 'active'
         ORDER BY dt.created_at DESC`, []);

        const tenders = publishedTenders.map((t) => ({ ...t, meeting_date: calendarDate(t.meeting_date), meeting_time: clockTime(t.meeting_time) }));
        res.json({ message: 'Published tenders retrieved successfully', tenders });

    } catch (error) {
        console.error('Error fetching published tenders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get knockout clause documents for a specific supplier's bid
const getKnockoutClauseDocuments = async (req, res) => {
    const { tenderId, supplierId } = req.params;

    try {
        const documents = await dbAll(`SELECT id, clause_id, original_filename, document_filename, uploaded_at
         FROM knockout_clause_documents 
         WHERE tender_id = ? AND supplier_id = ?
         ORDER BY clause_id ASC`, [tenderId, supplierId]);

        res.json({
            message: 'Knockout clause documents retrieved successfully',
            documents: documents
        });

    } catch (error) {
        console.error('Error fetching knockout clause documents:', error);
        res.status(500).json({ 
            message: 'Failed to fetch knockout clause documents', 
            error: error.message 
        });
    }
};

// Download knockout clause document
const downloadKnockoutClauseDocument = async (req, res) => {
    const { documentId } = req.params;

    try {
        const document = await dbGet(`SELECT original_filename, document_filename 
         FROM knockout_clause_documents 
         WHERE id = ?`, [documentId]);

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const filePath = path.join(__dirname, '../../uploads/knockout-documents', document.document_filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found on server' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${document.original_filename}"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.sendFile(path.resolve(filePath));

    } catch (error) {
        console.error('Error downloading knockout clause document:', error);
        res.status(500).json({ 
            message: 'Failed to download document', 
            error: error.message 
        });
    }
};

// Get tenders pending Purchase HOD approval
const getPurchaseHodPendingTenders = async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Verify user is Purchase HOD
        const hodInfo = await dbGet('SELECT department_id FROM users WHERE id = ? AND is_hod = 1', [userId]);

        if (!hodInfo) {
            return res.status(403).json({ error: 'You are not authorized as an HOD' });
        }

        // Check if this is Purchase department HOD
        const isPurchaseHod = await dbGet('SELECT name FROM departments WHERE id = ?', [hodInfo.department_id]).then(row => row?.name?.toLowerCase() === 'purchase');

        if (!isPurchaseHod) {
            return res.status(403).json({ error: 'Only Purchase HOD can access this resource' });
        }

        // Get tenders pending Purchase HOD approval
        const tenders = await dbAll(
            `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             JOIN users u ON dt.created_by = u.id
             WHERE dt.tender_status = 'pending_purchase_hod_approval'
             ORDER BY dt.created_at DESC`
        );

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching pending tenders for Purchase HOD:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Purchase HOD approve/reject tender
const approveTenderByPurchaseHod = async (req, res) => {
    const { tenderId, action, rejectionReason } = req.body;
    const userId = req.user.id;
    
    if (!tenderId || !action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Tender ID and valid action (approve/reject) are required' });
    }

    if (action === 'reject' && !rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required when rejecting a tender' });
    }

    try {
        // Verify user is Purchase HOD
        const hodInfo = await dbGet('SELECT department_id FROM users WHERE id = ? AND is_hod = 1', [userId]);

        if (!hodInfo) {
            return res.status(403).json({ error: 'You are not authorized as an HOD' });
        }

        // Check if this is Purchase department HOD
        const isPurchaseHod = await dbGet('SELECT name FROM departments WHERE id = ?', [hodInfo.department_id]).then(row => row?.name?.toLowerCase() === 'purchase');

        if (!isPurchaseHod) {
            return res.status(403).json({ error: 'Only Purchase HOD can approve/reject tenders' });
        }

        // Verify tender exists and is pending Purchase HOD approval
        const tender = await dbGet(
            'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ?',
            [tenderId, 'pending_purchase_hod_approval']
        );

        if (!tender) {
            return res.status(404).json({ error: 'Tender not found or not pending Purchase HOD approval' });
        }

        // Update tender status based on action
        let newStatus, statusComment;
        if (action === 'approve') {
            newStatus = 'pending_vetting';
            statusComment = 'Tender approved by Purchase HOD and sent to vetting committee';
        } else {
            newStatus = 'purchase_hod_rejected';
            statusComment = `Tender rejected by Purchase HOD: ${rejectionReason}`;
        }

        // Update tender status
        await dbRun(
            'UPDATE demand_tenders SET tender_status = ?, purchase_hod_response_by = ?, purchase_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newStatus, userId, tenderId]
        );

        // Add status history
        await dbRun(
            `INSERT INTO tender_status_history (tender_id, status, comments, changed_by) VALUES (?, ?, ?, ?)`,
            [tenderId, newStatus, statusComment, userId]
        );

        res.json({ message: `Tender ${action}d successfully` });
    } catch (error) {
        console.error(`Error ${action}ing tender:`, error);
        res.status(500).json({ error: `Error ${action}ing tender` });
    }
};

// Get tenders pending Finance HOD approval
const getFinanceHodPendingTenders = async (req, res) => {
    const user = req.user;

    // Check if user is Finance HOD
    const isFinanceHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'finance';

    if (!isFinanceHOD) {
        return res.status(403).json({ error: 'Only Finance HOD can view pending tenders' });
    }

    try {
        const tenders = await dbAll(
            `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             JOIN users u ON dt.created_by = u.id
             WHERE dt.tender_status = 'pending_finance_ms_approval'
             AND dt.finance_hod_response_by IS NULL
             ORDER BY dt.created_at DESC`,
            []
        );
        
        res.json(tenders);
    } catch (error) {
        console.error('Error fetching Finance HOD pending tenders:', error);
        res.status(500).json({ error: 'Failed to fetch pending tenders' });
    }
};

// Get tenders pending MS HOD approval
const getMsHodPendingTenders = async (req, res) => {
    const user = req.user;

    // Check if user is MS HOD
    const isMsHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'ms';

    if (!isMsHOD) {
        return res.status(403).json({ error: 'Only MS HOD can view pending tenders' });
    }

    try {
        const tenders = await dbAll(
            `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             JOIN users u ON dt.created_by = u.id
             WHERE dt.tender_status = 'pending_finance_ms_approval'
             AND dt.ms_hod_response_by IS NULL
             ORDER BY dt.created_at DESC`,
            []
        );
        
        res.json(tenders);
    } catch (error) {
        console.error('Error fetching MS HOD pending tenders:', error);
        res.status(500).json({ error: 'Failed to fetch pending tenders' });
    }
};

// Approve/Reject tender by Finance HOD
const approveTenderByFinanceHod = async (req, res) => {
    const { tenderId, action, rejectionReason } = req.body;
    const user = req.user;

    // Check if user is Finance HOD
    const isFinanceHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'finance';

    if (!isFinanceHOD) {
        return res.status(403).json({ error: 'Only Finance HOD can approve/reject tenders' });
    }

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    if (action === 'reject' && !rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
    }

    try {
        // Check if tender exists and is pending Finance and MS approval
        const tender = await dbGet(
            'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ? AND finance_hod_response_by IS NULL',
            [tenderId, 'pending_finance_ms_approval']
        );
        
        if (!tender) {
            return res.status(404).json({ error: 'Tender not found or not pending Finance HOD approval' });
        }
        
        // Update Finance HOD response
        if (action === 'approve') {
            await dbRun(
                'UPDATE demand_tenders SET finance_hod_response_by = ?, finance_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id, tenderId]
            );
            
            // Check if both Finance and MS HOD have approved
            const updatedTender = await dbGet(
                'SELECT finance_hod_response_by, ms_hod_response_by FROM demand_tenders WHERE id = ?',
                [tenderId]
            );
            
            if (updatedTender.finance_hod_response_by && updatedTender.ms_hod_response_by) {
                // Both have approved, send to Purchase HOD for final publishing
                await dbRun(
                    'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                    ['pending_purchase_hod_publishing', tenderId]
                );
            }
            
            res.json({ message: 'Tender approved by Finance HOD successfully' });
        } else {
            // Reject tender
            await dbRun(
                'UPDATE demand_tenders SET tender_status = ?, finance_hod_response_by = ?, finance_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['finance_rejected', user.id, tenderId]
            );
            
            res.json({ message: 'Tender rejected by Finance HOD successfully' });
        }
    } catch (error) {
        console.error('Error processing Finance HOD tender approval:', error);
        res.status(500).json({ error: 'Failed to process approval' });
    }
};

// Approve/Reject tender by MS HOD
const approveTenderByMsHod = async (req, res) => {
    const { tenderId, action, rejectionReason } = req.body;
    const user = req.user;

    // Check if user is MS HOD
    const isMsHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'ms';

    if (!isMsHOD) {
        return res.status(403).json({ error: 'Only MS HOD can approve/reject tenders' });
    }

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    if (action === 'reject' && !rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
    }

    try {
        // Check if tender exists and is pending Finance and MS approval
        const tender = await dbGet(
            'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ? AND ms_hod_response_by IS NULL',
            [tenderId, 'pending_finance_ms_approval']
        );
        
        if (!tender) {
            return res.status(404).json({ error: 'Tender not found or not pending MS HOD approval' });
        }
        
        // Update MS HOD response
        if (action === 'approve') {
            await dbRun(
                'UPDATE demand_tenders SET ms_hod_response_by = ?, ms_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id, tenderId]
            );
            
            // Check if both Finance and MS HOD have approved
            const updatedTender = await dbGet(
                'SELECT finance_hod_response_by, ms_hod_response_by FROM demand_tenders WHERE id = ?',
                [tenderId]
            );
            
            if (updatedTender.finance_hod_response_by && updatedTender.ms_hod_response_by) {
                // Both have approved, send to Purchase HOD for final publishing
                await dbRun(
                    'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                    ['pending_purchase_hod_publishing', tenderId]
                );
            }
            
            res.json({ message: 'Tender approved by MS HOD successfully' });
        } else {
            // Reject tender
            await dbRun(
                'UPDATE demand_tenders SET tender_status = ?, ms_hod_response_by = ?, ms_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['ms_rejected', user.id, tenderId]
            );
            
            res.json({ message: 'Tender rejected by MS HOD successfully' });
        }
    } catch (error) {
        console.error('Error processing MS HOD tender approval:', error);
        res.status(500).json({ error: 'Failed to process approval' });
    }
};

// Get tenders pending Purchase HOD publishing
const getPurchaseHodPendingPublishing = async (req, res) => {
    const user = req.user;

    // Check if user is Purchase HOD
    const isPurchaseHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'purchase';

    if (!isPurchaseHOD) {
        return res.status(403).json({ error: 'Only Purchase HOD can view pending publishing tenders' });
    }

    try {
        const tenders = await dbAll(
            `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name,
                    CASE WHEN dt.bidding_end_time <= ? THEN 1 ELSE 0 END as is_expired
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             JOIN users u ON dt.created_by = u.id
             WHERE dt.tender_status = 'pending_purchase_hod_publishing'
             ORDER BY dt.created_at DESC`,
            // See publishTenderByPurchaseHod - bound as a Date param, not GETDATE(),
            // so it lines up with how bidding_end_time was originally stored.
            [new Date()]
        );

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching Purchase HOD pending publishing tenders:', error);
        res.status(500).json({ error: 'Failed to fetch pending publishing tenders' });
    }
};

// Publish tender by Purchase HOD
const publishTenderByPurchaseHod = async (req, res) => {
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is Purchase HOD
    const isPurchaseHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'purchase';

    if (!isPurchaseHOD) {
        return res.status(403).json({ error: 'Only Purchase HOD can publish tenders' });
    }

    try {
        // Check if tender exists and is pending publishing
        const tender = await dbGet(
            'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ?',
            [tenderId, 'pending_purchase_hod_publishing']
        );
        
        if (!tender) {
            return res.status(404).json({ error: 'Tender not found or not approved by Finance & MS HOD' });
        }

        // Refuse to publish a tender whose bidding end time has already passed.
        // Checked via a bound Date param (not GETDATE()) so it lines up with how
        // bidding_end_time was originally stored - see markExpiredTendersForOpening.
        const expiryCheck = await dbGet(
            'SELECT CASE WHEN bidding_end_time <= ? THEN 1 ELSE 0 END as is_expired FROM demand_tenders WHERE id = ?',
            [new Date(), tenderId]
        );

        if (expiryCheck && Number(expiryCheck.is_expired) === 1) {
            return res.status(409).json({
                error: 'Bidding end time has already passed. Update the bidding end time before publishing.',
                expired: true,
                biddingEndTime: tender.bidding_end_time
            });
        }

        // Publish the tender
        await dbRun(
            'UPDATE demand_tenders SET tender_status = ?, published_at = CURRENT_TIMESTAMP, published_by = ? WHERE id = ?',
            ['active', user.id, tenderId]
        );
        
        res.json({ message: 'Tender published successfully' });
    } catch (error) {
        console.error('Error publishing tender:', error);
        res.status(500).json({ error: 'Failed to publish tender' });
    }
};

module.exports = {
    markExpiredTendersForOpening,
    getTendersPendingOpening,
    getTenderOpeningDetails,
    generateTenderOpeningReport,
    openTender,
    createTenderWithCriteria,
    getTenderWithCriteria,
    acknowledgeCriteria,
    getPublishedTenders,
    getKnockoutClauseDocuments,
    downloadKnockoutClauseDocument,
    getPurchaseHodPendingTenders,
    approveTenderByPurchaseHod,
    getFinanceHodPendingTenders,
    getMsHodPendingTenders,
    approveTenderByFinanceHod,
    approveTenderByMsHod,
    getPurchaseHodPendingPublishing,
    publishTenderByPurchaseHod
};
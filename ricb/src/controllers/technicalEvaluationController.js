const { getDatabase } = require('../config/database');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

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
        // Get expired tenders that are ready for technical evaluation
        const expiredTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE dt.tender_status = 'expired'
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
            // Get demand items with detailed information
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT di.*, 
                            ic.name as category_name,
                            in_t.name as item_name_full,
                            dc.name as drug_category_name,
                            dn.name as drug_name,
                            su.name as strength_unit_name,
                            df.name as dosage_form_name,
                            p.name as preparation_name,
                            ec.name as equipment_category_name,
                            et.name as equipment_type_name
                     FROM demand_items di
                     LEFT JOIN item_categories ic ON di.category_id = ic.id
                     LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                     LEFT JOIN drug_categories dc ON di.drug_category_id = dc.id
                     LEFT JOIN drug_names dn ON di.drug_name_id = dn.id
                     LEFT JOIN strength_units su ON di.strength_unit_id = su.id
                     LEFT JOIN dosage_forms df ON di.dosage_form_id = df.id
                     LEFT JOIN preparations p ON di.preparation_id = p.id
                     LEFT JOIN equipment_categories ec ON di.equipment_category_id = ec.id
                     LEFT JOIN equipment_types et ON di.equipment_type_id = et.id
                     WHERE di.demand_id = ? 
                     AND (di.store_fulfilled IS NULL OR di.store_fulfilled = 0)
                     AND (di.store_status != 'available' OR di.store_status IS NULL)
                     ORDER BY di.id`,
                    [tender.demand_id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            // Format items with detailed information
            const formattedItems = items.map(item => {
                const categoryName = item.category_name?.toLowerCase() || '';
                const isPharmaCategory = categoryName.includes('pharmaceutical') || categoryName.includes('medicine') || categoryName.includes('drug');
                const isEquipmentCategory = categoryName.includes('equipment') || categoryName.includes('machinery');
                
                return {
                    id: item.id,
                    item_name: item.item_name || item.item_name_full || item.drug_name || item.equipment_type_name || 'Unknown Item',
                    category: item.category_name || 'Unknown Category',
                    quantity: item.quantity,
                    unit: item.unit,
                    specifications: item.specifications,
                    estimated_cost: item.current_year_cost,
                    item_type: isPharmaCategory ? 'pharmaceutical' : isEquipmentCategory ? 'equipment' : 'general',
                    pharmaceutical_details: isPharmaCategory ? {
                        drug_category: item.drug_category_name,
                        drug_name: item.drug_name,
                        strength: item.strength_value ? `${item.strength_value} ${item.strength_unit_name || ''}`.trim() : null,
                        dosage_form: item.dosage_form_name,
                        preparation: item.preparation_name
                    } : null,
                    equipment_details: isEquipmentCategory ? {
                        equipment_category: item.equipment_category_name,
                        equipment_type: item.equipment_type_name
                    } : null
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
            const bids = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT sb.*, 
                            s.business_email as company_email,
                            s.username,
                            bp.business_name as company_name,
                            bp.contact_person_name as contact_person
                     FROM supplier_bids sb
                     JOIN suppliers s ON sb.supplier_id = s.id
                     LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
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

        // Get demand items with detailed information
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*, 
                        ic.name as category_name,
                        in_t.name as item_name_full,
                        dc.name as drug_category_name,
                        dn.name as drug_name,
                        su.name as strength_unit_name,
                        df.name as dosage_form_name,
                        p.name as preparation_name,
                        ec.name as equipment_category_name,
                        et.name as equipment_type_name
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 LEFT JOIN drug_categories dc ON di.drug_category_id = dc.id
                 LEFT JOIN drug_names dn ON di.drug_name_id = dn.id
                 LEFT JOIN strength_units su ON di.strength_unit_id = su.id
                 LEFT JOIN dosage_forms df ON di.dosage_form_id = df.id
                 LEFT JOIN preparations p ON di.preparation_id = p.id
                 LEFT JOIN equipment_categories ec ON di.equipment_category_id = ec.id
                 LEFT JOIN equipment_types et ON di.equipment_type_id = et.id
                 WHERE di.demand_id = ? 
                 AND (di.store_fulfilled IS NULL OR di.store_fulfilled = 0)
                 AND (di.store_status != 'available' OR di.store_status IS NULL)
                 ORDER BY di.id`,
                [tender.demand_id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Format items with detailed information
        const formattedItems = items.map(item => {
            const categoryName = item.category_name?.toLowerCase() || '';
            const isPharmaCategory = categoryName.includes('pharmaceutical') || categoryName.includes('medicine') || categoryName.includes('drug');
            const isEquipmentCategory = categoryName.includes('equipment') || categoryName.includes('machinery');
            
            let formattedItem = {
                id: item.id,
                item_name: item.item_name || item.item_name_full || item.drug_name || item.equipment_type_name || 'Unknown Item',
                category: item.category_name || 'Unknown Category',
                quantity: item.quantity,
                unit: item.unit,
                specifications: item.specifications,
                estimated_cost: item.current_year_cost,
                item_type: isPharmaCategory ? 'pharmaceutical' : isEquipmentCategory ? 'equipment' : 'general'
            };

            // Add pharmaceutical-specific details
            if (isPharmaCategory) {
                formattedItem.pharmaceutical_details = {
                    drug_category: item.drug_category_name,
                    drug_name: item.drug_name,
                    strength: item.strength_value ? `${item.strength_value} ${item.strength_unit_name || ''}`.trim() : null,
                    dosage_form: item.dosage_form_name,
                    preparation: item.preparation_name
                };
            }

            // Add equipment-specific details
            if (isEquipmentCategory) {
                formattedItem.equipment_details = {
                    equipment_category: item.equipment_category_name,
                    equipment_type: item.equipment_type_name
                };
            }

            return formattedItem;
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
        const bids = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sb.*, 
                        s.business_email as company_email,
                        s.username,
                        bp.business_name as company_name,
                        bp.contact_person_name as contact_person,
                        bp.business_mobile_number as contact_number
                 FROM supplier_bids sb
                 JOIN suppliers s ON sb.supplier_id = s.id
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE sb.tender_id = ? AND s.status = 'approved'
                 ORDER BY sb.total_cost ASC, sb.created_at ASC`,
                [tender.id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // For each bid, get the item-specific bid details
        for (const bid of bids) {
            const bidItems = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM supplier_bid_items WHERE bid_id = ? ORDER BY item_id`,
                    [bid.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            bid.bidItems = bidItems;
        }

        tender.bids = bids;

        // Fetch evaluation criteria (knockout + scoring) for context
        const criteria = await new Promise((resolve, reject) => {
            db.all(
                `SELECT id, criteria_title, criteria_description, is_knockout, minimum_requirement, weightage
                 FROM tender_evaluation_criteria
                 WHERE tender_id = ?
                 ORDER BY is_knockout DESC, id ASC`,
                [tenderId],
                (err, rows) => { if (err) reject(err); else resolve(rows); }
            );
        });
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
    const db = getDatabase();
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

// Submit item-wise technical evaluation
const submitItemWiseEvaluation = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    // evaluations structure extended to include knockoutChecks per bid: { approvedCompanies:[{bidId, knockoutChecks:[{id, checked}]}], rejectedCompanies:[{bidId, reason, knockoutChecks:[...] , grievanceMarked:true/false}] }
    const { evaluations, scoring } = req.body; // scoring: { bidId: { total: number, breakdown: {criteriaId: score} } }
    const user = req.user;

    // Check if user is from technical evaluation committee
    const canEvaluate = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase().includes('technical evaluation'));

    if (!canEvaluate) {
        return res.status(403).json({ message: 'Only technical evaluation committee members can evaluate tenders' });
    }

    if (!evaluations || Object.keys(evaluations).length === 0) {
        return res.status(400).json({ message: 'Evaluation data is required' });
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
            // Create technical_evaluations table if it doesn't exist (extended schema)
            await new Promise((resolve, reject) => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS technical_evaluations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        tender_id INTEGER NOT NULL,
                        item_id INTEGER NOT NULL,
                        bid_id INTEGER NOT NULL,
                        supplier_id INTEGER NOT NULL,
                        status TEXT NOT NULL CHECK(status IN ('approved', 'rejected')),
                        rejection_reason TEXT,
                        evaluated_by INTEGER NOT NULL,
                        evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        knockout_clauses_checked INTEGER DEFAULT 0,
                        knockout_clause_failures TEXT,
                        grievance_marked INTEGER DEFAULT 0,
                        total_score REAL,
                        scoring_breakdown TEXT,
                        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                        FOREIGN KEY (bid_id) REFERENCES supplier_bids(id),
                        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                        FOREIGN KEY (evaluated_by) REFERENCES users(id),
                        UNIQUE(tender_id, item_id, bid_id)
                    )
                `, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Create temporary approved pools table
            await new Promise((resolve, reject) => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS temporary_approved_pools (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        tender_id INTEGER NOT NULL,
                        item_id INTEGER NOT NULL,
                        supplier_id INTEGER NOT NULL,
                        bid_id INTEGER NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                        FOREIGN KEY (bid_id) REFERENCES supplier_bids(id),
                        UNIQUE(tender_id, item_id, supplier_id)
                    )
                `, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Delete existing evaluations and temporary pools for this tender
            await new Promise((resolve, reject) => {
                db.run(
                    'DELETE FROM technical_evaluations WHERE tender_id = ?',
                    [tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            await new Promise((resolve, reject) => {
                db.run(
                    'DELETE FROM temporary_approved_pools WHERE tender_id = ?',
                    [tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Insert new evaluations and temporary pools
            for (const [itemId, itemEval] of Object.entries(evaluations)) {
                // Insert approved companies into temporary pools
                for (const approved of itemEval.approvedCompanies) {
                    // Get supplier_id from bid
                    const bid = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT supplier_id FROM supplier_bids WHERE id = ?',
                            [approved.bidId],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });

                        if (bid) {
                            // Determine knockout clause state
                            const knockoutChecks = approved.knockoutChecks || {};
                            
                            // Convert knockout checks object to validation
                            // knockoutChecks is an object like { clauseId1: true, clauseId2: false, ... }
                            const knockoutValues = Object.values(knockoutChecks);
                            const allKnockoutChecked = knockoutValues.length === 0 ? 1 : (knockoutValues.every(v => v === true) ? 1 : 0);
                            
                            if (!allKnockoutChecked) {
                                // If any knockout clause failed, this bid cannot be approved
                                return res.status(400).json({ 
                                    message: 'Cannot approve a bid where all knockout clauses are not satisfied', 
                                    bidId: approved.bidId,
                                    knockoutChecks: knockoutChecks
                                });
                            }
                        // Insert into technical evaluations
                        const scoreObj = scoring && scoring[approved.bidId] ? scoring[approved.bidId] : null;
                        const totalScore = scoreObj && typeof scoreObj.total === 'number' ? scoreObj.total : null;
                        const breakdownJSON = scoreObj && scoreObj.breakdown ? JSON.stringify(scoreObj.breakdown) : null;
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO technical_evaluations 
                                 (tender_id, item_id, bid_id, supplier_id, status, evaluated_by, knockout_clauses_checked, knockout_clause_failures, grievance_marked, total_score, scoring_breakdown)
                                 VALUES (?, ?, ?, ?, 'approved', ?, 1, NULL, 0, ?, ?)`,
                                [tenderId, itemId, approved.bidId, bid.supplier_id, user.id, totalScore, breakdownJSON],
                                (err) => { if (err) reject(err); else resolve(); }
                            );
                        });

                        // Insert into temporary approved pools
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO temporary_approved_pools 
                                 (tender_id, item_id, supplier_id, bid_id)
                                 VALUES (?, ?, ?, ?)`,
                                [tenderId, itemId, bid.supplier_id, approved.bidId],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }

                // Insert rejected companies
                for (const rejected of itemEval.rejectedCompanies) {
                    // Get supplier_id from bid
                    const bid = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT supplier_id FROM supplier_bids WHERE id = ?',
                            [rejected.bidId],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });

                    if (bid) {
                        const knockoutChecks = Array.isArray(rejected.knockoutChecks) ? rejected.knockoutChecks : [];
                        const failedClauses = knockoutChecks.filter(k => !k.checked).map(k => k.id);
                        const anyFailed = failedClauses.length > 0;
                        const grievanceMarked = rejected.grievanceMarked ? 1 : 0;
                        const scoreObj = scoring && scoring[rejected.bidId] ? scoring[rejected.bidId] : null;
                        const totalScore = scoreObj && typeof scoreObj.total === 'number' ? scoreObj.total : null;
                        const breakdownJSON = scoreObj && scoreObj.breakdown ? JSON.stringify(scoreObj.breakdown) : null;
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO technical_evaluations 
                                 (tender_id, item_id, bid_id, supplier_id, status, rejection_reason, evaluated_by, knockout_clauses_checked, knockout_clause_failures, grievance_marked, total_score, scoring_breakdown)
                                 VALUES (?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?, ?)`,
                                [tenderId, itemId, rejected.bidId, bid.supplier_id, rejected.reason, user.id, anyFailed ? 0 : 1, anyFailed ? failedClauses.join(',') : null, grievanceMarked, totalScore, breakdownJSON],
                                (err) => { if (err) reject(err); else resolve(); }
                            );
                        });
                    }
                }
            }

            // Update tender status to indicate technical evaluation is complete
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demand_tenders SET 
                     tender_status = 'technically_evaluated',
                     technical_evaluation_completed_at = CURRENT_TIMESTAMP,
                     technical_evaluation_completed_by = ?
                     WHERE id = ?`,
                    [user.id, tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Start grievance deadline timer
            await startGrievanceDeadlineTimer(db, tenderId);

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Send email notifications to rejected suppliers
            const EmailService = require('../utils/emailService');
            const emailService = new EmailService();

            // Process email notifications in the background
            setTimeout(async () => {
                try {
                    console.log('📧 Sending rejection emails to affected suppliers...');
                    
                    for (const [itemId, itemEval] of Object.entries(evaluations)) {
                        // Get item name for the emails
                        let itemName = 'Unknown Item';
                        
                        // Find the item name from the tender details
                        const tender = await new Promise((resolve, reject) => {
                            db.get(
                                `SELECT dt.*, d.item_name
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

                        if (tender) {
                            if (itemId === '0') {
                                // Legacy single-item tender
                                itemName = tender.item_name;
                            } else {
                                // Multi-item tender - get specific item name
                                const item = await new Promise((resolve, reject) => {
                                    db.get(
                                        'SELECT item_name FROM demand_items WHERE id = ?',
                                        [itemId],
                                        (err, row) => {
                                            if (err) reject(err);
                                            else resolve(row);
                                        }
                                    );
                                });
                                if (item) {
                                    itemName = item.item_name;
                                }
                            }
                        }

                        // Create grievance records for purchase department approval instead of sending emails directly
                        for (const rejected of itemEval.rejectedCompanies) {
                            try {
                                // Get supplier details from bid
                                const supplierDetails = await new Promise((resolve, reject) => {
                                    db.get(
                                        `SELECT s.business_email as company_email,
                                                s.username,
                                                s.id as supplier_id,
                                                bp.business_name as company_name,
                                                bp.contact_person_name as contact_person
                                         FROM supplier_bids sb
                                         JOIN suppliers s ON sb.supplier_id = s.id
                                         LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                                         WHERE sb.id = ?`,
                                        [rejected.bidId],
                                        (err, row) => {
                                            if (err) reject(err);
                                            else resolve(row);
                                        }
                                    );
                                });

                                if (supplierDetails && supplierDetails.company_email) {
                                    console.log(`� Creating grievance record for purchase department: ${supplierDetails.company_name} for item: ${itemName}`);
                                    
                                    // Insert into purchase_department_grievances table
                                    await new Promise((resolve, reject) => {
                                        db.run(
                                            `INSERT INTO purchase_department_grievances 
                                             (tender_id, supplier_id, bid_id, item_name, rejection_reason, 
                                              supplier_email, supplier_name, contact_person) 
                                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                            [
                                                tenderId,
                                                supplierDetails.supplier_id,
                                                rejected.bidId,
                                                itemName,
                                                rejected.reason,
                                                supplierDetails.company_email,
                                                supplierDetails.company_name,
                                                supplierDetails.contact_person
                                            ],
                                            function(err) {
                                                if (err) {
                                                    console.error(`❌ Failed to create grievance record for bid ${rejected.bidId}:`, err);
                                                    reject(err);
                                                } else {
                                                    console.log(`✅ Grievance record created successfully for ${supplierDetails.company_name}`);
                                                    resolve();
                                                }
                                            }
                                        );
                                    });
                                } else {
                                    console.warn(`⚠️ No email found for bid ID: ${rejected.bidId}`);
                                }
                            } catch (recordError) {
                                console.error(`❌ Failed to create grievance record for bid ${rejected.bidId}:`, recordError);
                                // Continue with other records even if one fails
                            }
                        }
                    }

                    console.log('� All grievance records created successfully for purchase department review');
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

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Error submitting technical evaluation:', error);
        res.status(500).json({ message: 'Internal server error' });
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
                    `SELECT sb.*, 
                            s.business_email as company_email,
                            s.username,
                            bp.business_name as company_name,
                            dt.demand_id, d.item_name
                     FROM supplier_bids sb
                     JOIN suppliers s ON sb.supplier_id = s.id
                     LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
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

// Download generated evaluation report
const downloadEvaluationReport = async (req, res) => {
    const { fileName } = req.params;
    const user = req.user;

    // Check if user is from technical evaluation committee
    const canDownload = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase().includes('technical evaluation'));

    if (!canDownload) {
        return res.status(403).json({ message: 'You do not have permission to download evaluation reports' });
    }

    try {
        const filePath = path.join(__dirname, '../../reports', fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Report file not found' });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        // Send file
        res.sendFile(path.resolve(filePath));
    } catch (error) {
        console.error('Error downloading evaluation report:', error);
        res.status(500).json({ message: 'Failed to download evaluation report' });
    }
};

// Generate Excel report for technical evaluation
const generateTechnicalEvaluationReport = async (db, tenderId, evaluations) => {
    try {
        // Get tender details
        const tender = await new Promise((resolve, reject) => {
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

        // Get demand items
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM demand_items 
                 WHERE demand_id = ? 
                 AND (store_fulfilled IS NULL OR store_fulfilled = 0)
                 AND (store_status != 'available' OR store_status IS NULL)
                 ORDER BY id`,
                [tender.demand_id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // If no items found (legacy single-item demand), create from main demand
        const finalItems = items.length === 0 ? [{
            id: 0,
            item_name: tender.item_name,
            quantity: tender.quantity || 0,
            estimated_cost: tender.estimated_cost || 0,
            unit: 'pieces'
        }] : items;

        // Get all bids with supplier details
        const allBids = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sb.*, 
                        s.business_email as company_email,
                        s.username,
                        bp.business_name as company_name,
                        bp.contact_person_name as contact_person
                 FROM supplier_bids sb
                 JOIN suppliers s ON sb.supplier_id = s.id
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE sb.tender_id = ? AND s.status = 'approved'
                 ORDER BY sb.total_cost ASC, sb.created_at ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // For each bid, get the item-specific bid details
        for (const bid of allBids) {
            const bidItems = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM supplier_bid_items WHERE bid_id = ? ORDER BY item_id`,
                    [bid.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            bid.bidItems = bidItems;
        }

        // Create workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Technical Evaluation Report');

        // Set worksheet properties
        worksheet.properties.defaultRowHeight = 20;

        // Add title
        worksheet.mergeCells('A1:E1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `Technical Evaluation Report - Tender ID: ${tenderId}`;
        titleCell.font = { bold: true, size: 16 };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Add tender information
        worksheet.getCell('A3').value = 'Tender Description:';
        worksheet.getCell('A3').font = { bold: true };
        worksheet.getCell('B3').value = tender.description || tender.item_name;

        worksheet.getCell('A4').value = 'Evaluation Date:';
        worksheet.getCell('A4').font = { bold: true };
        worksheet.getCell('B4').value = new Date().toLocaleDateString();

        // Add headers for the evaluation table
        const headerRow = 6;
        const headers = ['Sr. No.', 'Name of Item', 'Supplier Name', 'Bid Amount', 'Status'];
        
        headers.forEach((header, index) => {
            const cell = worksheet.getCell(headerRow, index + 1);
            cell.value = header;
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD0D0D0' }
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Set column widths
        worksheet.getColumn(1).width = 8;   // Sr. No.
        worksheet.getColumn(2).width = 30;  // Name of Item
        worksheet.getColumn(3).width = 25;  // Supplier Name
        worksheet.getColumn(4).width = 15;  // Bid Amount
        worksheet.getColumn(5).width = 15;  // Status

        let currentRow = headerRow + 1;
        let srNo = 1;

        // Process each item
        for (const item of finalItems) {
            const itemId = item.id || 0;
            
            // Get bids for this item
            const itemBids = allBids.filter(bid => {
                if (item.id === 0) {
                    // Legacy single-item tender
                    return true;
                } else {
                    // Multi-item tender - check if supplier bid for this item
                    return bid.bidItems.some(bidItem => bidItem.item_id === item.id);
                }
            });

            if (itemBids.length === 0) {
                // No bids for this item
                worksheet.getCell(currentRow, 1).value = srNo++;
                worksheet.getCell(currentRow, 2).value = item.item_name;
                worksheet.getCell(currentRow, 3).value = 'No bids received';
                worksheet.getCell(currentRow, 4).value = '-';
                worksheet.getCell(currentRow, 5).value = 'N/A';
                
                // Add borders
                for (let col = 1; col <= 5; col++) {
                    const cell = worksheet.getCell(currentRow, col);
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                }
                currentRow++;
                continue;
            }

            // Add row for each supplier that bid for this item
            for (const bid of itemBids) {
                worksheet.getCell(currentRow, 1).value = srNo++;
                worksheet.getCell(currentRow, 2).value = item.item_name;
                worksheet.getCell(currentRow, 3).value = bid.company_name;
                
                // Get bid amount for this specific item
                let bidAmount = bid.total_cost;
                if (item.id !== 0 && bid.bidItems.length > 0) {
                    const itemBid = bid.bidItems.find(bidItem => bidItem.item_id === item.id);
                    if (itemBid) {
                        bidAmount = itemBid.unit_price * itemBid.quantity;
                    }
                }
                worksheet.getCell(currentRow, 4).value = `Rs. ${bidAmount.toLocaleString()}`;

                // Determine status from evaluations
                let status = 'Not Evaluated';
                const itemEvaluation = evaluations[itemId];
                if (itemEvaluation) {
                    const approvedBid = itemEvaluation.approvedCompanies.find(app => app.bidId === bid.id);
                    const rejectedBid = itemEvaluation.rejectedCompanies.find(rej => rej.bidId === bid.id);
                    
                    if (approvedBid) {
                        status = 'Approved';
                    } else if (rejectedBid) {
                        status = `Rejected - ${rejectedBid.reason}`;
                    }
                }
                
                worksheet.getCell(currentRow, 5).value = status;
                
                // Add colors based on status
                const statusCell = worksheet.getCell(currentRow, 5);
                if (status === 'Approved') {
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFD4FFDD' }
                    };
                } else if (status.startsWith('Rejected')) {
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFD4D4' }
                    };
                }

                // Add borders
                for (let col = 1; col <= 5; col++) {
                    const cell = worksheet.getCell(currentRow, col);
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                }
                currentRow++;
            }
        }

        // Add summary section
        currentRow += 2;
        worksheet.getCell(currentRow, 1).value = 'Evaluation Summary:';
        worksheet.getCell(currentRow, 1).font = { bold: true, size: 12 };
        currentRow++;

        // Count approved and rejected suppliers
        let totalApproved = 0;
        let totalRejected = 0;
        Object.values(evaluations).forEach(itemEval => {
            totalApproved += itemEval.approvedCompanies.length;
            totalRejected += itemEval.rejectedCompanies.length;
        });

        worksheet.getCell(currentRow, 1).value = `Total Suppliers Approved: ${totalApproved}`;
        currentRow++;
        worksheet.getCell(currentRow, 1).value = `Total Suppliers Rejected: ${totalRejected}`;
        currentRow++;
        worksheet.getCell(currentRow, 1).value = `Total Items Evaluated: ${finalItems.length}`;

        // Save the file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `Technical_Evaluation_Report_${tenderId}_${timestamp}.xlsx`;
        const filePath = path.join(__dirname, '../../reports', fileName);

        // Ensure reports directory exists
        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        await workbook.xlsx.writeFile(filePath);
        
        console.log(`Technical evaluation report generated: ${fileName}`);
        return fileName;

    } catch (error) {
        console.error('Error generating technical evaluation report:', error);
        throw error;
    }
};

// Start grievance deadline timer for a tender
const startGrievanceDeadlineTimer = async (db, tenderId) => {
    try {
        // Get the configured grievance deadline hours
        const config = await new Promise((resolve, reject) => {
            db.get(
                "SELECT config_value FROM system_configurations WHERE config_key = 'grievance_deadline_hours'",
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const deadlineHours = config ? parseInt(config.config_value) : 72; // Default to 72 hours
        
        // Calculate deadline
        const deadlineStart = new Date();
        const deadlineEnd = new Date(deadlineStart.getTime() + (deadlineHours * 60 * 60 * 1000));

        // Insert or update grievance deadline
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO grievance_deadlines 
                 (tender_id, deadline_start, deadline_end, is_active) 
                 VALUES (?, ?, ?, 1)`,
                [tenderId, deadlineStart.toISOString(), deadlineEnd.toISOString()],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log(`📅 Grievance deadline set for tender ${tenderId}: ${deadlineHours} hours from now (until ${deadlineEnd.toLocaleString()})`);

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

        console.log(`⏰ Scheduled grievance deadline check for tender ${tenderId} in ${Math.round(timeUntilDeadline / (1000 * 60 * 60))} hours`);
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
        const db = getDatabase();
        
        // Mark grievance deadline as inactive
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE grievance_deadlines SET is_active = 0 WHERE tender_id = ? AND is_active = 1',
                [tenderId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Get all rejected suppliers who haven't submitted grievances
        const rejectedSuppliers = await new Promise((resolve, reject) => {
            db.all(
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
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        console.log(`🔍 Found ${rejectedSuppliers.length} suppliers who missed the grievance deadline for tender ${tenderId}`);

        // Send deadline expiry emails and create automatic rejection records
        const EmailService = require('../utils/emailService');
        const emailService = new EmailService();

        for (const supplier of rejectedSuppliers) {
            try {
                // Get proper item name
                let itemName = supplier.item_name;
                if (!itemName && supplier.item_id === 0) {
                    // Legacy single-item tender
                    const tender = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT d.item_name FROM demand_tenders dt JOIN demands d ON dt.demand_id = d.id WHERE dt.id = ?',
                            [tenderId],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });
                    itemName = tender ? tender.item_name : 'Unknown Item';
                }

                // Create automatic grievance rejection record
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO grievance_applications 
                         (technical_evaluation_id, supplier_id, tender_id, item_id, 
                          grievance_reason, status, submitted_at, resolution)
                         VALUES (?, ?, ?, ?, ?, 'rejected', CURRENT_TIMESTAMP, ?)`,
                        [
                            0, // No actual technical evaluation ID since it wasn't submitted
                            supplier.supplier_id,
                            supplier.tender_id,
                            supplier.item_id,
                            'Deadline expired - No grievance submitted',
                            'Automatic rejection due to missed deadline. Supplier did not submit grievance application within the required timeframe.'
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Send deadline expiry email
                if (supplier.company_email) {
                    await emailService.sendGrievanceDeadlineExpiredEmail(
                        supplier.company_email,
                        supplier.company_name,
                        itemName,
                        supplier.contact_person
                    );
                    
                    console.log(`📧 Deadline expiry email sent to ${supplier.company_name} for item: ${itemName}`);
                }

            } catch (error) {
                console.error(`❌ Error processing expired deadline for supplier ${supplier.supplier_id}:`, error);
            }
        }

        console.log(`✅ Processed expired grievance deadline for tender ${tenderId}`);

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
const { getDatabase } = require('../config/database');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Get tenders ready for financial opening (all grievances resolved and suppliers finalized)
const getTendersReadyForFinancialOpening = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        console.log('❌ Access denied for user');
        return res.status(403).json({ message: 'You do not have permission to view financial openings' });
    }

    try {
        console.log('📋 Fetching tenders ready for financial opening...');
        
        // Ensure temporary_approvals table exists
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS temporary_approvals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_id INTEGER NOT NULL,
                    tender_id INTEGER NOT NULL,
                    item_id INTEGER NOT NULL,
                    grievance_id INTEGER NOT NULL,
                    approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    approved_by INTEGER NOT NULL,
                    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'used', 'expired')),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                    FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                    FOREIGN KEY (item_id) REFERENCES demand_items(id),
                    FOREIGN KEY (grievance_id) REFERENCES grievance_applications(id),
                    FOREIGN KEY (approved_by) REFERENCES users(id),
                    UNIQUE(supplier_id, tender_id, item_id, grievance_id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Get tenders that have been technically evaluated
        const technicallyEvaluatedTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department,
                        dt.technical_evaluation_completed_at
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE dt.tender_status = 'technically_evaluated'
                 ORDER BY dt.technical_evaluation_completed_at ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        console.log(`🔍 Found ${technicallyEvaluatedTenders.length} technically evaluated tenders`);

        // For each tender, check if all grievances are resolved
        const readyTenders = [];
        
        for (const tender of technicallyEvaluatedTenders) {
            console.log(`🎯 Checking tender ${tender.id}...`);
            
            // Get all grievances for this tender
            const grievances = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT ga.status, ga.id
                     FROM grievance_applications ga
                     WHERE ga.tender_id = ?`,
                    [tender.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            // Check if all grievances are resolved or rejected (finalized)
            const hasUnfinishedGrievances = grievances.some(g => 
                !['resolved', 'rejected'].includes(g.status)
            );

            // Get count of approved suppliers for each item
            const itemsWithApprovedSuppliers = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT 
                        COALESCE(di.id, 0) as item_id,
                        COALESCE(di.item_name, d.item_name) as item_name,
                        COUNT(DISTINCT COALESCE(tap.supplier_id, ta.supplier_id)) as approved_suppliers_count
                     FROM demand_items di
                     LEFT JOIN temporary_approved_pools tap ON di.id = tap.item_id AND tap.tender_id = ?
                     LEFT JOIN temporary_approvals ta ON di.id = ta.item_id AND ta.tender_id = ? AND ta.status = 'active'
                     JOIN demands d ON di.demand_id = d.id
                     WHERE di.demand_id = ?
                        AND (di.store_fulfilled IS NULL OR di.store_fulfilled = 0)
                        AND (di.store_status != 'available' OR di.store_status IS NULL)
                     GROUP BY di.id, di.item_name
                     
                     UNION ALL
                     
                     SELECT 
                        0 as item_id,
                        d.item_name,
                        COUNT(DISTINCT COALESCE(tap.supplier_id, ta.supplier_id)) as approved_suppliers_count
                     FROM demands d
                     LEFT JOIN temporary_approved_pools tap ON tap.item_id = 0 AND tap.tender_id = ?
                     LEFT JOIN temporary_approvals ta ON ta.item_id = 0 AND ta.tender_id = ? AND ta.status = 'active'
                     LEFT JOIN demand_items di ON di.demand_id = d.id
                     WHERE d.id = ? AND di.id IS NULL
                     GROUP BY d.item_name`,
                    [tender.id, tender.id, tender.demand_id, tender.id, tender.id, tender.demand_id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            // Check if there are approved suppliers for all items
            const hasApprovedSuppliersForAllItems = itemsWithApprovedSuppliers.length > 0 && 
                itemsWithApprovedSuppliers.every(item => item.approved_suppliers_count > 0);

            // Check if financial opening is already scheduled
            const financialOpening = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT * FROM financial_openings WHERE tender_id = ?`,
                    [tender.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            // Only include tender if:
            // 1. No unfinished grievances
            // 2. Has approved suppliers for all items
            // 3. Financial opening not yet scheduled or is scheduled for future
            if (!hasUnfinishedGrievances && hasApprovedSuppliersForAllItems) {
                tender.grievances_count = grievances.length;
                tender.resolved_grievances_count = grievances.filter(g => g.status === 'resolved').length;
                tender.rejected_grievances_count = grievances.filter(g => g.status === 'rejected').length;
                tender.items_with_suppliers = itemsWithApprovedSuppliers;
                tender.financial_opening = financialOpening;
                
                readyTenders.push(tender);
            }        }

        console.log(`✅ Found ${readyTenders.length} tenders ready for financial opening`);
        res.json(readyTenders);
    } catch (error) {
        console.error('Error fetching tenders ready for financial opening:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Schedule financial opening for a tender
const scheduleFinancialOpening = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { openingDateTime } = req.body;
    const user = req.user;

    // Check if user is from purchase department
    const canSchedule = user.role === 'superadmin' || 
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canSchedule) {
        return res.status(403).json({ message: 'Only purchase department members can schedule financial openings' });
    }

    if (!openingDateTime) {
        return res.status(400).json({ message: 'Financial opening date and time is required' });
    }

    // Validate that opening time is in the future (Pakistan time UTC+5)
    const now = new Date();
    const utcTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000));
    const pakistanTime = new Date(utcTime.getTime() + (5 * 60 * 60 * 1000));
    const scheduledTime = new Date(openingDateTime);

    if (scheduledTime <= pakistanTime) {
        return res.status(400).json({ message: 'Financial opening must be scheduled for a future date and time' });
    }

    try {
        // Create financial_openings table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS financial_openings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tender_id INTEGER NOT NULL,
                    scheduled_opening_time DATETIME NOT NULL,
                    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'opened', 'completed')),
                    scheduled_by INTEGER NOT NULL,
                    scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    opened_at DATETIME,
                    opened_by INTEGER,
                    FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                    FOREIGN KEY (scheduled_by) REFERENCES users(id),
                    FOREIGN KEY (opened_by) REFERENCES users(id),
                    UNIQUE(tender_id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Check if financial opening already exists for this tender
        const existingOpening = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM financial_openings WHERE tender_id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });        if (existingOpening) {
            // Update existing schedule
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE financial_openings SET 
                     scheduled_opening_time = ?,
                     scheduled_by = ?,
                     status = 'scheduled'
                     WHERE tender_id = ?`,
                    [openingDateTime, user.id, tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        } else {
            // Create new schedule
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO financial_openings 
                     (tender_id, scheduled_opening_time, scheduled_by)
                     VALUES (?, ?, ?)`,
                    [tenderId, openingDateTime, user.id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        res.json({ 
            message: 'Financial opening scheduled successfully',
            tenderId: tenderId,
            scheduledTime: openingDateTime
        });

    } catch (error) {
        console.error('Error scheduling financial opening:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get scheduled financial openings
const getScheduledFinancialOpenings = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view financial openings' });
    }

    try {
        // Get current Pakistan time (UTC+5)
        const now = new Date();
        const utcTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000));
        const pakistanTime = new Date(utcTime.getTime() + (5 * 60 * 60 * 1000));

        const financialOpenings = await new Promise((resolve, reject) => {
            db.all(
                `SELECT fo.*, dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department,
                        sb.name as scheduled_by_name
                 FROM financial_openings fo
                 JOIN demand_tenders dt ON fo.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users sb ON fo.scheduled_by = sb.id
                 WHERE fo.status IN ('scheduled', 'opened')
                 ORDER BY fo.scheduled_opening_time ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Categorize openings
        const categorizedOpenings = {
            ready_to_open: [],
            scheduled_future: [],
            opened: []
        };

        for (const opening of financialOpenings) {
            const scheduledTime = new Date(opening.scheduled_opening_time);
            
            if (opening.status === 'opened') {
                categorizedOpenings.opened.push(opening);
            } else if (scheduledTime <= pakistanTime) {
                categorizedOpenings.ready_to_open.push(opening);
            } else {
                categorizedOpenings.scheduled_future.push(opening);
            }
        }

        res.json({
            current_pakistan_time: pakistanTime.toISOString(),
            ...categorizedOpenings
        });

    } catch (error) {
        console.error('Error fetching scheduled financial openings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Open financial bids and generate optimal combinations
const openFinancialBids = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canOpen = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canOpen) {
        return res.status(403).json({ message: 'Only purchase department members can open financial bids' });
    }

    try {
        // Check if financial opening is scheduled and time has passed
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

        if (!financialOpening) {
            return res.status(404).json({ message: 'Financial opening not scheduled for this tender' });
        }

        // Get current Pakistan time (UTC+5)
        const now = new Date();
        const utcTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000));
        const pakistanTime = new Date(utcTime.getTime() + (5 * 60 * 60 * 1000));
        const scheduledTime = new Date(financialOpening.scheduled_opening_time);

        if (scheduledTime > pakistanTime) {
            return res.status(400).json({ 
                message: 'Financial opening time has not yet arrived',
                scheduled_time: scheduledTime.toISOString(),
                current_time: pakistanTime.toISOString()
            });
        }

        // Start transaction for the entire process
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Update financial opening status
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE financial_openings SET 
                     status = 'opened',
                     opened_at = CURRENT_TIMESTAMP,
                     opened_by = ?
                     WHERE tender_id = ?`,
                    [user.id, tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Get tender details
            const tender = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by
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
            const finalItems = formattedItems.length === 0 ? [{
                id: 0,
                item_name: tender.item_name,
                category: 'General',
                quantity: tender.quantity || 0,
                estimated_cost: tender.estimated_cost || 0,
                unit: 'pieces',
                item_type: 'general'
            }] : formattedItems;

            // Get approved suppliers for each item from temporary pools
            const itemSupplierCombinations = [];

            for (const item of finalItems) {
                const approvedSuppliers = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT DISTINCT 
                            COALESCE(tap.supplier_id, ta.supplier_id) as supplier_id,
                            COALESCE(tap.bid_id, ta.grievance_id) as bid_id,
                            s.company_name, s.company_email, s.contact_person,
                            sb.total_cost, sb.proposed_quantity, sb.delivery_days,
                            sb.financial_bid_document, sb.technical_bid_document,
                            sbi.unit_price, sbi.proposed_quantity as item_quantity, sbi.total_cost as item_total_cost,
                            CASE WHEN tap.supplier_id IS NOT NULL THEN 'technical' ELSE 'grievance' END as approval_source
                         FROM (
                            SELECT supplier_id, bid_id FROM temporary_approved_pools WHERE tender_id = ? AND item_id = ?
                            UNION
                            SELECT supplier_id, grievance_id as bid_id FROM temporary_approvals WHERE tender_id = ? AND item_id = ? AND status = 'active'
                         ) combined
                         LEFT JOIN temporary_approved_pools tap ON combined.supplier_id = tap.supplier_id AND tap.tender_id = ? AND tap.item_id = ?
                         LEFT JOIN temporary_approvals ta ON combined.supplier_id = ta.supplier_id AND ta.tender_id = ? AND ta.item_id = ? AND ta.status = 'active'
                         JOIN suppliers s ON combined.supplier_id = s.id
                         JOIN supplier_bids sb ON combined.bid_id = sb.id
                         LEFT JOIN supplier_bid_items sbi ON sb.id = sbi.bid_id AND sbi.item_id = ?
                         ORDER BY 
                            CASE 
                                WHEN sbi.total_cost IS NOT NULL THEN sbi.total_cost 
                                ELSE sb.total_cost 
                            END ASC`,
                        [tenderId, item.id, tenderId, item.id, tenderId, item.id, tenderId, item.id, item.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        }
                    );
                });

                itemSupplierCombinations.push({
                    item: item,
                    approved_suppliers: approvedSuppliers
                });
            }

            // Generate optimal combinations
            const optimalCombinations = generateOptimalCombinations(itemSupplierCombinations);

            if (optimalCombinations.length === 0) {
                throw new Error('No valid supplier combinations found');
            }

            // Automatically award to the best combination (lowest cost, best delivery time)
            const winningCombination = optimalCombinations[0];
            
            // Update tender status to awarded
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demand_tenders SET 
                     tender_status = 'awarded', 
                     awarded_at = CURRENT_TIMESTAMP,
                     evaluation_remarks = ?
                     WHERE id = ?`,
                    ['Automatically awarded based on financial opening - best cost and delivery combination', tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Create supply orders for each supplier in the winning combination
            const supplyOrders = [];
            const EmailService = require('../utils/emailService');
            const pdfService = require('../utils/pdfService');
            const emailService = new EmailService();

            for (const supplierData of winningCombination.suppliers) {
                const orderNumber = `SO-${Date.now()}-${tenderId}-${supplierData.supplier_id}`;
                
                // Create supply order
                const supplyOrderResult = await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO supply_orders (
                            order_number, demand_id, supplier_id, tender_id, bid_id,
                            item_name, quantity, unit_price, total_amount, delivery_date, order_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '+' || ? || ' days'), 'pending')`,
                        [
                            orderNumber,
                            tender.demand_id,
                            supplierData.supplier_id,
                            tenderId,
                            supplierData.bid_id,
                            supplierData.item_name,
                            supplierData.item_quantity || supplierData.proposed_quantity,
                            supplierData.unit_price || (supplierData.total_cost / supplierData.proposed_quantity),
                            supplierData.item_total_cost || supplierData.total_cost,
                            supplierData.delivery_days
                        ],
                        function(err) {
                            if (err) reject(err);
                            else resolve({ id: this.lastID });
                        }
                    );
                });

                const supplyOrderId = supplyOrderResult.id;

                // Prepare order data for PDF and email
                const orderData = {
                    order_id: supplyOrderId,
                    order_number: orderNumber,
                    tender_id: tenderId,
                    demand_id: tender.demand_id,
                    item_name: supplierData.item_name,
                    description: tender.description || 'No description',
                    quantity: supplierData.item_quantity || supplierData.proposed_quantity,
                    unit_price: supplierData.unit_price || (supplierData.total_cost / supplierData.proposed_quantity),
                    awarded_bid_amount: supplierData.item_total_cost || supplierData.total_cost,
                    delivery_time_days: supplierData.delivery_days,
                    delivery_date: new Date(Date.now() + (supplierData.delivery_days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
                    order_status: 'pending',
                    urgency: tender.urgency || 'normal',
                    required_by: tender.required_by,
                    company_name: supplierData.company_name,
                    company_email: supplierData.company_email,
                    bid_comments: '',
                    order_date: new Date().toISOString()
                };

                supplyOrders.push({
                    ...orderData,
                    supplier_data: supplierData
                });

                // Generate PDF and send email notification (run in background)
                try {
                    console.log(`Generating PDF for supply order ${orderNumber}...`);
                    const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
                    
                    console.log(`Sending email to ${supplierData.company_email}...`);
                    await emailService.sendSupplyOrderEmail(
                        supplierData.company_email,
                        supplierData.company_name,
                        orderData,
                        pdfBuffer
                    );
                    
                    console.log(`PDF generated and email sent successfully for order ${orderNumber}`);
                } catch (emailError) {
                    console.error(`Failed to send PDF/email for order ${orderNumber}:`, emailError);
                    // Don't fail the entire process if email fails
                }
            }

            // Generate Excel report
            const reportFileName = await generateFinancialOpeningReport(db, tender, itemSupplierCombinations, optimalCombinations);

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({
                message: 'Financial bids opened and tender automatically awarded successfully',
                tender: tender,
                items_with_suppliers: itemSupplierCombinations,
                optimal_combinations: optimalCombinations,
                winning_combination: winningCombination,
                supply_orders: supplyOrders,
                report_file: reportFileName,
                opened_at: pakistanTime.toISOString(),
                awarded: true
            });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Error opening financial bids:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Download financial bid document
const downloadFinancialBid = async (req, res) => {
    const db = getDatabase();
    const { bidId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canDownload = user.role === 'superadmin' || 
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canDownload) {
        return res.status(403).json({ message: 'You do not have permission to download financial bid documents' });
    }

    try {
        // Get bid details
        const bid = await new Promise((resolve, reject) => {
            db.get(
                'SELECT financial_bid_document FROM supplier_bids WHERE id = ?',
                [bidId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!bid || !bid.financial_bid_document) {
            return res.status(404).json({ message: 'Financial bid document not found' });
        }

        if (!fs.existsSync(bid.financial_bid_document)) {
            return res.status(404).json({ message: 'Financial bid document file not found' });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="financial-bid-${bidId}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');
        
        // Send file
        res.sendFile(path.resolve(bid.financial_bid_document));
    } catch (error) {
        console.error('Error downloading financial bid:', error);
        res.status(500).json({ message: 'Failed to download financial bid document' });
    }
};

// Generate optimal supplier combinations
const generateOptimalCombinations = (itemSupplierCombinations) => {
    const combinations = [];

    // Generate all possible combinations (cartesian product)
    const generateCombinations = (items, currentCombination = [], index = 0) => {
        if (index === items.length) {
            const totalCost = currentCombination.reduce((sum, supplier) => {
                return sum + (supplier.item_total_cost || supplier.total_cost);
            }, 0);
            
            const avgDeliveryTime = currentCombination.reduce((sum, supplier) => {
                return sum + supplier.delivery_days;
            }, 0) / currentCombination.length;

            combinations.push({
                suppliers: [...currentCombination],
                total_cost: totalCost,
                average_delivery_time: Math.round(avgDeliveryTime),
                item_count: currentCombination.length
            });
            return;
        }

        const currentItem = items[index];
        for (const supplier of currentItem.approved_suppliers) {
            generateCombinations(items, [...currentCombination, {
                ...supplier,
                item_id: currentItem.item.id,
                item_name: currentItem.item.item_name
            }], index + 1);
        }
    };

    generateCombinations(itemSupplierCombinations);

    // Sort combinations by total cost (ascending) and delivery time (ascending)
    combinations.sort((a, b) => {
        if (a.total_cost === b.total_cost) {
            return a.average_delivery_time - b.average_delivery_time;
        }
        return a.total_cost - b.total_cost;
    });

    // Return top 10 combinations
    return combinations.slice(0, 10);
};

// Generate Excel report for financial opening
const generateFinancialOpeningReport = async (db, tender, itemSupplierCombinations, optimalCombinations) => {
    try {
        const workbook = new ExcelJS.Workbook();
        
        // Sheet 1: Summary
        const summarySheet = workbook.addWorksheet('Financial Opening Summary');
        summarySheet.properties.defaultRowHeight = 20;

        // Title
        summarySheet.mergeCells('A1:F1');
        const titleCell = summarySheet.getCell('A1');
        titleCell.value = `Financial Opening Report - Tender ID: ${tender.id}`;
        titleCell.font = { bold: true, size: 16 };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

        // Tender info
        summarySheet.getCell('A3').value = 'Tender Description:';
        summarySheet.getCell('A3').font = { bold: true };
        summarySheet.getCell('B3').value = tender.description || tender.item_name;

        summarySheet.getCell('A4').value = 'Financial Opening Date:';
        summarySheet.getCell('A4').font = { bold: true };
        summarySheet.getCell('B4').value = new Date().toLocaleDateString();

        // Sheet 2: Item-wise Suppliers
        const itemSheet = workbook.addWorksheet('Item-wise Suppliers');
        
        let currentRow = 1;
        const headers = ['Item Name', 'Supplier Name', 'Contact', 'Unit Price', 'Total Cost', 'Delivery Days'];
        headers.forEach((header, index) => {
            const cell = itemSheet.getCell(currentRow, index + 1);
            cell.value = header;
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0D0D0' } };
        });
        currentRow++;

        for (const itemCombo of itemSupplierCombinations) {
            for (const supplier of itemCombo.approved_suppliers) {
                itemSheet.getCell(currentRow, 1).value = itemCombo.item.item_name;
                itemSheet.getCell(currentRow, 2).value = supplier.company_name;
                itemSheet.getCell(currentRow, 3).value = supplier.company_email;
                itemSheet.getCell(currentRow, 4).value = supplier.unit_price ? `Rs ${supplier.unit_price.toLocaleString()}` : 'N/A';
                itemSheet.getCell(currentRow, 5).value = `Rs ${(supplier.item_total_cost || supplier.total_cost).toLocaleString()}`;
                itemSheet.getCell(currentRow, 6).value = `${supplier.delivery_days} days`;
                currentRow++;
            }
        }

        // Sheet 3: Optimal Combinations
        const comboSheet = workbook.addWorksheet('Optimal Combinations');
        
        currentRow = 1;
        const comboHeaders = ['Rank', 'Supplier Combination', 'Total Cost', 'Avg Delivery Time'];
        comboHeaders.forEach((header, index) => {
            const cell = comboSheet.getCell(currentRow, index + 1);
            cell.value = header;
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0D0D0' } };
        });
        currentRow++;

        optimalCombinations.forEach((combo, index) => {
            const supplierNames = combo.suppliers.map(s => `${s.item_name}: ${s.company_name}`).join('; ');
            
            comboSheet.getCell(currentRow, 1).value = index + 1;
            comboSheet.getCell(currentRow, 2).value = supplierNames;
            comboSheet.getCell(currentRow, 3).value = `Rs ${combo.total_cost.toLocaleString()}`;
            comboSheet.getCell(currentRow, 4).value = `${combo.average_delivery_time} days`;
            
            // Highlight top 3 combinations
            if (index < 3) {
                for (let col = 1; col <= 4; col++) {
                    comboSheet.getCell(currentRow, col).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: index === 0 ? 'FFD4FFDD' : index === 1 ? 'FFFFD4D4' : 'FFFFD4FF' }
                    };
                }
            }
            
            currentRow++;
        });

        // Set column widths
        [summarySheet, itemSheet, comboSheet].forEach(sheet => {
            sheet.columns.forEach(column => {
                column.width = 20;
            });
        });

        // Save file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `Financial_Opening_Report_${tender.id}_${timestamp}.xlsx`;
        const filePath = path.join(__dirname, '../../reports', fileName);

        // Ensure reports directory exists
        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        await workbook.xlsx.writeFile(filePath);
        
        console.log(`Financial opening report generated: ${fileName}`);
        return fileName;

    } catch (error) {
        console.error('Error generating financial opening report:', error);
        throw error;
    }
};

// Download financial opening report
const downloadFinancialOpeningReport = async (req, res) => {
    const { fileName } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canDownload = user.role === 'superadmin' || 
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canDownload) {
        return res.status(403).json({ message: 'You do not have permission to download financial opening reports' });
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
        console.error('Error downloading financial opening report:', error);
        res.status(500).json({ message: 'Failed to download financial opening report' });
    }
};

module.exports = {
    getTendersReadyForFinancialOpening,
    scheduleFinancialOpening,
    getScheduledFinancialOpenings,
    openFinancialBids,
    downloadFinancialBid,
    downloadFinancialOpeningReport
};

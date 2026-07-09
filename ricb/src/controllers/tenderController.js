const { getDatabase } = require('../config/database');
const pdfService = require('../utils/pdfService');
const EmailService = require('../utils/emailService');
const path = require('path');
const fs = require('fs');

// Initialize email service
const emailService = new EmailService();

// Generate unique tender number
const generateTenderNumber = async () => {
    const db = getDatabase();
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    
    // Get count of tenders created today
    const todayStart = `${year}-${month}-${day} 00:00:00`;
    const todayEnd = `${year}-${month}-${day} 23:59:59`;
    
    const todayCount = await new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM demand_tenders 
             WHERE created_at >= ? AND created_at <= ?`,
            [todayStart, todayEnd],
            (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            }
        );
    });
    
    // Generate sequential number for today (starting from 001)
    const sequentialNumber = String(todayCount + 1).padStart(3, '0');
    
    // Format: RIC-DDMMYYYY-XXX (e.g., RIC-12082025-001)
    const tenderNumber = `RIC-${day}${month}${year}-${sequentialNumber}`;
    
    // Check if this number already exists (very unlikely but safety check)
    const exists = await new Promise((resolve, reject) => {
        db.get(
            'SELECT id FROM demand_tenders WHERE tender_number = ?',
            [tenderNumber],
            (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            }
        );
    });
    
    if (exists) {
        // If somehow it exists, add a random suffix
        const randomSuffix = Math.floor(Math.random() * 99) + 1;
        return `${tenderNumber}-${String(randomSuffix).padStart(2, '0')}`;
    }
    
    return tenderNumber;
};

// Mark expired tenders for purchase department opening (modified function)
const markExpiredTendersForOpening = async () => {
    const db = getDatabase();
    
    try {
        // Get all expired tenders that are still active
        const expiredTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.tender_status = 'active' 
                 AND datetime(dt.bidding_end_time) <= datetime('now', 'localtime')
                 ORDER BY dt.bidding_end_time ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        if (expiredTenders.length === 0) {
            return 0; // No expired tenders to process
        }

        console.log(`Found ${expiredTenders.length} expired tenders to mark for opening`);

        // Update status to 'pending_opening' for purchase department
        for (const tender of expiredTenders) {
            try {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                        ['pending_opening', tender.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`Tender ${tender.id} marked as pending opening for purchase department`);
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

// Process expired tenders (keep existing function but modify for auto-awarding after TEC evaluation)
const processExpiredTenders = async (req, res) => {
    const db = getDatabase();
    let processedCount = 0;
    
    try {
        console.log('Starting to process expired tenders...');
        
        // First, let's log the current time for debugging
        const currentTime = new Date().toLocaleString('en-US', { 
            timeZone: 'Asia/Karachi',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        // Get all expired tenders that haven't been processed yet
        const expiredTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.tender_status = 'active' 
                 AND datetime(dt.bidding_end_time) <= datetime('now', 'localtime')
                 ORDER BY dt.bidding_end_time ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        console.log(`Found ${expiredTenders.length} expired tenders to process`);

        for (const tender of expiredTenders) {
            try {
                console.log(`Processing tender ${tender.id} for demand ${tender.demand_id}`);
                
                // Begin transaction for this tender
                await new Promise((resolve, reject) => {
                    db.run('BEGIN TRANSACTION', (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                // Get all bids for this tender, ordered by cost (lowest first)
                const bids = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT sb.*, 
                                bp.business_name as company_name, 
                                s.business_email as company_email,
                                bp.business_mobile_number as contact_phone
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

                console.log(`Found ${bids.length} bids for tender ${tender.id}`);

                if (bids.length === 0) {
                    // No bids received, mark tender as closed
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE demand_tenders SET tender_status = ?, awarded_at = CURRENT_TIMESTAMP WHERE id = ?',
                            ['closed_no_bids', tender.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    
                    console.log(`Tender ${tender.id} closed - no bids received`);
                } else {
                    // Award to the lowest bidder
                    const winningBid = bids[0];
                    
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE demand_tenders SET 
                             tender_status = 'awarded', 
                             awarded_supplier_id = ?, 
                             awarded_bid_amount = ?,
                             awarded_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [winningBid.supplier_id, winningBid.total_cost, tender.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    // Create supply order
                    const orderNumber = `SO-${Date.now()}-${tender.id}`;
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO supply_orders (
                                order_number, demand_id, supplier_id, tender_id, bid_id,
                                item_name, quantity, unit_price, total_amount, delivery_date, order_status
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATEADD(day, ?, GETDATE()), 'pending')`,
                            [
                                orderNumber,
                                tender.demand_id,
                                winningBid.supplier_id, 
                                tender.id,
                                winningBid.id,
                                tender.item_name,
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
                    
                    console.log(`Tender ${tender.id} awarded to supplier ${winningBid.supplier_id} (${winningBid.company_name}) for Rs ${winningBid.total_cost}`);
                    
                    // Generate PDF and send email notification
                    try {
                        // Prepare order data for PDF and email with defensive programming
                        const orderData = {
                            tender_id: tender.id,
                            demand_id: tender.demand_id,
                            item_name: tender.item_name || 'N/A',
                            description: tender.description || 'No description',
                            quantity: winningBid.proposed_quantity || 0,
                            awarded_bid_amount: winningBid.total_cost || 0,
                            delivery_time_days: winningBid.delivery_days || 0,
                            urgency: tender.urgency || 'normal',
                            company_name: winningBid.company_name || 'N/A',
                            company_email: winningBid.company_email || '',
                            bid_comments: winningBid.comments || ''
                        };

                        // Generate supply order PDF
                        console.log(`Generating PDF for tender ${tender.id}...`);
                        const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
                        
                        // Send email with PDF attachment to supplier
                        console.log(`Sending email to ${winningBid.company_email}...`);
                        await emailService.sendSupplyOrderEmail(
                            winningBid.company_email,
                            winningBid.company_name,
                            orderData,
                            pdfBuffer
                        );
                        
                        console.log(`PDF generated and email sent successfully for tender ${tender.id}`);
                    } catch (emailError) {
                        console.error(`Failed to send PDF/email for tender ${tender.id}:`, emailError);
                        // Don't fail the entire process if email fails
                    }
                }

                // Commit transaction
                await new Promise((resolve, reject) => {
                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                processedCount++;

            } catch (error) {
                // Rollback transaction on error
                await new Promise((resolve) => {
                    db.run('ROLLBACK', () => resolve());
                });
                console.error(`Error processing tender ${tender.id}:`, error);
                // Continue with next tender
            }
        }

        console.log(`Successfully processed ${processedCount} expired tenders`);

        // If called from scheduler (no res object), just return count
        if (!res) {
            return processedCount;
        }
        
        // If called as HTTP endpoint, return JSON response
        res.json({ 
            message: 'Expired tenders processed successfully', 
            processedCount: processedCount 
        });
        
    } catch (error) {
        console.error('Error processing expired tenders:', error);
        if (res) {
            res.status(500).json({ message: 'Internal server error' });
        } else {
            throw error;
        }
    }
};

// Get awarded tenders (placeholder)
const getAwardedTenders = async (req, res) => {
    try {
        // Placeholder for awarded tenders
        res.json([]);
    } catch (error) {
        console.error('Error fetching awarded tenders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate supply order PDF (placeholder)
const generateSupplyOrderPDF = async (req, res) => {
    try {
        // Placeholder for PDF generation
        res.json({ message: 'Supply order PDF generated' });
    } catch (error) {
        console.error('Error generating supply order PDF:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate supply order PDF by ID
const generateSupplyOrderPDFById = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const user = req.user;

    // Check if user is from purchase department or superadmin
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to generate supply order PDFs' });
    }

    try {
        // Get supply order details
        const supplyOrder = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    so.*,
                    dt.id as tender_id,
                    dt.tender_number,
                    d.item_name,
                    d.description,
                    d.urgency,
                    d.required_by,
                    bp.business_name as company_name,
                    s.business_email as company_email,
                    sb.delivery_days,
                    sb.bid_comments
                FROM supply_orders so
                JOIN demand_tenders dt ON so.tender_id = dt.id
                JOIN demands d ON so.demand_id = d.id
                JOIN suppliers s ON so.supplier_id = s.id
                LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                JOIN supplier_bids sb ON so.bid_id = sb.id
                WHERE so.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!supplyOrder) {
            return res.status(404).json({ message: 'Supply order not found' });
        }

        // Prepare order data for PDF generation with defensive programming
        const orderData = {
            order_id: supplyOrder.id,
            order_number: supplyOrder.order_number,
            tender_id: supplyOrder.tender_id,
            tender_number: supplyOrder.tender_number,
            demand_id: supplyOrder.demand_id,
            item_name: supplyOrder.item_name || 'N/A',
            description: supplyOrder.description || 'No description',
            quantity: supplyOrder.quantity || 0,
            unit_price: supplyOrder.unit_price || 0,
            awarded_bid_amount: supplyOrder.total_amount || 0, // Map total_amount to awarded_bid_amount for PDF service with default value
            delivery_date: supplyOrder.delivery_date,
            order_status: supplyOrder.order_status || 'pending',
            urgency: supplyOrder.urgency || 'normal',
            required_by: supplyOrder.required_by,
            company_name: supplyOrder.company_name || 'N/A',
            company_email: supplyOrder.company_email || '',
            delivery_time_days: supplyOrder.delivery_days || 0,
            bid_comments: supplyOrder.bid_comments || '',
            order_date: supplyOrder.created_at
        };

        console.log(`Generating PDF for supply order ${id}...`);
        console.log('Order data for PDF:', JSON.stringify(orderData, null, 2));
        
        // Generate PDF using the PDF service
        const pdfBuffer = await pdfService.generateSupplyOrderPDF(orderData);
        
        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="supply-order-${supplyOrder.order_number}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        // Send the PDF buffer
        res.send(pdfBuffer);
        
        console.log(`PDF generated successfully for supply order ${id}`);
    } catch (error) {
        console.error('Error generating supply order PDF:', error);
        res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
    }
};

// Create tender with evaluation criteria (new endpoint for multi-step wizard)
const createTenderWithCriteria = async (req, res) => {
    const db = getDatabase();
    
    try {
        const { demandId, biddingEndTime, minimumSuppliers, evaluationCriteria } = req.body;
        const createdBy = req.user?.id || 1; // Get from auth middleware
        
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

        console.log('Creating tender with data:', {
            demandId,
            biddingEndTime,
            minimumSuppliers,
            criteriaCount: parsedCriteria.length
        });

        // Validate required fields
        if (!demandId || !biddingEndTime) {
            return res.status(400).json({ message: 'Demand ID and bidding end time are required' });
        }

        // Check if tender already exists for this demand
        const existingTender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM demand_tenders WHERE demand_id = ?',
                [demandId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

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

        // Start transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Generate unique tender number
            const tenderNumber = await generateTenderNumber();
            
            // Create tender
            const tenderResult = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO demand_tenders (
                        demand_id, bidding_end_time, minimum_suppliers, 
                        tender_document_path, items_list_path, created_by,
                        tender_status, tender_number
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        demandId,
                        biddingEndTime,
                        minimumSuppliers || 3,
                        tenderDocumentPath,
                        itemsListPath,
                        createdBy,
                        'pending_purchase_hod_approval',
                        tenderNumber
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ tenderId: this.lastID, tenderNumber });
                    }
                );
            });

            const tenderId = tenderResult.tenderId;

            // Update demand status to indicate tender has been created
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     status = 'tender_created',
                     purchase_response = 'Tender created and published',
                     purchase_response_by = ?,
                     purchase_response_date = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [createdBy, demandId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Add evaluation criteria
            for (const criteria of parsedCriteria) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO tender_evaluation_criteria (
                            tender_id, criteria_title, criteria_description,
                            is_knockout, minimum_requirement, weightage, created_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            tenderId,
                            criteria.title,
                            criteria.description,
                            criteria.isKnockout ? 1 : 0,
                            criteria.minimumRequirement || null,
                            criteria.weightage || 0,
                            createdBy
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            // Add status history
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO tender_status_history (
                        tender_id, status, comments, changed_by
                    ) VALUES (?, ?, ?, ?)`,
                    [tenderId, 'pending_purchase_hod_approval', 'Tender created and submitted for Purchase HOD approval', createdBy],
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

            // Get complete tender data
            const completeData = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT dt.*, d.item_name, d.description as demand_description
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

            console.log(`Tender ${tenderId} (${tenderResult.tenderNumber}) created successfully with ${parsedCriteria.length} evaluation criteria`);

            res.status(201).json({
                message: 'Tender created successfully',
                tender: {
                    id: tenderId,
                    tender_number: tenderResult.tenderNumber,
                    ...completeData,
                    evaluationCriteriaCount: parsedCriteria.length
                }
            });

        } catch (transactionError) {
            // Rollback on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw transactionError;
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
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.description as demand_description
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.id = ? AND dt.tender_status = 'active'`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not active' });
        }

        // Get demand items for this tender (only unfulfilled items) with detailed information
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
                 AND (di.is_removed IS NULL OR di.is_removed = 0)
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

        // Get evaluation criteria
        const criteria = await new Promise((resolve, reject) => {
            db.all(
                `SELECT id, criteria_title, criteria_description, is_knockout,
                        minimum_requirement, weightage
                 FROM tender_evaluation_criteria
                 WHERE tender_id = ?
                 ORDER BY is_knockout DESC, id ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Record supplier view if supplierId is available
        if (supplierId) {
            try {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT OR REPLACE INTO supplier_tender_views 
                         (tender_id, supplier_id, viewed_at) VALUES (?, ?, datetime('now'))`,
                        [tenderId, supplierId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
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
                const ackRow = await new Promise((resolve, reject) => {
                    db.get(
                        `SELECT criteria_acknowledged FROM supplier_tender_views WHERE tender_id = ? AND supplier_id = ?`,
                        [tenderId, supplierId],
                        (err, row) => { if (err) reject(err); else resolve(row); }
                    );
                });
                if (ackRow) criteriaAcknowledged = ackRow.criteria_acknowledged || 0;
                const koAck = await new Promise((resolve, reject) => {
                    db.get(
                        `SELECT all_clauses_checked, checklist FROM supplier_knockout_acknowledgments WHERE tender_id = ? AND supplier_id = ?`,
                        [tenderId, supplierId],
                        (err, row) => { if (err) reject(err); else resolve(row); }
                    );
                });
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
    const db = getDatabase();
    const { tenderId } = req.params;
    const supplierId = req.user?.id; // Get from auth middleware

    try {
        // Handle file uploads and extract knockout document data
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

        console.log(`Processing knockout documents for tender ${tenderId}, supplier ${supplierId}:`, knockoutDocuments.length, 'files');

        // Update legacy acknowledgement flag
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE supplier_tender_views 
                 SET criteria_acknowledged = 1 
                 WHERE tender_id = ? AND supplier_id = ?`,
                [tenderId, supplierId],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });

        // Store knockout clause documents in database
        if (knockoutDocuments.length > 0) {
            for (const doc of knockoutDocuments) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO knockout_clause_documents 
                         (tender_id, supplier_id, clause_id, document_filename, original_filename, uploaded_at)
                         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [
                            tenderId, 
                            supplierId, 
                            doc.clauseIndex, 
                            doc.fileName, 
                            doc.originalName
                        ],
                        (err) => { if (err) reject(err); else resolve(); }
                    );
                });
            }

            // Update supplier_knockout_acknowledgments with document submission status
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO supplier_knockout_acknowledgments (tender_id, supplier_id, all_clauses_checked, checklist)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(tender_id, supplier_id) DO UPDATE SET
                        all_clauses_checked=excluded.all_clauses_checked,
                        checklist=excluded.checklist,
                        acknowledged_at=CURRENT_TIMESTAMP`,
                    [tenderId, supplierId, 1, JSON.stringify({ documentsUploaded: knockoutDocuments.length })],
                    (err) => { if (err) reject(err); else resolve(); }
                );
            });
        }

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

// Append additional evaluation/scoring criteria to an existing tender (post-creation fix)
const addTenderCriteria = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { criteria } = req.body || {};
    const createdBy = req.user?.id || 1;
    try {
        if (!Array.isArray(criteria) || criteria.length === 0) {
            return res.status(400).json({ message: 'criteria array required' });
        }
        const tender = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM demand_tenders WHERE id = ?', [tenderId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        if (!tender) return res.status(404).json({ message: 'Tender not found' });
        let added = 0;
        for (const c of criteria) {
            if (!c || !c.title || !c.description) continue;
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO tender_evaluation_criteria (
                        tender_id, criteria_title, criteria_description, is_knockout, minimum_requirement, weightage, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                        tenderId,
                        c.title,
                        c.description,
                        c.isKnockout ? 1 : 0,
                        c.minimumRequirement || null,
                        c.weightage || 0,
                        createdBy
                    ], (err) => { if (err) reject(err); else { added++; resolve(); } });
            });
        }
        const all = await new Promise((resolve, reject) => {
            db.all(`SELECT id, criteria_title, criteria_description, is_knockout, minimum_requirement, weightage
                    FROM tender_evaluation_criteria WHERE tender_id = ? ORDER BY is_knockout DESC, id ASC`, [tenderId], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
        res.json({
            message: 'Criteria added',
            added,
            knockoutClauses: all.filter(r => r.is_knockout),
            scoringCriteria: all.filter(r => !r.is_knockout)
        });
    } catch (error) {
        console.error('Error adding tender criteria:', error);
        res.status(500).json({ message: 'Failed to add criteria', error: error.message });
    }
};

// Get tenders pending opening for purchase department
const getTendersPendingOpening = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view tenders pending opening' });
    }

    try {
        // Get tenders that are pending opening
        const pendingTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department,
                        (SELECT COUNT(*) FROM supplier_bids WHERE tender_id = dt.id) as bid_count
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE dt.tender_status = 'pending_opening'
                 ORDER BY dt.bidding_end_time ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // For each tender, get the supplier bids
        for (const tender of pendingTenders) {
            const bids = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT sb.*, 
                            bp.business_name as company_name, 
                            s.business_email as company_email, 
                            bp.business_mobile_number as contact_phone
                     FROM supplier_bids sb
                     JOIN suppliers s ON sb.supplier_id = s.id
                     LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                     WHERE sb.tender_id = ? AND s.status = 'approved'
                     ORDER BY sb.total_cost ASC`,
                    [tender.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
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
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view tender opening details' });
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
                 WHERE dt.id = ? AND dt.tender_status = 'pending_opening'`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending opening' });
        }

        // Get supplier bids (without cost information for confidentiality)
        const bids = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sb.id, sb.supplier_id, sb.proposed_quantity, sb.delivery_days, 
                        sb.bid_comments, sb.created_at,
                        bp.business_name as company_name, 
                        s.business_email as company_email, 
                        bp.business_mobile_number as contact_phone
                 FROM supplier_bids sb
                 JOIN suppliers s ON sb.supplier_id = s.id
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE sb.tender_id = ? AND s.status = 'approved'
                 ORDER BY sb.created_at ASC`,
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
        console.error('Error fetching tender opening details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Generate tender opening report PDF
const generateTenderOpeningReport = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to generate opening reports' });
    }

    try {
        // Get tender details with bids
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE dt.id = ? AND dt.tender_status = 'pending_opening'`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending opening' });
        }

        // Get supplier bids (without cost information)
        const bids = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sb.id, sb.supplier_id, sb.proposed_quantity, sb.delivery_days, 
                        sb.bid_comments, sb.created_at,
                        bp.business_name as company_name, 
                        s.business_email as company_email, 
                        bp.business_mobile_number as contact_phone,
                        bp.business_entity_type, bp.origin_classification
                 FROM supplier_bids sb
                 JOIN suppliers s ON sb.supplier_id = s.id
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE sb.tender_id = ? AND s.status = 'approved'
                 ORDER BY sb.created_at ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Prepare report data
        const reportData = {
            tender,
            bids,
            generatedBy: user.name,
            generatedAt: new Date().toISOString(),
            totalBids: bids.length
        };

        // Generate PDF using PDF service
        const pdfBuffer = await pdfService.generateTenderOpeningReport(reportData);
        
        // Set response headers for PDF download
        const tenderDisplayName = tender.tender_number ? `Tender_${tender.tender_number}` : `Tender_${tender.id}`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${tenderDisplayName}_Opening_Report.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        // Send the PDF buffer
        res.send(pdfBuffer);
        
        console.log(`Opening report generated successfully for tender ${tenderId}`);
    } catch (error) {
        console.error('Error generating tender opening report:', error);
        res.status(500).json({ message: 'Failed to generate opening report', error: error.message });
    }
};

// Open tender for technical evaluation
const openTender = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canOpen = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canOpen) {
        return res.status(403).json({ message: 'Only purchase department can open tenders' });
    }

    try {
        // Verify tender exists and is pending opening
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ?',
                [tenderId, 'pending_opening'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not pending opening' });
        }

        // Update tender status to 'expired' (for technical evaluation)
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demand_tenders 
                 SET tender_status = 'expired', 
                     opened_by = ?, 
                     opened_at = datetime('now')
                 WHERE id = ?`,
                [user.id, tenderId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ 
            message: 'Tender opened and forwarded to technical evaluation committee successfully',
            tenderId 
        });
    } catch (error) {
        console.error('Error opening tender:', error);
        res.status(500).json({ message: 'Failed to open tender', error: error.message });
    }
};

// Get published tenders that can have pre-bid meetings scheduled
const getPublishedTenders = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view published tenders' });
    }

    try {
        const publishedTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.urgency, d.required_by,
                        u.name as created_by_name, dept.name as creator_department,
                        pbm.id as meeting_id, pbm.status as meeting_status,
                        pbm.meeting_date, pbm.meeting_time
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN pre_bid_meetings pbm ON dt.id = pbm.tender_id
                 WHERE dt.tender_status = 'active'
                 ORDER BY dt.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({
            message: 'Published tenders retrieved successfully',
            tenders: publishedTenders
        });

    } catch (error) {
        console.error('Error fetching published tenders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get knockout clause documents for a specific supplier's bid
const getKnockoutClauseDocuments = async (req, res) => {
    const db = getDatabase();
    const { tenderId, supplierId } = req.params;
    
    try {
        const documents = await new Promise((resolve, reject) => {
            db.all(
                `SELECT id, clause_id, original_filename, document_filename, uploaded_at
                 FROM knockout_clause_documents 
                 WHERE tender_id = ? AND supplier_id = ?
                 ORDER BY clause_id ASC`,
                [tenderId, supplierId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

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
    const db = getDatabase();
    const { documentId } = req.params;
    
    try {
        const document = await new Promise((resolve, reject) => {
            db.get(
                `SELECT original_filename, document_filename 
                 FROM knockout_clause_documents 
                 WHERE id = ?`,
                [documentId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

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
    const db = getDatabase();
    const userId = req.user.id;
    
    try {
        // Verify user is Purchase HOD
        const hodInfo = await new Promise((resolve, reject) => {
            db.get(
                'SELECT department_id FROM users WHERE id = ? AND is_hod = 1',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!hodInfo) {
            return res.status(403).json({ error: 'You are not authorized as an HOD' });
        }

        // Check if this is Purchase department HOD
        const isPurchaseHod = await new Promise((resolve, reject) => {
            db.get(
                'SELECT name FROM departments WHERE id = ?',
                [hodInfo.department_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.name?.toLowerCase() === 'purchase');
                }
            );
        });

        if (!isPurchaseHod) {
            return res.status(403).json({ error: 'Only Purchase HOD can access this resource' });
        }

        // Get tenders pending Purchase HOD approval
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 WHERE dt.tender_status = 'pending_purchase_hod_approval'
                 ORDER BY dt.created_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(tenders);
    } catch (error) {
        console.error('Error fetching pending tenders for Purchase HOD:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Purchase HOD approve/reject tender
const approveTenderByPurchaseHod = async (req, res) => {
    const db = getDatabase();
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
        const hodInfo = await new Promise((resolve, reject) => {
            db.get(
                'SELECT department_id FROM users WHERE id = ? AND is_hod = 1',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!hodInfo) {
            return res.status(403).json({ error: 'You are not authorized as an HOD' });
        }

        // Check if this is Purchase department HOD
        const isPurchaseHod = await new Promise((resolve, reject) => {
            db.get(
                'SELECT name FROM departments WHERE id = ?',
                [hodInfo.department_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.name?.toLowerCase() === 'purchase');
                }
            );
        });

        if (!isPurchaseHod) {
            return res.status(403).json({ error: 'Only Purchase HOD can approve/reject tenders' });
        }

        // Verify tender exists and is pending Purchase HOD approval
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ?',
                [tenderId, 'pending_purchase_hod_approval'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

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
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE demand_tenders SET tender_status = ?, purchase_hod_response_by = ?, purchase_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newStatus, userId, tenderId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Add status history
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO tender_status_history (tender_id, status, comments, changed_by) VALUES (?, ?, ?, ?)`,
                [tenderId, newStatus, statusComment, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: `Tender ${action}d successfully` });
    } catch (error) {
        console.error(`Error ${action}ing tender:`, error);
        res.status(500).json({ error: `Error ${action}ing tender` });
    }
};

// Get tenders pending Finance HOD approval
const getFinanceHodPendingTenders = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    
    // Check if user is Finance HOD
    const isFinanceHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'finance';
    
    if (!isFinanceHOD) {
        return res.status(403).json({ error: 'Only Finance HOD can view pending tenders' });
    }
    
    try {
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 WHERE dt.tender_status = 'pending_finance_ms_approval'
                 AND dt.finance_hod_response_by IS NULL
                 ORDER BY dt.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(tenders);
    } catch (error) {
        console.error('Error fetching Finance HOD pending tenders:', error);
        res.status(500).json({ error: 'Failed to fetch pending tenders' });
    }
};

// Get tenders pending MS HOD approval
const getMsHodPendingTenders = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    
    // Check if user is MS HOD
    const isMsHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'ms';
    
    if (!isMsHOD) {
        return res.status(403).json({ error: 'Only MS HOD can view pending tenders' });
    }
    
    try {
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 WHERE dt.tender_status = 'pending_finance_ms_approval'
                 AND dt.ms_hod_response_by IS NULL
                 ORDER BY dt.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(tenders);
    } catch (error) {
        console.error('Error fetching MS HOD pending tenders:', error);
        res.status(500).json({ error: 'Failed to fetch pending tenders' });
    }
};

// Approve/Reject tender by Finance HOD
const approveTenderByFinanceHod = async (req, res) => {
    const db = getDatabase();
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
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ? AND finance_hod_response_by IS NULL',
                [tenderId, 'pending_finance_ms_approval'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!tender) {
            return res.status(404).json({ error: 'Tender not found or not pending Finance HOD approval' });
        }
        
        // Update Finance HOD response
        if (action === 'approve') {
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demand_tenders SET finance_hod_response_by = ?, finance_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [user.id, tenderId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            
            // Check if both Finance and MS HOD have approved
            const updatedTender = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT finance_hod_response_by, ms_hod_response_by FROM demand_tenders WHERE id = ?',
                    [tenderId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (updatedTender.finance_hod_response_by && updatedTender.ms_hod_response_by) {
                // Both have approved, send to Purchase HOD for final publishing
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                        ['pending_purchase_hod_publishing', tenderId],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
            
            res.json({ message: 'Tender approved by Finance HOD successfully' });
        } else {
            // Reject tender
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demand_tenders SET tender_status = ?, finance_hod_response_by = ?, finance_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['finance_rejected', user.id, tenderId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            
            res.json({ message: 'Tender rejected by Finance HOD successfully' });
        }
    } catch (error) {
        console.error('Error processing Finance HOD tender approval:', error);
        res.status(500).json({ error: 'Failed to process approval' });
    }
};

// Approve/Reject tender by MS HOD
const approveTenderByMsHod = async (req, res) => {
    const db = getDatabase();
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
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ? AND ms_hod_response_by IS NULL',
                [tenderId, 'pending_finance_ms_approval'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!tender) {
            return res.status(404).json({ error: 'Tender not found or not pending MS HOD approval' });
        }
        
        // Update MS HOD response
        if (action === 'approve') {
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demand_tenders SET ms_hod_response_by = ?, ms_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [user.id, tenderId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            
            // Check if both Finance and MS HOD have approved
            const updatedTender = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT finance_hod_response_by, ms_hod_response_by FROM demand_tenders WHERE id = ?',
                    [tenderId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (updatedTender.finance_hod_response_by && updatedTender.ms_hod_response_by) {
                // Both have approved, send to Purchase HOD for final publishing
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                        ['pending_purchase_hod_publishing', tenderId],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
            
            res.json({ message: 'Tender approved by MS HOD successfully' });
        } else {
            // Reject tender
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demand_tenders SET tender_status = ?, ms_hod_response_by = ?, ms_hod_response_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['ms_rejected', user.id, tenderId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            
            res.json({ message: 'Tender rejected by MS HOD successfully' });
        }
    } catch (error) {
        console.error('Error processing MS HOD tender approval:', error);
        res.status(500).json({ error: 'Failed to process approval' });
    }
};

// Get tenders pending Purchase HOD publishing
const getPurchaseHodPendingPublishing = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    
    // Check if user is Purchase HOD
    const isPurchaseHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'purchase';
    
    if (!isPurchaseHOD) {
        return res.status(403).json({ error: 'Only Purchase HOD can view pending publishing tenders' });
    }
    
    try {
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.description, d.quantity, d.estimated_cost, u.name as creator_name
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 JOIN users u ON dt.created_by = u.id
                 WHERE dt.tender_status = 'pending_purchase_hod_publishing'
                 ORDER BY dt.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json(tenders);
    } catch (error) {
        console.error('Error fetching Purchase HOD pending publishing tenders:', error);
        res.status(500).json({ error: 'Failed to fetch pending publishing tenders' });
    }
};

// Publish tender by Purchase HOD
const publishTenderByPurchaseHod = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const user = req.user;
    
    // Check if user is Purchase HOD
    const isPurchaseHOD = user.is_hod && user.department_name && user.department_name.toLowerCase() === 'purchase';
    
    if (!isPurchaseHOD) {
        return res.status(403).json({ error: 'Only Purchase HOD can publish tenders' });
    }
    
    try {
        // Check if tender exists and is pending publishing
        const tender = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM demand_tenders WHERE id = ? AND tender_status = ?',
                [tenderId, 'pending_purchase_hod_publishing'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!tender) {
            return res.status(404).json({ error: 'Tender not found or not approved by Finance & MS HOD' });
        }
        
        // Publish the tender
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE demand_tenders SET tender_status = ?, published_at = CURRENT_TIMESTAMP, published_by = ? WHERE id = ?',
                ['active', user.id, tenderId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Tender published successfully' });
    } catch (error) {
        console.error('Error publishing tender:', error);
        res.status(500).json({ error: 'Failed to publish tender' });
    }
};

module.exports = {
    processExpiredTenders,
    getAwardedTenders,
    generateSupplyOrderPDF,
    generateSupplyOrderPDFById,
    markExpiredTendersForOpening,
    getTendersPendingOpening,
    getTenderOpeningDetails,
    generateTenderOpeningReport,
    openTender,
    createTenderWithCriteria,
    getTenderWithCriteria,
    acknowledgeCriteria,
    addTenderCriteria,
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
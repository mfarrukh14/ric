const { getDatabase } = require('../config/database');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const EmailService = require('../utils/emailService');

// Create email service instance
const emailService = new EmailService();

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
                COUNT(sb.id) as total_bids,
                COUNT(te.id) as evaluated_bids,
                fo.scheduled_opening_time,
                fo.status as opening_status,
                COUNT(ga.id) as total_grievances,
                COUNT(CASE WHEN ga.status NOT IN ('resolved', 'rejected') THEN 1 END) as unresolved_grievances
            FROM demand_tenders dt
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN users u ON d.created_by = u.id
            LEFT JOIN departments dept ON u.department_id = dept.id
            LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id
            LEFT JOIN technical_evaluations te ON sb.id = te.bid_id AND te.status = 'approved'
            LEFT JOIN financial_openings fo ON dt.id = fo.tender_id
            LEFT JOIN grievance_applications ga ON dt.id = ga.tender_id
            WHERE dt.technical_evaluation_completed_at IS NOT NULL
            AND dt.tender_status NOT IN ('awarded', 'cancelled')
            GROUP BY dt.id
            HAVING COUNT(te.id) > 0 
            AND COUNT(CASE WHEN ga.status NOT IN ('resolved', 'rejected') THEN 1 END) = 0
            ORDER BY dt.created_at DESC
        `;

        db.all(query, [], (err, tenders) => {
            if (err) {
                console.error('Error fetching tenders ready for financial opening:', err);
                return res.status(500).json({ error: 'Failed to fetch tenders' });
            }

            res.json(tenders);
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
        const db = getDatabase();

        console.log('Schedule financial opening request:', {
            tenderId,
            scheduledDateTime,
            openingDateTime,
            userId,
            body: req.body
        });

        // Use scheduledDateTime or openingDateTime (for compatibility)
        const finalDateTime = scheduledDateTime || openingDateTime;

        if (!finalDateTime) {
            console.error('No scheduled date/time provided');
            return res.status(400).json({ 
                error: 'Scheduled date and time is required',
                received: { scheduledDateTime, openingDateTime, body: req.body }
            });
        }

        // Validate the datetime format
        const dateTime = new Date(finalDateTime);
        if (isNaN(dateTime.getTime())) {
            console.error('Invalid date format:', finalDateTime);
            return res.status(400).json({ 
                error: 'Invalid date format. Please provide a valid ISO datetime string',
                received: finalDateTime
            });
        }

        console.log('Parsed datetime:', dateTime.toISOString());

        // Check if financial opening is already scheduled
        const existingOpening = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, scheduled_opening_time, status FROM financial_openings WHERE tender_id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingOpening) {
            console.log('Existing opening found:', existingOpening);
            
            // Update existing schedule instead of creating new one
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE financial_openings 
                     SET scheduled_opening_time = ?, scheduled_by = ?, status = 'scheduled'
                     WHERE tender_id = ?`,
                    [dateTime.toISOString(), userId, tenderId],
                    function(err) {
                        if (err) {
                            console.error('Error updating financial opening:', err);
                            reject(err);
                        } else {
                            console.log('Financial opening updated successfully');
                            resolve();
                        }
                    }
                );
            });

            return res.json({ 
                message: 'Financial opening schedule updated successfully',
                scheduledDateTime: dateTime.toISOString(),
                action: 'updated'
            });
        }

        console.log('Creating new financial opening schedule...');

        // Insert financial opening schedule
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO financial_openings 
                (tender_id, scheduled_opening_time, scheduled_by, status) 
                VALUES (?, ?, ?, 'scheduled')`,
                [tenderId, dateTime.toISOString(), userId],
                function(err) {
                    if (err) {
                        console.error('Error inserting financial opening:', err);
                        reject(err);
                    } else {
                        console.log('Financial opening created successfully with ID:', this.lastID);
                        resolve(this.lastID);
                    }
                }
            );
        });

        res.json({ 
            message: 'Financial opening scheduled successfully',
            scheduledDateTime: dateTime.toISOString(),
            action: 'created'
        });

    } catch (error) {
        console.error('Error scheduling financial opening:', error);
        res.status(500).json({ 
            error: 'Failed to schedule financial opening',
            details: error.message
        });
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
            GROUP BY fo.id
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
        const db = getDatabase();

        // Update financial opening status
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE financial_openings SET status = ?, opened_at = CURRENT_TIMESTAMP, opened_by = ? WHERE tender_id = ?',
                ['opened', userId, tenderId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Get all technically approved bids with supplier details
        const bidsQuery = `
            SELECT 
                sb.id as bid_id,
                sb.supplier_id,
                sb.total_cost,
                sb.proposed_quantity,
                sb.delivery_days,
                sb.bid_comments,
                sb.technical_bid_document,
                sb.financial_bid_document,
                sb.bid_cdr_document,
                s.business_email,
                sbp.business_name,
                sbp.contact_person_name,
                sbi.item_id,
                sbi.item_name,
                sbi.required_quantity,
                sbi.proposed_quantity as item_proposed_quantity,
                sbi.unit_price,
                sbi.total_cost as item_total_cost,
                sbi.unit,
                sbi.manufacturer_brand,
                di.specifications,
                te.status as technical_status
            FROM supplier_bids sb
            JOIN suppliers s ON sb.supplier_id = s.id
            JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
            LEFT JOIN supplier_bid_items sbi ON sb.id = sbi.bid_id
            LEFT JOIN demand_items di ON sbi.item_id = di.id
            LEFT JOIN technical_evaluations te ON sb.id = te.bid_id
            WHERE sb.tender_id = ? AND te.status = 'approved'
            ORDER BY sbi.item_name, sb.total_cost ASC
        `;

        const bids = await new Promise((resolve, reject) => {
            db.all(bidsQuery, [tenderId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Group bids by item for comparative analysis
        const itemAnalysis = {};
        
        bids.forEach(bid => {
            if (!itemAnalysis[bid.item_name]) {
                itemAnalysis[bid.item_name] = {
                    item_id: bid.item_id,
                    item_name: bid.item_name,
                    required_quantity: bid.required_quantity,
                    specifications: bid.specifications,
                    suppliers: []
                };
            }
            
            itemAnalysis[bid.item_name].suppliers.push({
                bid_id: bid.bid_id,
                supplier_id: bid.supplier_id,
                company_name: bid.business_name,
                contact_person: bid.contact_person_name,
                email: bid.business_email,
                proposed_quantity: bid.item_proposed_quantity,
                unit_price: bid.unit_price,
                total_cost: bid.item_total_cost,
                unit: bid.unit,
                manufacturer_brand: bid.manufacturer_brand,
                delivery_days: bid.delivery_days,
                bid_comments: bid.bid_comments,
                technical_bid_document: bid.technical_bid_document,
                financial_bid_document: bid.financial_bid_document,
                bid_cdr_document: bid.bid_cdr_document
            });
        });

        // Sort suppliers by unit price for each item
        Object.keys(itemAnalysis).forEach(itemName => {
            itemAnalysis[itemName].suppliers.sort((a, b) => a.unit_price - b.unit_price);
        });

        // Calculate optimal supplier combinations
        const optimalCombinations = calculateOptimalCombinations(itemAnalysis);

        // Generate detailed comparative report with multiple tabs
        const reportPath = await generateEnhancedComparativeReport(tenderId, itemAnalysis, optimalCombinations);

        res.json({
            message: 'Financial bids opened successfully',
            comparative_analysis: itemAnalysis,
            optimal_combinations: optimalCombinations,
            report_file: path.basename(reportPath),
            total_items: Object.keys(itemAnalysis).length,
            opened_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error opening financial bids:', error);
        res.status(500).json({ error: 'Failed to open financial bids' });
    }
};

// Calculate optimal supplier combinations
const calculateOptimalCombinations = (itemAnalysis) => {
    const items = Object.keys(itemAnalysis);
    const combinations = [];

    // Generate all possible supplier combinations (one supplier per item)
    function generateCombinations(itemIndex, currentCombo) {
        if (itemIndex >= items.length) {
            const combo = {
                suppliers: [...currentCombo],
                total_cost: currentCombo.reduce((sum, supplier) => sum + supplier.total_cost, 0),
                average_delivery_time: Math.round(currentCombo.reduce((sum, supplier) => sum + supplier.delivery_days, 0) / currentCombo.length),
                items_count: currentCombo.length
            };
            combinations.push(combo);
            return;
        }

        const itemName = items[itemIndex];
        const suppliers = itemAnalysis[itemName].suppliers;
        
        // For each supplier of this item, try combinations
        suppliers.forEach(supplier => {
            generateCombinations(itemIndex + 1, [...currentCombo, {
                ...supplier,
                item_name: itemName,
                required_quantity: itemAnalysis[itemName].required_quantity,
                specifications: itemAnalysis[itemName].specifications
            }]);
        });
    }

    generateCombinations(0, []);

    // Sort combinations by total cost, then by delivery time
    combinations.sort((a, b) => {
        if (a.total_cost !== b.total_cost) {
            return a.total_cost - b.total_cost;
        }
        return a.average_delivery_time - b.average_delivery_time;
    });

    // Return top 10 combinations
    return combinations.slice(0, 10);
};

// Generate detailed comparative report
const generateDetailedComparativeReport = async (tenderId, itemAnalysis, optimalCombinations) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Comparative Analysis');

        // Set up headers
        worksheet.columns = [
            { header: 'Item Name', key: 'item_name', width: 25 },
            { header: 'Required Quantity', key: 'required_quantity', width: 15 },
            { header: 'Specifications', key: 'specifications', width: 30 },
            { header: 'Supplier Name', key: 'supplier_name', width: 25 },
            { header: 'Contact Person', key: 'contact_person', width: 20 },
            { header: 'Manufacturer/Brand', key: 'manufacturer_brand', width: 20 },
            { header: 'Proposed Quantity', key: 'proposed_quantity', width: 15 },
            { header: 'Unit Price (Rs)', key: 'unit_price', width: 15 },
            { header: 'Total Cost (Rs)', key: 'total_cost', width: 15 },
            { header: 'Unit', key: 'unit', width: 10 },
            { header: 'Delivery Days', key: 'delivery_days', width: 15 },
            { header: 'Ranking', key: 'ranking', width: 10 }
        ];

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F2FF' }
        };

        // Add data rows
        let rowNumber = 2;
        Object.keys(itemAnalysis).forEach(itemName => {
            const item = itemAnalysis[itemName];
            
            item.suppliers.forEach((supplier, index) => {
                worksheet.addRow({
                    item_name: item.item_name,
                    required_quantity: item.required_quantity,
                    specifications: item.specifications || 'N/A',
                    supplier_name: supplier.company_name,
                    contact_person: supplier.contact_person || 'N/A',
                    manufacturer_brand: supplier.manufacturer_brand || 'N/A',
                    proposed_quantity: supplier.proposed_quantity,
                    unit_price: supplier.unit_price,
                    total_cost: supplier.total_cost,
                    unit: supplier.unit,
                    delivery_days: supplier.delivery_days,
                    ranking: index + 1
                });

                // Highlight the best (lowest cost) option
                if (index === 0) {
                    worksheet.getRow(rowNumber).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE6FFE6' }
                    };
                }
                
                rowNumber++;
            });
        });

        // Auto-fit columns
        worksheet.columns.forEach(column => {
            column.width = Math.max(column.width, 10);
        });

        // Save the file
        const reportsDir = path.join(__dirname, '../../financial-reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const fileName = `financial-comparative-analysis-tender-${tenderId}-${Date.now()}.xlsx`;
        const filePath = path.join(reportsDir, fileName);
        
        await workbook.xlsx.writeFile(filePath);
        
        return filePath;
    } catch (error) {
        console.error('Error generating comparative report:', error);
        throw error;
    }
};

// Manually award tender after reviewing comparative analysis
const awardTenderManually = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { selectedBids, awardComments } = req.body; // Array of {bid_id, item_id}
        const userId = req.user.id;
        const db = getDatabase();

        // Begin transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Update tender status to awarded
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demand_tenders SET tender_status = ?, awarded_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['awarded', tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Create supply orders for each selected bid
            for (const selection of selectedBids) {
                const { bid_id, item_id } = selection;
                
                // Get bid and item details
                const bidDetails = await new Promise((resolve, reject) => {
                    db.get(`
                        SELECT 
                            sb.supplier_id, sb.delivery_days,
                            sbi.item_name, sbi.proposed_quantity, sbi.unit_price, sbi.total_cost,
                            s.business_email,
                            sbp.business_name,
                            di.demand_id
                        FROM supplier_bids sb
                        JOIN supplier_bid_items sbi ON sb.id = sbi.bid_id
                        JOIN suppliers s ON sb.supplier_id = s.id
                        JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                        JOIN demand_items di ON sbi.item_id = di.id
                        WHERE sb.id = ? AND sbi.item_id = ?
                    `, [bid_id, item_id], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                if (!bidDetails) {
                    throw new Error(`Bid details not found for bid_id: ${bid_id}, item_id: ${item_id}`);
                }

                // Generate order number
                const orderNumber = `SO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                // Calculate delivery date
                const deliveryDate = new Date();
                deliveryDate.setDate(deliveryDate.getDate() + bidDetails.delivery_days);

                // Insert supply order
                await new Promise((resolve, reject) => {
                    db.run(`
                        INSERT INTO supply_orders 
                        (order_number, demand_id, supplier_id, tender_id, bid_id, 
                         item_name, quantity, unit_price, total_amount, delivery_date, order_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    `, [
                        orderNumber,
                        bidDetails.demand_id,
                        bidDetails.supplier_id,
                        tenderId,
                        bid_id,
                        bidDetails.item_name,
                        bidDetails.proposed_quantity,
                        bidDetails.unit_price,
                        bidDetails.total_cost,
                        deliveryDate.toISOString().split('T')[0]
                    ], function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    });
                });

                // Send email notification to supplier
                try {
                    const orderData = {
                        orderNumber: orderNumber,
                        item_name: bidDetails.item_name,
                        quantity: bidDetails.proposed_quantity,
                        unit_price: bidDetails.unit_price,
                        total_cost: bidDetails.total_cost,
                        delivery_date: deliveryDate.toISOString().split('T')[0],
                        tender_id: tenderId
                    };
                    
                    await emailService.sendSupplyOrderEmail(
                        bidDetails.business_email,
                        bidDetails.business_name,
                        orderData,
                        null // No PDF buffer for now
                    );
                } catch (emailError) {
                    console.error('Error sending supply order email:', emailError);
                    // Don't fail the transaction for email errors
                }
            }

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({
                message: 'Tender awarded successfully',
                orders_created: selectedBids.length,
                awarded_at: new Date().toISOString()
            });

        } catch (error) {
            // Rollback transaction
            await new Promise((resolve, reject) => {
                db.run('ROLLBACK', (err) => {
                    if (err) console.error('Rollback error:', err);
                    resolve();
                });
            });
            throw error;
        }

    } catch (error) {
        console.error('Error awarding tender:', error);
        res.status(500).json({ error: 'Failed to award tender' });
    }
};

// Download financial bid document
const downloadFinancialBid = async (req, res) => {
    try {
        const { bidId } = req.params;
        const db = getDatabase();

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
        const db = getDatabase();

        const bid = await new Promise((resolve, reject) => {
            db.get(
                'SELECT bid_cdr_document FROM supplier_bids WHERE id = ?',
                [bidId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

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
        const filePath = path.join(__dirname, '../../financial-reports', fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Report file not found' });
        }

        res.download(filePath, fileName);
    } catch (error) {
        console.error('Error downloading financial opening report:', error);
        res.status(500).json({ error: 'Failed to download report' });
    }
};

// Generate enhanced comparative report with multiple tabs
const generateEnhancedComparativeReport = async (tenderId, itemAnalysis, optimalCombinations) => {
    try {
        const workbook = new ExcelJS.Workbook();
        
        // === TAB 1: Optimal Combinations ===
        const optimalSheet = workbook.addWorksheet('Optimal Combinations');
        
        // Headers for optimal combinations
        optimalSheet.columns = [
            { header: 'Rank', key: 'rank', width: 8 },
            { header: 'Total Cost (Rs)', key: 'total_cost', width: 15 },
            { header: 'Avg Delivery (Days)', key: 'avg_delivery', width: 18 },
            { header: 'Items Count', key: 'items_count', width: 12 },
            { header: 'Supplier Details', key: 'supplier_details', width: 80 }
        ];
        
        // Style the header
        optimalSheet.getRow(1).font = { bold: true };
        optimalSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFD700' }
        };
        
        // Add optimal combinations data
        optimalCombinations.forEach((combo, index) => {
            const supplierDetails = combo.suppliers.map(s => 
                `${s.item_name}: ${s.company_name} (Rs ${s.total_cost.toLocaleString()}, ${s.delivery_days} days)`
            ).join(' | ');
            
            const row = optimalSheet.addRow({
                rank: index + 1,
                total_cost: combo.total_cost,
                avg_delivery: combo.average_delivery_time,
                items_count: combo.items_count,
                supplier_details: supplierDetails
            });
            
            // Highlight the best combination
            if (index === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFFE4B5' }
                };
                row.font = { bold: true };
            }
        });

        // === TAB 2: Comparative Analysis ===
        const comparativeSheet = workbook.addWorksheet('Comparative Analysis');

        // Set up headers for comparative analysis
        comparativeSheet.columns = [
            { header: 'Item Name', key: 'item_name', width: 25 },
            { header: 'Required Quantity', key: 'required_quantity', width: 15 },
            { header: 'Specifications', key: 'specifications', width: 35 },
            { header: 'Supplier Name', key: 'supplier_name', width: 25 },
            { header: 'Contact Person', key: 'contact_person', width: 20 },
            { header: 'Manufacturer/Brand', key: 'manufacturer_brand', width: 20 },
            { header: 'Proposed Quantity', key: 'proposed_quantity', width: 15 },
            { header: 'Unit Price (Rs)', key: 'unit_price', width: 15 },
            { header: 'Total Cost (Rs)', key: 'total_cost', width: 15 },
            { header: 'Unit', key: 'unit', width: 10 },
            { header: 'Delivery Days', key: 'delivery_days', width: 15 },
            { header: 'Ranking', key: 'ranking', width: 10 }
        ];

        // Style the header row
        comparativeSheet.getRow(1).font = { bold: true };
        comparativeSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F2FF' }
        };

        // Add comparative analysis data
        Object.keys(itemAnalysis).forEach(itemName => {
            const item = itemAnalysis[itemName];
            
            item.suppliers.forEach((supplier, index) => {
                const row = comparativeSheet.addRow({
                    item_name: item.item_name,
                    required_quantity: item.required_quantity,
                    specifications: item.specifications || 'N/A',
                    supplier_name: supplier.company_name,
                    contact_person: supplier.contact_person || 'N/A',
                    manufacturer_brand: supplier.manufacturer_brand || 'N/A',
                    proposed_quantity: supplier.proposed_quantity,
                    unit_price: supplier.unit_price,
                    total_cost: supplier.total_cost,
                    unit: supplier.unit,
                    delivery_days: supplier.delivery_days,
                    ranking: index + 1
                });

                // Highlight lowest bid for each item
                if (index === 0) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE6FFE6' }
                    };
                    row.font = { bold: true };
                }
            });
        });

        // === TAB 3: Item-wise Summary ===
        const summarySheet = workbook.addWorksheet('Item-wise Summary');
        
        summarySheet.columns = [
            { header: 'Item Name', key: 'item_name', width: 30 },
            { header: 'Required Qty', key: 'required_quantity', width: 12 },
            { header: 'Specifications', key: 'specifications', width: 40 },
            { header: 'Total Suppliers', key: 'total_suppliers', width: 15 },
            { header: 'Lowest Bid Company', key: 'lowest_company', width: 25 },
            { header: 'Lowest Unit Price', key: 'lowest_unit_price', width: 15 },
            { header: 'Lowest Total Cost', key: 'lowest_total_cost', width: 15 },
            { header: 'Highest Bid Company', key: 'highest_company', width: 25 },
            { header: 'Highest Unit Price', key: 'highest_unit_price', width: 15 },
            { header: 'Price Difference', key: 'price_difference', width: 15 }
        ];
        
        // Style the header row
        summarySheet.getRow(1).font = { bold: true };
        summarySheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE4E1' }
        };
        
        // Add summary data
        Object.keys(itemAnalysis).forEach(itemName => {
            const item = itemAnalysis[itemName];
            const suppliers = item.suppliers;
            const lowest = suppliers[0];
            const highest = suppliers[suppliers.length - 1];
            
            summarySheet.addRow({
                item_name: item.item_name,
                required_quantity: item.required_quantity,
                specifications: item.specifications || 'N/A',
                total_suppliers: suppliers.length,
                lowest_company: lowest.company_name,
                lowest_unit_price: lowest.unit_price,
                lowest_total_cost: lowest.total_cost,
                highest_company: highest.company_name,
                highest_unit_price: highest.unit_price,
                price_difference: highest.unit_price - lowest.unit_price
            });
        });

        // === TAB 4: Supplier Details ===
        const supplierSheet = workbook.addWorksheet('Supplier Details');
        
        supplierSheet.columns = [
            { header: 'Company Name', key: 'company_name', width: 30 },
            { header: 'Contact Person', key: 'contact_person', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Items Bid', key: 'items_bid', width: 15 },
            { header: 'Total Bid Value', key: 'total_bid_value', width: 18 },
            { header: 'Avg Unit Price', key: 'avg_unit_price', width: 15 },
            { header: 'Avg Delivery Days', key: 'avg_delivery', width: 18 },
            { header: 'Items List', key: 'items_list', width: 50 }
        ];
        
        // Style the header row
        supplierSheet.getRow(1).font = { bold: true };
        supplierSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE4B5' }
        };
        
        // Aggregate supplier data
        const supplierData = {};
        Object.keys(itemAnalysis).forEach(itemName => {
            const item = itemAnalysis[itemName];
            item.suppliers.forEach(supplier => {
                if (!supplierData[supplier.company_name]) {
                    supplierData[supplier.company_name] = {
                        company_name: supplier.company_name,
                        contact_person: supplier.contact_person,
                        email: supplier.email,
                        items: [],
                        total_value: 0,
                        total_delivery_days: 0,
                        unit_prices: []
                    };
                }
                
                supplierData[supplier.company_name].items.push(itemName);
                supplierData[supplier.company_name].total_value += supplier.total_cost;
                supplierData[supplier.company_name].total_delivery_days += supplier.delivery_days;
                supplierData[supplier.company_name].unit_prices.push(supplier.unit_price);
            });
        });
        
        // Add supplier summary data
        Object.values(supplierData).forEach(supplier => {
            const avgUnitPrice = supplier.unit_prices.reduce((sum, price) => sum + price, 0) / supplier.unit_prices.length;
            const avgDelivery = supplier.total_delivery_days / supplier.items.length;
            
            supplierSheet.addRow({
                company_name: supplier.company_name,
                contact_person: supplier.contact_person || 'N/A',
                email: supplier.email,
                items_bid: supplier.items.length,
                total_bid_value: supplier.total_value,
                avg_unit_price: Math.round(avgUnitPrice),
                avg_delivery: Math.round(avgDelivery),
                items_list: supplier.items.join(', ')
            });
        });

        // Save the workbook
        const filename = `financial-opening-report-${tenderId}-${Date.now()}.xlsx`;
        const filePath = path.join(__dirname, '../../financial-reports', filename);
        
        // Ensure directory exists
        const reportsDir = path.dirname(filePath);
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        await workbook.xlsx.writeFile(filePath);
        return filePath;

    } catch (error) {
        console.error('Error generating enhanced comparative report:', error);
        throw error;
    }
};

module.exports = {
    getTendersReadyForFinancialOpening,
    scheduleFinancialOpening,
    getScheduledFinancialOpenings,
    openFinancialBids,
    awardTenderManually,
    downloadFinancialBid,
    downloadBidCdrDocument,
    downloadFinancialOpeningReport
};

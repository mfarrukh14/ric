const { getDatabase } = require('../config/database');
const pdfService = require('../utils/pdfService');
const EmailService = require('../utils/emailService');

// Initialize email service
const emailService = new EmailService();

// Mark expired tenders for technical evaluation (new function)
const markExpiredTendersForEvaluation = async () => {
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

        console.log(`Found ${expiredTenders.length} expired tenders to mark for evaluation`);

        // Update status to 'expired' for technical evaluation
        for (const tender of expiredTenders) {
            try {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE demand_tenders SET tender_status = ? WHERE id = ?',
                        ['expired', tender.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`Tender ${tender.id} marked as expired for technical evaluation`);
            } catch (error) {
                console.error(`Error marking tender ${tender.id} as expired:`, error);
            }
        }

        return expiredTenders.length;
    } catch (error) {
        console.error('Error marking expired tenders for evaluation:', error);
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
        console.log(`Current Pakistan time: ${currentTime}`);
        
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
                        `SELECT sb.*, s.company_name, s.company_email
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
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '+' || ? || ' days'), 'pending')`,
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
                    d.item_name,
                    d.description,
                    d.urgency,
                    d.required_by,
                    s.company_name,
                    s.company_email,
                    sb.delivery_days,
                    sb.bid_comments
                FROM supply_orders so
                JOIN demand_tenders dt ON so.tender_id = dt.id
                JOIN demands d ON so.demand_id = d.id
                JOIN suppliers s ON so.supplier_id = s.id
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

module.exports = {
    processExpiredTenders,
    getAwardedTenders,
    generateSupplyOrderPDF,
    generateSupplyOrderPDFById,
    markExpiredTendersForEvaluation // Export new function
};
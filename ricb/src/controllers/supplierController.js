const { getDatabase } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const EmailService = require('../utils/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const emailService = new EmailService();

// Register a new supplier
exports.registerSupplier = async (req, res) => {
    const {
        companyName,
        companyEmail,
        password,
        confirmPassword,
        companyStatement,
        companyMission,
        contactPerson,
        contactNumber
    } = req.body;

    const db = getDatabase();

    try {
        // Validation
        if (!companyName || !companyEmail || !password || !confirmPassword || !companyStatement || !companyMission) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Check required documents
        const requiredDocs = ['professionalTaxCert', 'ntnDocument', 'drugSaleLicense', 'pecDocument', 'gstDocument'];
        const missingDocs = requiredDocs.filter(doc => !req.files || !req.files[doc]);
        
        if (missingDocs.length > 0) {
            return res.status(400).json({ 
                error: `Missing required documents: ${missingDocs.join(', ')}` 
            });
        }

        // Check if supplier already exists
        const existingSupplier = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM suppliers WHERE company_email = ?', [companyEmail], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existingSupplier) {
            return res.status(409).json({ error: 'Company email already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Store file paths
        const filePaths = {};
        for (const doc of requiredDocs) {
            if (req.files[doc]) {
                filePaths[doc] = req.files[doc][0].path;
            }
        }

        // Insert supplier
        const supplierId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO suppliers (
                    company_name, company_email, contact_person, contact_number, password, 
                    company_statement, company_mission, professional_tax_cert, ntn_document, 
                    drug_sale_license, pec_document, gst_document
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyName,
                    companyEmail,
                    contactPerson,
                    contactNumber,
                    hashedPassword,
                    companyStatement,
                    companyMission,
                    filePaths.professionalTaxCert || null,
                    filePaths.ntnDocument || null,
                    filePaths.drugSaleLicense || null,
                    filePaths.pecDocument || null,
                    filePaths.gstDocument || null
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.status(201).json({
            message: 'Supplier registration submitted successfully. Evaluation is in progress.',
            supplierId
        });

    } catch (error) {
        console.error('Supplier registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
};

// Login supplier
exports.loginSupplier = async (req, res) => {
    const { email, password } = req.body;
    const db = getDatabase();

    try {
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE company_email = ?', [email], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, supplier.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check supplier status
        if (supplier.status === 'pending') {
            return res.status(403).json({ error: 'Evaluation under progress' });
        }

        if (supplier.status === 'rejected') {
            return res.status(403).json({ 
                error: 'Profile rejected', 
                reason: supplier.rejection_reason 
            });
        }

        if (supplier.status !== 'approved') {
            return res.status(403).json({ error: 'Account not approved' });
        }

        // Generate token
        const token = jwt.sign(
            {
                id: supplier.id,
                email: supplier.company_email,
                companyName: supplier.company_name,
                type: 'supplier'
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );        res.json({
            token,
            supplier: {
                id: supplier.id,
                companyName: supplier.company_name,
                companyEmail: supplier.company_email,
                status: supplier.status,
                role: 'supplier'
            }
        });

    } catch (error) {
        console.error('Supplier login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
};

// Get all pending suppliers (for evaluation committee)
exports.getPendingSuppliers = async (req, res) => {
    const db = getDatabase();

    try {
        const suppliers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT id, company_name, company_email, company_statement, company_mission, 
                        professional_tax_cert, ntn_document, drug_sale_license, pec_document, gst_document,
                        created_at, status
                 FROM suppliers 
                 WHERE status = 'pending'
                 ORDER BY created_at ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(suppliers);
    } catch (error) {
        console.error('Error fetching pending suppliers:', error);
        res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
};

// Get supplier details with evaluations
exports.getSupplierDetails = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();

    try {
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get evaluations
        const evaluations = await new Promise((resolve, reject) => {
            db.all(
                `SELECT se.*, u.name as evaluator_name 
                 FROM supplier_evaluations se
                 JOIN users u ON se.evaluator_id = u.id
                 WHERE se.supplier_id = ?`,
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get committee members count
        const committeeCount = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as count 
                 FROM users u 
                 JOIN committees c ON u.committee_id = c.id 
                 WHERE c.name = 'Evaluation Committee'`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.count : 0);
                }
            );
        });

        res.json({
            supplier,
            evaluations,
            committeeCount
        });

    } catch (error) {
        console.error('Error fetching supplier details:', error);
        res.status(500).json({ error: 'Failed to fetch supplier details' });
    }
};

// Submit evaluation
exports.submitEvaluation = async (req, res) => {
    const { supplierId } = req.params;
    const { status, comments } = req.body;
    const evaluatorId = req.user.id;
    const db = getDatabase();

    try {
        // Validate status
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Check if user is in evaluation committee
        const isCommitteeMember = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.id 
                 FROM users u 
                 JOIN committees c ON u.committee_id = c.id 
                 WHERE u.id = ? AND c.name = 'Evaluation Committee'`,
                [evaluatorId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });

        if (!isCommitteeMember) {
            return res.status(403).json({ error: 'Access denied. You are not part of the evaluation committee.' });
        }

        // Insert or update evaluation
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO supplier_evaluations 
                 (supplier_id, evaluator_id, status, comments) 
                 VALUES (?, ?, ?, ?)`,
                [supplierId, evaluatorId, status, comments],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Check if all committee members have evaluated
        const evaluationSummary = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as total_evaluations,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
                 FROM supplier_evaluations 
                 WHERE supplier_id = ?`,
                [supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const committeeCount = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as count 
                 FROM users u 
                 JOIN committees c ON u.committee_id = c.id 
                 WHERE c.name = 'Evaluation Committee'`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.count : 0);
                }
            );
        });        // If all committee members have evaluated, update supplier status
        if (evaluationSummary.total_evaluations === committeeCount) {
            let finalStatus = 'pending';
            let rejectionReason = null;
            
            if (evaluationSummary.rejected_count > 0) {
                finalStatus = 'rejected';
                // Get rejection reasons
                const rejectionComments = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT comments FROM supplier_evaluations 
                         WHERE supplier_id = ? AND status = 'rejected' AND comments IS NOT NULL`,
                        [supplierId],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows.map(row => row.comments).filter(Boolean));
                        }
                    );
                });
                rejectionReason = rejectionComments.join('; ');
            } else if (evaluationSummary.approved_count === committeeCount) {
                finalStatus = 'approved';
            }

            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE suppliers 
                     SET status = ?, rejection_reason = ?, 
                         approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
                         rejected_at = CASE WHEN ? = 'rejected' THEN CURRENT_TIMESTAMP ELSE rejected_at END
                     WHERE id = ?`,
                    [finalStatus, rejectionReason, finalStatus, finalStatus, supplierId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Send approval email if supplier was approved
            if (finalStatus === 'approved') {
                try {
                    // Get supplier details for email
                    const approvedSupplier = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT company_email, company_name FROM suppliers WHERE id = ?',
                            [supplierId],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });

                    if (approvedSupplier) {
                        await emailService.sendSupplierApprovalEmail(
                            approvedSupplier.company_email,
                            approvedSupplier.company_name
                        );
                        console.log(`Approval email sent to ${approvedSupplier.company_name} at ${approvedSupplier.company_email}`);
                    }
                } catch (emailError) {
                    console.error('Failed to send approval email:', emailError);
                    // Don't fail the evaluation process if email fails
                }
            }
        }

        res.json({ 
            message: 'Evaluation submitted successfully',
            evaluationComplete: evaluationSummary.total_evaluations === committeeCount
        });

    } catch (error) {
        console.error('Error submitting evaluation:', error);
        res.status(500).json({ error: 'Failed to submit evaluation' });
    }
};

// Download document
exports.downloadDocument = async (req, res) => {
    const { supplierId, documentType } = req.params;
    const db = getDatabase();

    try {
        // Check if user has access (evaluation committee member or superadmin)
        const hasAccess = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.id 
                 FROM users u 
                 LEFT JOIN committees c ON u.committee_id = c.id 
                 WHERE u.id = ? AND (u.role = 'superadmin' OR c.name = 'Evaluation Committee')`,
                [req.user.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });

        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get document path
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        const documentPath = supplier[documentType];
        if (!documentPath || !fs.existsSync(documentPath)) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const filename = path.basename(documentPath);
        res.download(documentPath, filename);

    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
};

// Get active tenders for suppliers
exports.getActiveTenders = async (req, res) => {
    const db = getDatabase();
    
    try {        // Get active tenders with demand info (excluding expired tenders using Pakistan timezone)
        const activeTenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    dt.id,
                    dt.demand_id,
                    dt.bidding_end_time,
                    dt.tender_status,
                    d.item_name,
                    d.quantity,
                    d.description,
                    d.urgency,
                    d.required_by,
                    COUNT(sb.id) as bid_count
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id
                 WHERE dt.tender_status = 'active' AND datetime(dt.bidding_end_time) > datetime('now', 'localtime')
                 GROUP BY dt.id
                 ORDER BY dt.bidding_end_time ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // For each tender, get the associated items from demand_items table
        const tendersWithItems = await Promise.all(activeTenders.map(async (tender) => {
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT id, item_name, quantity, estimated_cost, unit, remarks
                     FROM demand_items 
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

            // If no items found in demand_items (legacy single-item demand), 
            // use the data from demands table
            if (items.length === 0) {
                return {
                    ...tender,
                    items: [{
                        id: 0, // Placeholder for legacy items
                        item_name: tender.item_name,
                        quantity: tender.quantity,
                        estimated_cost: null,
                        unit: 'pieces',
                        remarks: null
                    }]
                };
            } else {
                return {
                    ...tender,
                    items: items
                };
            }
        }));

        res.json(tendersWithItems);
    } catch (error) {
        console.error('Error fetching active tenders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Submit bid for a tender
exports.submitBid = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { proposedQuantity, totalCost, deliveryDays, comments, items } = req.body;
    const supplierId = req.user.id;

    try {
        // Validate required fields
        if (!proposedQuantity || !totalCost || !deliveryDays) {
            return res.status(400).json({ message: 'Proposed quantity, total cost, and delivery days are required' });
        }

        // Validate required documents
        if (!req.files || !req.files.technicalBid || !req.files.financialBid) {
            return res.status(400).json({ message: 'Both technical bid and financial bid PDF documents are required' });
        }

        if (parseFloat(totalCost) <= 0 || parseInt(proposedQuantity) <= 0 || parseInt(deliveryDays) <= 0) {
            return res.status(400).json({ message: 'All numeric values must be greater than 0' });
        }

        // Parse items data if provided
        let itemsData = [];
        if (items) {
            try {
                itemsData = typeof items === 'string' ? JSON.parse(items) : items;
            } catch (error) {
                return res.status(400).json({ message: 'Invalid items data format' });
            }
        }

        // Validate that at least one item has a valid bid
        if (itemsData.length === 0) {
            return res.status(400).json({ message: 'At least one item with quantity and cost is required' });
        }

        // Validate each item
        for (const item of itemsData) {
            if (!item.can_provide || !item.total_cost || item.can_provide <= 0 || item.total_cost <= 0) {
                return res.status(400).json({ 
                    message: `Invalid bid data for item "${item.item_name}". Quantity and cost must be greater than 0.` 
                });
            }
        }

        // Validate tender exists and is active (using Pakistan timezone)
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM demand_tenders 
                 WHERE id = ? AND tender_status = 'active' AND bidding_end_time > datetime('now', 'localtime')`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or expired' });
        }

        // Check if supplier already submitted a bid
        const existingBid = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM supplier_bids WHERE tender_id = ? AND supplier_id = ?',
                [tenderId, supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingBid) {
            return res.status(400).json({ message: 'You have already submitted a bid for this tender. Bids cannot be modified once submitted.' });
        }

        // Start transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Get uploaded file paths
            const technicalBidPath = req.files.technicalBid[0].path;
            const financialBidPath = req.files.financialBid[0].path;

            // Insert main bid record
            const bidResult = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO supplier_bids (tender_id, supplier_id, total_cost, proposed_quantity, delivery_days, bid_comments, technical_bid_document, financial_bid_document)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [tenderId, supplierId, totalCost, proposedQuantity, deliveryDays, comments, technicalBidPath, financialBidPath],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID });
                    }
                );
            });

            const bidId = bidResult.id;

            // Insert item-specific bid data
            for (const item of itemsData) {
                const unitPrice = parseFloat(item.total_cost) / parseInt(item.can_provide);
                
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO supplier_bid_items 
                         (bid_id, item_id, item_name, required_quantity, proposed_quantity, unit_price, total_cost, unit)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            bidId,
                            item.item_id,
                            item.item_name,
                            item.required_quantity,
                            item.can_provide,
                            unitPrice.toFixed(2),
                            item.total_cost,
                            item.unit || 'pieces'
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.status(201).json({ message: 'Bid submitted successfully with item details' });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Error submitting bid:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get supplier's own bids
exports.getSupplierBids = async (req, res) => {
    const db = getDatabase();
    const supplierId = req.user.id;

    try {
        const bids = await new Promise((resolve, reject) => {
            db.all(                `SELECT 
                    sb.*,
                    dt.tender_status,
                    dt.bidding_end_time as expiry_date,
                    dt.awarded_supplier_id,
                    d.item_name,
                    d.quantity,
                    d.description,
                    d.urgency,
                    d.required_by,                    CASE 
                        WHEN dt.awarded_supplier_id = sb.supplier_id THEN 'won'
                        WHEN dt.tender_status = 'awarded' THEN 'lost'
                        WHEN dt.tender_status = 'active' AND dt.bidding_end_time > datetime('now', 'localtime') THEN 'pending'
                        ELSE 'expired'
                    END as bid_status
                 FROM supplier_bids sb
                 JOIN demand_tenders dt ON sb.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE sb.supplier_id = ?
                 ORDER BY sb.created_at DESC`,
                [supplierId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(bids);
    } catch (error) {
        console.error('Error fetching supplier bids:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

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
        companyMission
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
                    company_name, company_email, password, company_statement, company_mission,
                    professional_tax_cert, ntn_document, drug_sale_license, pec_document, gst_document
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyName,
                    companyEmail,
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

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../config/database');
const { sendOTPEmail } = require('../utils/otpService');

// Generate random OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Initial supplier registration (creates account but doesn't complete profile)
const registerSupplier = async (req, res) => {
    console.log('🚀 Register supplier request received:', req.body);
    
    const { username, businessEmail, password } = req.body;
    
    if (!username || !businessEmail || !password) {
        console.log('❌ Missing required fields');
        return res.status(400).json({ error: 'Username, business email, and password are required' });
    }

    const db = getDatabase();

    try {
        console.log('🔍 Checking if supplier already exists...');
        
        // Check if username or email already exists
        const existingSupplier = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM suppliers WHERE username = ? OR business_email = ?',
                [username, businessEmail],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingSupplier) {
            console.log('❌ Supplier already exists');
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        console.log('🔐 Hashing password...');
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log('💾 Creating supplier account...');
        // Create supplier account
        const supplierId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO suppliers (username, business_email, password, email_verified, registration_step, status) 
                 VALUES (?, ?, ?, 0, 0, 'draft')`,
                [username, businessEmail, hashedPassword],
                function(err) {
                    if (err) {
                        console.error('Database error:', err);
                        reject(err);
                    } else {
                        console.log('✅ Supplier created with ID:', this.lastID);
                        resolve(this.lastID);
                    }
                }
            );
        });

        console.log('🔑 Generating JWT token...');
        // Generate JWT token
        const token = jwt.sign(
            { supplierId, username, businessEmail },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        console.log('✅ Registration successful');
        res.status(201).json({
            message: 'Account created successfully. Please complete your registration.',
            token,
            supplier: {
                id: supplierId,
                username,
                businessEmail,
                emailVerified: false,
                registrationStep: 0,
                status: 'draft'
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
};

// Supplier login
const loginSupplier = async (req, res) => {
    const { usernameOrEmail, password } = req.body;
    
    if (!usernameOrEmail || !password) {
        return res.status(400).json({ error: 'Username/email and password are required' });
    }

    const db = getDatabase();

    try {
        // Find supplier by username or email
        const supplier = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM suppliers WHERE username = ? OR business_email = ?',
                [usernameOrEmail, usernameOrEmail],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!supplier) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, supplier.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { supplierId: supplier.id, username: supplier.username, businessEmail: supplier.business_email },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' }
        );

        // Check if supplier needs to complete registration
        if (supplier.registration_step < 6 || supplier.status === 'draft') {
            return res.json({
                message: 'Login successful. Please complete your registration.',
                token,
                supplier: {
                    id: supplier.id,
                    username: supplier.username,
                    businessEmail: supplier.business_email,
                    emailVerified: supplier.email_verified === 1,
                    registrationStep: supplier.registration_step,
                    status: supplier.status
                },
                requiresRegistration: true,
                requiresEmailVerification: supplier.email_verified === 0
            });
        }

        // Check if supplier is approved
        if (supplier.status !== 'approved') {
            return res.status(403).json({ 
                error: supplier.status === 'rejected' 
                    ? `Your application has been rejected. Reason: ${supplier.rejection_reason}` 
                    : 'Your application is pending approval'
            });
        }

        res.json({
            message: 'Login successful',
            token,
            supplier: {
                id: supplier.id,
                username: supplier.username,
                businessEmail: supplier.business_email,
                emailVerified: supplier.email_verified === 1,
                registrationStep: supplier.registration_step,
                status: supplier.status
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

// Send email OTP for verification
const sendEmailOTP = async (req, res) => {
    const { supplierId } = req.body;
    
    if (!supplierId) {
        return res.status(400).json({ error: 'Supplier ID is required' });
    }

    const db = getDatabase();

    try {
        // Get supplier email
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT business_email FROM suppliers WHERE id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store OTP in database
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO supplier_otp_verifications 
                 (supplier_id, email, otp_code, otp_type, expires_at, verified) 
                 VALUES (?, ?, ?, 'email_verification', ?, 0)`,
                [supplierId, supplier.business_email, otp, expiresAt.toISOString()],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Send OTP email
        await sendOTPEmail(supplier.business_email, otp);

        res.json({ message: 'OTP sent successfully' });

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
};

// Verify email OTP
const verifyEmailOTP = async (req, res) => {
    const { supplierId, otp } = req.body;
    
    if (!supplierId || !otp) {
        return res.status(400).json({ error: 'Supplier ID and OTP are required' });
    }

    const db = getDatabase();

    try {
        // Find valid OTP
        const otpRecord = await new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM supplier_otp_verifications 
                 WHERE supplier_id = ? AND otp_code = ? AND otp_type = 'email_verification' 
                 AND verified = 0 AND expires_at > datetime('now')`,
                [supplierId, otp],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // Mark OTP as verified
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE supplier_otp_verifications SET verified = 1 WHERE id = ?',
                [otpRecord.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Mark supplier email as verified
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE suppliers SET email_verified = 1 WHERE id = ?',
                [supplierId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Email verified successfully' });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: 'Failed to verify OTP' });
    }
};

// Save registration step data
const saveRegistrationStep = async (req, res) => {
    const { supplierId, step, data } = req.body;
    
    if (!supplierId || !step || !data) {
        return res.status(400).json({ error: 'Supplier ID, step, and data are required' });
    }

    const db = getDatabase();

    try {
        switch (step) {
            case 1:
                // Save business profile
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT OR REPLACE INTO supplier_business_profile 
                         (supplier_id, business_entity_type, business_category, business_industry, 
                          description, iban_number, business_name, origin_classification, origin_country, 
                          date_of_incorporation, website_url, business_mobile_number, business_fax_number, updated_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                        [
                            supplierId,
                            data.businessProfile.businessEntityType,
                            data.businessProfile.businessCategory,
                            data.businessProfile.businessIndustry,
                            data.businessProfile.description,
                            data.businessProfile.ibanNumber,
                            data.businessProfile.businessName,
                            data.businessProfile.originClassification,
                            data.businessProfile.originCountry,
                            data.businessProfile.dateOfIncorporation,
                            data.businessProfile.websiteUrl,
                            data.businessProfile.businessMobileNumber,
                            data.businessProfile.businessFaxNumber
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                break;

            case 3:
                // Save registration bodies
                if (data.registrationBodies && data.registrationBodies.length > 0) {
                    // Clear existing registration bodies
                    await new Promise((resolve, reject) => {
                        db.run('DELETE FROM supplier_registration_bodies WHERE supplier_id = ?', [supplierId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Insert new registration bodies
                    for (const body of data.registrationBodies) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO supplier_registration_bodies 
                                 (supplier_id, registration_body, registration_number, registration_date) 
                                 VALUES (?, ?, ?, ?)`,
                                [supplierId, body.registrationBody, body.registrationNumber, body.registrationDate],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }
                break;

            case 5:
                // Save addresses
                if (data.addresses && data.addresses.length > 0) {
                    // Clear existing addresses
                    await new Promise((resolve, reject) => {
                        db.run('DELETE FROM supplier_addresses WHERE supplier_id = ?', [supplierId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Insert new addresses
                    for (const address of data.addresses) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO supplier_addresses 
                                 (supplier_id, address_type, address_line_1, address_line_2, city, state_province, postal_code, country) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    supplierId,
                                    address.addressType,
                                    address.addressLine1,
                                    address.addressLine2 || null,
                                    address.city,
                                    address.stateProvince,
                                    address.postalCode,
                                    address.country
                                ],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }
                break;

            case 6:
                // Save PPRA registrations
                if (data.ppraRegistrations && data.ppraRegistrations.length > 0) {
                    // Clear existing PPRA registrations
                    await new Promise((resolve, reject) => {
                        db.run('DELETE FROM supplier_ppra_registrations WHERE supplier_id = ?', [supplierId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Insert new PPRA registrations
                    for (const ppra of data.ppraRegistrations) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO supplier_ppra_registrations 
                                 (supplier_id, ppra_type, registration_number, registration_date, expiry_date) 
                                 VALUES (?, ?, ?, ?, ?)`,
                                [
                                    supplierId,
                                    ppra.ppraType,
                                    ppra.registrationNumber,
                                    ppra.registrationDate,
                                    ppra.expiryDate || null
                                ],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }
                break;
        }

        // Update registration step
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE suppliers SET registration_step = ? WHERE id = ?',
                [Math.max(step, 0), supplierId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Step saved successfully' });

    } catch (error) {
        console.error('Save step error:', error);
        res.status(500).json({ error: 'Failed to save step' });
    }
};

// Submit final application
const submitApplication = async (req, res) => {
    const { supplierId } = req.body;
    
    if (!supplierId) {
        return res.status(400).json({ error: 'Supplier ID is required' });
    }

    const db = getDatabase();

    try {
        // Handle file uploads
        const documentTypes = ['professionalTaxCert', 'ntnDocument', 'drugSaleLicense', 'pecDocument', 'gstDocument'];
        
        for (const docType of documentTypes) {
            if (req.files && req.files[docType]) {
                const file = req.files[docType][0];
                
                // Save document record
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO supplier_documents 
                         (supplier_id, document_type, file_path, original_name) 
                         VALUES (?, ?, ?, ?)`,
                        [supplierId, docType, file.path, file.originalname],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }

        // Update supplier status to pending and registration step to 6
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE suppliers SET status = ?, registration_step = 6 WHERE id = ?',
                ['pending', supplierId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Application submitted successfully and is now pending approval' });

    } catch (error) {
        console.error('Submit application error:', error);
        res.status(500).json({ error: 'Failed to submit application' });
    }
};

// Get pending suppliers for admin review
const getPendingSuppliers = async (req, res) => {
    const db = getDatabase();

    try {
        const suppliers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    s.id, 
                    s.username,
                    s.business_email as company_email,
                    bp.business_name as company_name, 
                    bp.business_category, 
                    bp.origin_classification,
                    s.status,
                    s.created_at
                 FROM suppliers s 
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id 
                 WHERE s.status = 'pending' 
                 ORDER BY s.created_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({ suppliers });

    } catch (error) {
        console.error('Get pending suppliers error:', error);
        res.status(500).json({ error: 'Failed to fetch pending suppliers' });
    }
};

// Get supplier details for admin review
const getSupplierDetails = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();

    try {
        // Get supplier basic info
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile
        const businessProfile = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM supplier_business_profile WHERE supplier_id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Get registration bodies
        const registrationBodies = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_registration_bodies WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get documents
        const documents = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_documents WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get addresses
        const addresses = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_addresses WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get PPRA registrations
        const ppraRegistrations = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({
            supplier,
            businessProfile,
            registrationBodies,
            documents,
            addresses,
            ppraRegistrations
        });

    } catch (error) {
        console.error('Get supplier details error:', error);
        res.status(500).json({ error: 'Failed to fetch supplier details' });
    }
};

// Approve or reject supplier
const submitEvaluation = async (req, res) => {
    const { supplierId } = req.params;
    const { action, rejectionReason } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be approve or reject' });
    }

    if (action === 'reject' && !rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const db = getDatabase();

    try {
        const status = action === 'approve' ? 'approved' : 'rejected';
        const timestamp = new Date().toISOString();

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE suppliers SET status = ?, rejection_reason = ?, 
                 ${action === 'approve' ? 'approved_at' : 'rejected_at'} = ? 
                 WHERE id = ?`,
                [status, rejectionReason || null, timestamp, supplierId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ 
            message: `Supplier ${action}d successfully`,
            action,
            status
        });

    } catch (error) {
        console.error('Submit evaluation error:', error);
        res.status(500).json({ error: 'Failed to submit evaluation' });
    }
};

// Download document
const downloadDocument = async (req, res) => {
    const { supplierId, documentType } = req.params;
    const db = getDatabase();

    try {
        const document = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM supplier_documents WHERE supplier_id = ? AND document_type = ?',
                [supplierId, documentType],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const filePath = path.resolve(document.file_path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath, document.original_name);

    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
};

// Functions for tenders and bids (existing functionality)
const getActiveTenders = async (req, res) => {
    const db = getDatabase();

    try {
        const tenders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.quantity, d.estimated_cost, d.description 
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.status = 'active' AND dt.submission_deadline > datetime('now')
                 ORDER BY dt.submission_deadline ASC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({ tenders });

    } catch (error) {
        console.error('Get active tenders error:', error);
        res.status(500).json({ error: 'Failed to fetch active tenders' });
    }
};

const submitBid = async (req, res) => {
    // Implementation for bid submission
    res.status(501).json({ error: 'Bid submission not yet implemented in new system' });
};

const getSupplierBids = async (req, res) => {
    // Implementation for getting supplier bids
    res.status(501).json({ error: 'Get supplier bids not yet implemented in new system' });
};

// Legacy functions for backward compatibility (can be removed later)
const legacyRegisterSupplier = registerSupplier;
const sendRegistrationOTP = sendEmailOTP;
const verifySMSOTP = (req, res) => res.status(400).json({ error: 'SMS OTP no longer supported' });
const completeRegistration = submitApplication;
const resendOTP = sendEmailOTP;

// Get comprehensive supplier data for evaluation
const getComprehensiveSupplierData = async (req, res) => {
    const { id } = req.params; // Changed from supplierId to id to match route
    console.log('Getting comprehensive data for supplier ID:', id);
    const db = getDatabase();

    try {
        // Get supplier basic information
        console.log('Querying supplier basic info...');
        const supplier = db.prepare(`
            SELECT * FROM suppliers WHERE id = ?
        `).get(id);
        console.log('Supplier result:', supplier);

        if (!supplier) {
            console.log('Supplier not found');
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile
        console.log('Querying business profile...');
        const businessProfileRaw = db.prepare(`
            SELECT * FROM supplier_business_profile WHERE supplier_id = ?
        `).get(id);
        console.log('Business profile raw result:', businessProfileRaw);
        
        // Map business profile to expected format
        const businessProfile = businessProfileRaw ? {
            business_name: businessProfileRaw.business_name || '',
            legal_structure: businessProfileRaw.business_entity_type || '',
            business_category: businessProfileRaw.business_category || '',
            business_subcategory: businessProfileRaw.business_industry || '',
            business_description: businessProfileRaw.description || '',
            business_tax_id: businessProfileRaw.iban_number || '', // Mapping IBAN to tax ID for now
            business_registration_number: businessProfileRaw.iban_number || '',
            origin_classification: businessProfileRaw.origin_classification || '',
            country_of_origin: businessProfileRaw.origin_country || '',
            date_of_establishment: businessProfileRaw.date_of_incorporation || '',
            contact_person_name: 'N/A', // Not available in current schema
            phone_number: businessProfileRaw.business_mobile_number || '',
            alternate_phone: businessProfileRaw.business_fax_number || ''
        } : null;

        // Get addresses
        console.log('Querying addresses...');
        const addressesRaw = db.prepare(`
            SELECT * FROM supplier_addresses WHERE supplier_id = ?
        `).all(id);
        console.log('Addresses raw result:', addressesRaw);
        
        // Map addresses to expected format (filter out null values and add null checks)
        const addresses = (addressesRaw || [])
            .filter(addr => addr !== null && addr !== undefined)
            .map(addr => ({
                address_type: addr.address_type || '',
                street_address: (addr.address_line_1 || '') + (addr.address_line_2 ? ', ' + addr.address_line_2 : ''),
                city: addr.city || '',
                state: addr.state_province || '',
                postal_code: addr.postal_code || '',
                country: addr.country || ''
            }));

        // Get documents
        console.log('Querying documents...');
        const documents = db.prepare(`
            SELECT * FROM supplier_documents WHERE supplier_id = ?
        `).all(id);
        console.log('Documents result:', documents);

        // Get registration bodies
        console.log('Querying registration bodies...');
        const registrationBodies = db.prepare(`
            SELECT * FROM supplier_registration_bodies WHERE supplier_id = ?
        `).all(id);
        console.log('Registration bodies result:', registrationBodies);

        // Get PPRA registrations
        console.log('Querying PPRA registrations...');
        const ppraRegistrations = db.prepare(`
            SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?
        `).all(id);
        console.log('PPRA registrations result:', ppraRegistrations);

        // Get existing evaluations
        console.log('Querying evaluations...');
        const evaluations = db.prepare(`
            SELECT 
                se.*,
                u.username as evaluator_name
            FROM supplier_evaluations se
            LEFT JOIN users u ON se.evaluator_id = u.id
            WHERE se.supplier_id = ?
            ORDER BY se.created_at DESC
        `).all(id);
        console.log('Evaluations result:', evaluations);

        // Get committee count for progress tracking (assuming committee members are users with role = 'committee')
        console.log('Querying committee count...');
        const committeeCount = db.prepare(`
            SELECT COUNT(*) as count FROM users WHERE role = 'committee'
        `).get();
        console.log('Committee count result:', committeeCount);

        const comprehensiveData = {
            supplier: supplier || null,
            businessProfile: businessProfile || null,
            addresses: addresses || [],
            documents: (documents || []).filter(doc => doc !== null && doc !== undefined),
            registrationBodies: (registrationBodies || []).filter(body => body !== null && body !== undefined),
            ppraRegistrations: (ppraRegistrations || []).filter(ppra => ppra !== null && ppra !== undefined),
            evaluations: (evaluations || []).filter(eval => eval !== null && eval !== undefined),
            committeeCount: committeeCount?.count || 0
        };

        console.log('Final comprehensive data:', comprehensiveData);
        res.json(comprehensiveData);

    } catch (error) {
        console.error('Error fetching comprehensive supplier data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Request resubmission from supplier
const requestResubmission = async (req, res) => {
    const { supplierId } = req.params;
    const { issues, additionalMessage } = req.body;
    const evaluatorId = req.user.id;
    const db = getDatabase();

    try {
        // Get supplier information
        const supplier = db.prepare(`
            SELECT * FROM suppliers WHERE id = ?
        `).get(supplierId);

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile for email
        const businessProfile = db.prepare(`
            SELECT * FROM supplier_business_profile WHERE supplier_id = ?
        `).get(supplierId);

        // Update supplier status to pending_resubmission
        db.prepare(`
            UPDATE suppliers 
            SET status = 'pending_resubmission', 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(supplierId);

        // Log the resubmission request
        db.prepare(`
            INSERT INTO supplier_evaluations (
                supplier_id, 
                evaluator_id, 
                status, 
                comments,
                created_at
            ) VALUES (?, ?, 'resubmission_requested', ?, CURRENT_TIMESTAMP)
        `).run(
            supplierId, 
            evaluatorId, 
            `Resubmission requested: ${additionalMessage || 'Please review and resubmit application'}`
        );

        // Send email notification to supplier
        try {
            const EmailService = require('../utils/emailService');
            const emailService = new EmailService();
            await emailService.sendSupplierResubmissionEmail(
                supplier.business_email || supplier.company_email,
                businessProfile?.business_name || supplier.company_name,
                issues || [],
                additionalMessage || ''
            );
        } catch (emailError) {
            console.error('Failed to send resubmission email:', emailError);
            // Don't fail the request if email fails
        }

        res.json({ 
            message: 'Resubmission request sent successfully',
            status: 'pending_resubmission'
        });

    } catch (error) {
        console.error('Error requesting resubmission:', error);
        res.status(500).json({ error: 'Failed to send resubmission request' });
    }
};

module.exports = {
    registerSupplier,
    loginSupplier,
    sendEmailOTP,
    verifyEmailOTP,
    saveRegistrationStep,
    submitApplication,
    getPendingSuppliers,
    getSupplierDetails,
    submitEvaluation,
    downloadDocument,
    getActiveTenders,
    submitBid,
    getSupplierBids,
    // Legacy exports for backward compatibility
    legacyRegisterSupplier,
    sendRegistrationOTP,
    verifySMSOTP,
    completeRegistration,
    resendOTP,
    getComprehensiveSupplierData,
    requestResubmission
};

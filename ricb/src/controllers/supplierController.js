const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../config/database');
const { sendOTPEmail } = require('../utils/otpService');
const auditLogger = require('../utils/auditLogger');

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
            process.env.JWT_SECRET || 'your-secret-key',
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
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        // Check if supplier needs to complete registration or resubmit
        if (supplier.registration_step < 6 || supplier.status === 'draft' || supplier.status === 'pending_resubmission') {
            return res.json({
                message: supplier.status === 'pending_resubmission' 
                    ? 'Login successful. Please review feedback and resubmit your application.'
                    : 'Login successful. Please complete your registration.',
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
                requiresEmailVerification: supplier.email_verified === 0,
                isResubmission: supplier.status === 'pending_resubmission'
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
    
    console.log('🔍 Save registration step called:');
    console.log('  Supplier ID:', supplierId);
    console.log('  Step:', step);
    console.log('  Data keys:', Object.keys(data || {}));
    if (data && data.businessProfile) {
        console.log('  Business profile data:', data.businessProfile);
    }
    if (data && data.registrationBodies) {
        console.log('  Registration bodies data:', data.registrationBodies);
    }
    if (data && data.addresses) {
        console.log('  Addresses data:', data.addresses);
    }
    if (data && data.pastExperience) {
        console.log('  Past experience data:', data.pastExperience);
    }
    
    if (!supplierId || !step || !data) {
        console.log('❌ Missing required fields');
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
                          description, iban_number, business_name, contact_person_name, origin_classification, origin_country, 
                          date_of_incorporation, website_url, business_mobile_number, business_fax_number, updated_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                        [
                            supplierId,
                            data.businessProfile.businessEntityType,
                            data.businessProfile.businessCategory,
                            data.businessProfile.businessIndustry,
                            data.businessProfile.description,
                            data.businessProfile.ibanNumber,
                            data.businessProfile.businessName,
                            data.businessProfile.contactPersonName,
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
                // Save Past Experience (Step 6)
                if (data.pastExperience && data.pastExperience.length > 0) {
                    // Clear existing past experience
                    await new Promise((resolve, reject) => {
                        db.run('DELETE FROM supplier_past_experience WHERE supplier_id = ?', [supplierId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Insert new past experience
                    for (const experience of data.pastExperience) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO supplier_past_experience 
                                 (supplier_id, project_title, client_name, work_type, project_value, duration, start_date, end_date, status, description) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    supplierId,
                                    experience.projectTitle,
                                    experience.clientName,
                                    experience.workType,
                                    experience.projectValue || null,
                                    experience.duration || null,
                                    experience.startDate || null,
                                    experience.endDate || null,
                                    experience.status || 'Completed',
                                    experience.description || null
                                ],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }

                // Save Client References
                if (data.clientReferences && data.clientReferences.length > 0) {
                    // Clear existing client references
                    await new Promise((resolve, reject) => {
                        db.run('DELETE FROM supplier_client_references WHERE supplier_id = ?', [supplierId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Insert new client references
                    for (const reference of data.clientReferences) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO supplier_client_references 
                                 (supplier_id, contact_name, organization, position, phone, email, relationship) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    supplierId,
                                    reference.contactName,
                                    reference.organization,
                                    reference.position || null,
                                    reference.phone || null,
                                    reference.email || null,
                                    reference.relationship || null
                                ],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }

                // Save Work Proof Images (for now just store URLs/paths)
                if (data.workProofImages && data.workProofImages.length > 0) {
                    // Clear existing work proof images
                    await new Promise((resolve, reject) => {
                        db.run('DELETE FROM supplier_work_proof_images WHERE supplier_id = ?', [supplierId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // Insert new work proof images
                    for (const image of data.workProofImages) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO supplier_work_proof_images 
                                 (supplier_id, image_url, description, project_reference) 
                                 VALUES (?, ?, ?, ?)`,
                                [
                                    supplierId,
                                    image.preview || image.file?.name || 'uploaded_image',
                                    image.description || null,
                                    image.project_reference || null
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

            case 7:
                // Save PPRA registrations (Step 7)
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

        // Check if this is a resubmission before updating status
        const currentSupplier = await new Promise((resolve, reject) => {
            db.get('SELECT status FROM suppliers WHERE id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        const isResubmission = currentSupplier && currentSupplier.status === 'pending_resubmission';

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
        
        res.json({ 
            message: isResubmission 
                ? 'Application resubmitted successfully and is now pending review' 
                : 'Application submitted successfully and is now pending approval' 
        });

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
                 WHERE s.status IN ('pending', 'pending_resubmission') 
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
            registrationBodies: Array.isArray(registrationBodies) ? registrationBodies.map(body => ({
                id: body.id,
                registrationBody: body.registration_body,
                registrationNumber: body.registration_number,
                registrationDate: body.registration_date,
                createdAt: body.created_at
            })) : [],
            documents,
            addresses,
            ppraRegistrations: Array.isArray(ppraRegistrations) ? ppraRegistrations.map(ppra => ({
                id: ppra.id,
                ppraType: ppra.ppra_type,
                registrationNumber: ppra.registration_number,
                registrationDate: ppra.registration_date,
                expiryDate: ppra.expiry_date,
                createdAt: ppra.created_at
            })) : []
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

        // First, get supplier details for email
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Update supplier status
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

        // Send email notification
        try {
            const EmailService = require('../utils/emailService');
            const emailService = new EmailService();
            
            if (action === 'approve') {
                await emailService.sendSupplierApprovalEmail(supplier.business_email, supplier.username);
                console.log(`Approval email sent to ${supplier.business_email}`);
            } else {
                // For rejection, we'll use a generic HTML email since there's no specific method
                const nodemailer = require('nodemailer');
                const transporter = nodemailer.createTransporter({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    }
                });

                const mailOptions = {
                    from: {
                        name: process.env.EMAIL_FROM_NAME || 'RIC E-Tender System',
                        address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
                    },
                    to: supplier.business_email,
                    subject: 'Supplier Registration Status Update',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #dc3545;">Registration Status Update</h2>
                            <p>Dear ${supplier.username},</p>
                            <p>We regret to inform you that your supplier registration with Rawalpindi Institute of Cardiology has been <strong>REJECTED</strong>.</p>
                            <p><strong>Reason:</strong> ${rejectionReason}</p>
                            <p>If you believe this is an error or would like to reapply, please contact our support team.</p>
                            <p>Best regards,<br>RIC Procurement Team</p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log(`Rejection email sent to ${supplier.business_email}`);
            }
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Don't fail the whole operation if email fails
        }

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
    console.log('🔍 getActiveTenders called by user:', req.user);
    const db = getDatabase();

    try {
        // Get all tenders with status active (time filter applied in JS for broader timestamp compatibility)
        const rawActive = await new Promise((resolve, reject) => {
            db.all(
                `SELECT dt.*, d.item_name, d.quantity, d.estimated_cost, d.description, d.urgency, d.required_by
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.tender_status = 'active'
                 ORDER BY dt.bidding_end_time ASC`,
                (err, rows) => {
                    if (err) {
                        console.error('❌ Database error in getActiveTenders:', err);
                        reject(err);
                    } else {
                        console.log('✅ Raw active tenders fetched:', rows.length);
                        resolve(rows || []);
                    }
                }
            );
        });

        // Normalize and filter by bidding_end_time > now
        const nowTs = Date.now();
        const tenders = rawActive.filter(t => {
            if (!t.bidding_end_time) return false;
            // Normalize possible ISO / with T / with Z / without space
            let raw = t.bidding_end_time;
            // Replace 'T' with space for readability (Date can still parse ISO with T, but keep uniform)
            const parsed = Date.parse(raw);
            if (isNaN(parsed)) {
                // Try fallback by stripping Z and milliseconds
                let fallback = raw.replace('T',' ').replace('Z','').split('.')[0];
                const parsedFallback = Date.parse(fallback);
                if (isNaN(parsedFallback)) {
                    console.warn('⚠️ Unparseable bidding_end_time, excluding tender id', t.id, raw);
                    return false;
                }
                return parsedFallback > nowTs;
            }
            return parsed > nowTs;
        });
        console.log(`🕒 After time filtering, active tenders remaining: ${tenders.length}`);

        // For each tender, get the associated demand items
        const tendersWithItems = await Promise.all(
            tenders.map(async (tender) => {
                const items = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT id, item_name, quantity, estimated_cost, remarks, specifications, unit 
                         FROM demand_items 
                         WHERE demand_id = ? AND is_removed = 0`,
                        [tender.demand_id],
                        (err, itemRows) => {
                            if (err) {
                                console.error('❌ Database error fetching items for tender:', tender.id, err);
                                reject(err);
                            } else {
                                resolve(itemRows || []);
                            }
                        }
                    );
                });

                // Return tender with items array
                return {
                    ...tender,
                    items: items.length > 0 ? items : [
                        {
                            id: `${tender.demand_id}-main`,
                            item_name: tender.item_name,
                            quantity: tender.quantity,
                            estimated_cost: tender.estimated_cost,
                            remarks: tender.description,
                            unit: 'pieces'
                        }
                    ]
                };
            })
        );

    console.log('📤 Returning tenders with items (filtered):', tendersWithItems.length);
        res.json(tendersWithItems);

    } catch (error) {
        console.error('Get active tenders error:', error);
        res.status(500).json({ error: 'Failed to fetch active tenders' });
    }
};

const submitBid = async (req, res) => {
    const { tenderId } = req.params;
    const supplierId = req.user.id;
    const db = getDatabase();

    try {
        console.log('🔵 SubmitBid - Starting bid submission process');
        console.log('Tender ID:', tenderId);
        console.log('Supplier ID:', supplierId);
        console.log('Request body:', req.body);
        console.log('Uploaded files:', req.files);

        // Validate required fields
        const { 
            proposedQuantity, 
            totalCost, 
            deliveryDays, 
            comments, 
            items,
            companyName,
            registeredNumber,
            agreeToTerms
        } = req.body;

        if (!proposedQuantity || !totalCost || !deliveryDays) {
            return res.status(400).json({ 
                error: 'Missing required fields: proposedQuantity, totalCost, deliveryDays' 
            });
        }

        if (!agreeToTerms || agreeToTerms !== 'true') {
            return res.status(400).json({ 
                error: 'You must agree to the terms and conditions to submit a bid' 
            });
        }

        // Validate files
        if (!req.files || !req.files.technicalBid || !req.files.financialBid || !req.files.bidCdrDocument) {
            return res.status(400).json({ 
                error: 'Technical bid, financial bid, and Bid CDR 2% documents are all required' 
            });
        }

        // Check if tender exists and is active for bidding
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.item_name, d.description, d.quantity as demand_quantity
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

        if (!tender) {
            return res.status(404).json({ error: 'Tender not found' });
        }

        // Check if tender is still accepting bids
        const now = new Date();
        const biddingEndTime = new Date(tender.bidding_end_time);
        
        if (now > biddingEndTime) {
            return res.status(400).json({ error: 'Bidding period has ended for this tender' });
        }

        if (tender.tender_status !== 'active') {
            return res.status(400).json({ error: 'This tender is not accepting bids' });
        }

        // Check if supplier has already submitted a bid for this tender
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
            return res.status(400).json({ 
                error: 'You have already submitted a bid for this tender' 
            });
        }

        // Ensure supplier acknowledged knockout clauses and all were checked
        const knockoutAck = await new Promise((resolve, reject) => {
            db.get(
                `SELECT all_clauses_checked FROM supplier_knockout_acknowledgments 
                 WHERE tender_id = ? AND supplier_id = ?`,
                [tenderId, supplierId],
                (err, row) => { if (err) reject(err); else resolve(row); }
            );
        });
        if (!knockoutAck || knockoutAck.all_clauses_checked !== 1) {
            return res.status(400).json({ 
                error: 'Please review and acknowledge all knockout clauses before submitting a bid.'
            });
        }

        // Get file paths
        const technicalBidPath = req.files.technicalBid[0].filename;
        const financialBidPath = req.files.financialBid[0].filename;
        const bidCdrDocumentPath = req.files.bidCdrDocument[0].filename;

        console.log('📁 File paths:', {
            technical: technicalBidPath,
            financial: financialBidPath,
            bidCdr: bidCdrDocumentPath
        });

        // Parse items data
        let itemsData = [];
        try {
            itemsData = items ? JSON.parse(items) : [];
        } catch (error) {
            return res.status(400).json({ error: 'Invalid items data format' });
        }

        if (itemsData.length === 0) {
            return res.status(400).json({ error: 'At least one item must be included in the bid' });
        }

        // Derive totals from item lines to avoid zero-value abuse
        const derivedTotals = itemsData.reduce((acc, it) => {
            const qty = parseInt(it.can_provide || it.proposed_quantity || 0);
            const total = parseFloat(it.total_cost || 0);
            if (qty > 0 && total > 0) {
                acc.quantity += qty;
                acc.cost += total;
            }
            return acc;
        }, { quantity: 0, cost: 0 });

        if (derivedTotals.quantity === 0 || derivedTotals.cost === 0) {
            return res.status(400).json({ error: 'Bid must include at least one item with positive quantity and cost' });
        }

        // NEW VALIDATION: Ensure suppliers only provide full quantities for items they choose
        // Check that each item is either fully provided or completely dropped
        for (const item of itemsData) {
            const proposedQty = parseInt(item.can_provide || item.proposed_quantity || 0);
            const requiredQty = parseInt(item.required_quantity || 0);
            
            if (proposedQty > 0 && proposedQty !== requiredQty) {
                return res.status(400).json({ 
                    error: `For item "${item.item_name}", you must provide the full required quantity (${requiredQty}) or drop the item entirely. Partial quantities are not allowed.` 
                });
            }
        }

        // Begin transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Insert main bid record
            const bidResult = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO supplier_bids (
                        tender_id, supplier_id, total_cost, proposed_quantity,
                        delivery_days, bid_comments, technical_bid_document, financial_bid_document, bid_cdr_document
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        tenderId,
                        supplierId,
                        parseFloat(totalCost) > 0 ? parseFloat(totalCost) : derivedTotals.cost,
                        parseInt(proposedQuantity) > 0 ? parseInt(proposedQuantity) : derivedTotals.quantity,
                        parseInt(deliveryDays),
                        comments || '',
                        technicalBidPath,
                        financialBidPath,
                        bidCdrDocumentPath
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID });
                    }
                );
            });

            const bidId = bidResult.id;
            console.log('✅ Main bid record created with ID:', bidId);

            // Insert bid items
            for (const item of itemsData) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO supplier_bid_items (
                            bid_id, item_id, item_name, required_quantity,
                            proposed_quantity, unit_price, total_cost, unit, manufacturer_brand
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            bidId,
                            item.item_id,
                            item.item_name,
                            item.required_quantity,
                            item.can_provide,
                            item.price_per_unit || (item.total_cost / item.can_provide).toFixed(2), // Use provided price_per_unit or calculate
                            item.total_cost,
                            item.unit || 'pieces',
                            item.manufacturer_brand || ''
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            console.log('✅ All bid items inserted successfully');

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log('🎉 Bid submission completed successfully');

            // Return success response
            res.status(201).json({
                message: 'Bid submitted successfully',
                bidId: bidId,
                data: {
                    tender_id: tenderId,
                    supplier_id: supplierId,
                    total_cost: totalCost,
                    proposed_quantity: proposedQuantity,
                    delivery_days: deliveryDays,
                    items_count: itemsData.length
                }
            });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('❌ SubmitBid error:', error);
        res.status(500).json({ 
            error: 'Failed to submit bid: ' + error.message 
        });
    }
};

const getSupplierBids = async (req, res) => {
    const db = getDatabase();

    try {
        const supplierId = req.user.id; // Get supplier ID from authenticated user
        
        const bids = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sb.*, dt.bidding_start_time, dt.bidding_end_time, dt.tender_status,
                        d.item_name, d.quantity, d.estimated_cost, d.description
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
        console.error('Get supplier bids error:', error);
        res.status(500).json({ error: 'Failed to fetch supplier bids' });
    }
};

// Legacy functions for backward compatibility (can be removed later)
const legacyRegisterSupplier = registerSupplier;
const sendRegistrationOTP = sendEmailOTP;
const verifySMSOTP = (req, res) => res.status(400).json({ error: 'SMS OTP no longer supported' });
const completeRegistration = submitApplication;
const resendOTP = sendEmailOTP;

// Get comprehensive supplier data for evaluation
const getComprehensiveSupplierData = async (req, res) => {
    const { id } = req.params;
    console.log('Getting comprehensive data for supplier ID:', id);
    const db = getDatabase();

    try {
        // Get supplier basic information
        console.log('Querying supplier basic info...');
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        console.log('Supplier result:', supplier);

        if (!supplier) {
            console.log('Supplier not found');
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile
        console.log('Querying business profile...');
        const businessProfileRaw = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM supplier_business_profile WHERE supplier_id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        console.log('Business profile raw result:', businessProfileRaw);
        
        // Map business profile to expected format
        const businessProfile = businessProfileRaw ? {
            business_name: businessProfileRaw.business_name || '',
            legal_structure: businessProfileRaw.business_entity_type || '',
            business_category: businessProfileRaw.business_category || '',
            business_subcategory: businessProfileRaw.business_industry || '',
            business_description: businessProfileRaw.description || '',
            business_tax_id: businessProfileRaw.iban_number || '',
            business_registration_number: businessProfileRaw.iban_number || '',
            origin_classification: businessProfileRaw.origin_classification || '',
            country_of_origin: businessProfileRaw.origin_country || '',
            date_of_establishment: businessProfileRaw.date_of_incorporation || '',
            website_url: businessProfileRaw.website_url || '',
            contact_person_name: businessProfileRaw.contact_person_name || '',
            phone_number: businessProfileRaw.business_mobile_number || '',
            alternate_phone: businessProfileRaw.business_fax_number || ''
        } : null;

        // Get addresses
        console.log('Querying addresses...');
        const addressesRaw = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_addresses WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Addresses raw result:', addressesRaw);
        
        // Map addresses to expected format
        const addresses = Array.isArray(addressesRaw) ? addressesRaw
            .filter(addr => addr !== null && addr !== undefined)
            .map(addr => ({
                address_type: addr.address_type || '',
                street_address: (addr.address_line_1 || '') + (addr.address_line_2 ? ', ' + addr.address_line_2 : ''),
                city: addr.city || '',
                state: addr.state_province || '',
                postal_code: addr.postal_code || '',
                country: addr.country || ''
            })) : [];

        // Get documents
        console.log('Querying documents...');
        const documentsRaw = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_documents WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Documents result:', documentsRaw);
        
        // Map documents to expected format
        const documents = Array.isArray(documentsRaw) ? documentsRaw
            .filter(doc => doc !== null && doc !== undefined)
            .map(doc => ({
                document_type: doc.document_type || '',
                file_path: doc.file_path || '',
                original_name: doc.original_name || '',
                uploaded_at: doc.uploaded_at || ''
            })) : [];

        // Get registration bodies
        console.log('Querying registration bodies...');
        const registrationBodies = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_registration_bodies WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Registration bodies result:', registrationBodies);

        // Get PPRA registrations
        console.log('Querying PPRA registrations...');
        const ppraRegistrations = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('PPRA registrations result:', ppraRegistrations);

        // Get past experience
        console.log('Querying past experience...');
        const pastExperience = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_past_experience WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Past experience result:', pastExperience);

        // Get client references
        console.log('Querying client references...');
        const clientReferences = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_client_references WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Client references result:', clientReferences);

        // Get work proof images
        console.log('Querying work proof images...');
        const workProofImages = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_work_proof_images WHERE supplier_id = ?', [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Work proof images result:', workProofImages);

        // Get existing evaluations
        console.log('Querying evaluations...');
        const evaluations = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    se.*,
                    u.username as evaluator_name
                FROM supplier_evaluations se
                LEFT JOIN users u ON se.evaluator_id = u.id
                WHERE se.supplier_id = ?
                ORDER BY se.created_at DESC
            `, [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Evaluations result:', evaluations);

        // Get committee count for progress tracking
        console.log('Querying committee count...');
        const committeeCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['committee'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        console.log('Committee count result:', committeeCount);

        const comprehensiveData = {
            supplier: supplier || null,
            businessProfile: businessProfile || null,
            addresses: Array.isArray(addresses) ? addresses : [],
            documents: Array.isArray(documents) ? documents : [],
            registrationBodies: Array.isArray(registrationBodies) ? registrationBodies
                .filter(body => body !== null && body !== undefined)
                .map(body => ({
                    id: body.id,
                    registrationBody: body.registration_body,
                    registrationNumber: body.registration_number,
                    registrationDate: body.registration_date,
                    createdAt: body.created_at
                })) : [],
            ppraRegistrations: Array.isArray(ppraRegistrations) ? ppraRegistrations
                .filter(ppra => ppra !== null && ppra !== undefined)
                .map(ppra => ({
                    id: ppra.id,
                    ppraType: ppra.ppra_type,
                    registrationNumber: ppra.registration_number,
                    registrationDate: ppra.registration_date,
                    expiryDate: ppra.expiry_date,
                    createdAt: ppra.created_at
                })) : [],
            pastExperience: Array.isArray(pastExperience) ? pastExperience.filter(exp => exp !== null && exp !== undefined) : [],
            clientReferences: Array.isArray(clientReferences) ? clientReferences.filter(ref => ref !== null && ref !== undefined) : [],
            workProofImages: Array.isArray(workProofImages) ? workProofImages.filter(img => img !== null && img !== undefined) : [],
            evaluations: Array.isArray(evaluations) ? evaluations.filter(eval => eval !== null && eval !== undefined) : [],
            committeeCount: committeeCount?.count || 0
        };

        console.log('Final comprehensive data:', comprehensiveData);
        res.json(comprehensiveData);

    } catch (error) {
        console.error('Error fetching comprehensive supplier data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get supplier registration data for autofilling forms
const getSupplierRegistrationData = async (req, res) => {
    console.log('🔍 getSupplierRegistrationData called');
    console.log('👤 req.user:', req.user);
    console.log('📋 req.params:', req.params);
    
    const supplierId = req.user?.supplierId || req.params.supplierId;
    
    console.log('🔢 Resolved supplierId:', supplierId);
    
    if (!supplierId) {
        console.log('❌ No supplier ID found');
        return res.status(400).json({ error: 'Supplier ID is required' });
    }

    const db = getDatabase();

    try {
        console.log('Fetching registration data for supplier ID:', supplierId);

        // Get supplier basic info
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile
        const businessProfile = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM supplier_business_profile WHERE supplier_id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Get registration bodies
        const registrationBodies = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_registration_bodies WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get addresses
        const addresses = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_addresses WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get PPRA registrations
        const ppraRegistrations = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get past experience
        const pastExperience = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_past_experience WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get client references
        const clientReferences = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_client_references WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get work proof images
        const workProofImages = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_work_proof_images WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get resubmission feedback
        const resubmissionFeedback = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM supplier_resubmission_feedback WHERE supplier_id = ? AND is_active = 1 ORDER BY requested_at DESC', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Get documents
        const documents = await new Promise((resolve, reject) => {
            db.all('SELECT document_type, file_path, original_name FROM supplier_documents WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Format the data for the frontend form
        const formattedData = {
            businessProfile: businessProfile ? {
                businessEntityType: businessProfile.business_entity_type || '',
                businessCategory: businessProfile.business_category || '',
                businessIndustry: businessProfile.business_industry || '',
                description: businessProfile.description || '',
                ibanNumber: businessProfile.iban_number || '',
                businessName: businessProfile.business_name || '',
                contactPersonName: businessProfile.contact_person_name || '',
                originClassification: businessProfile.origin_classification || '',
                originCountry: businessProfile.origin_country || '',
                dateOfIncorporation: businessProfile.date_of_incorporation || '',
                websiteUrl: businessProfile.website_url || '',
                businessMobileNumber: businessProfile.business_mobile_number || '',
                businessFaxNumber: businessProfile.business_fax_number || ''
            } : null,
            registrationBodies: (registrationBodies || []).map(body => ({
                id: body.id,
                registrationBody: body.registration_body,
                registrationNumber: body.registration_number,
                registrationDate: body.registration_date
            })),
            addresses: (addresses || []).map(addr => ({
                id: addr.id,
                addressType: addr.address_type,
                addressLine1: addr.address_line_1,
                addressLine2: addr.address_line_2,
                city: addr.city,
                stateProvince: addr.state_province,
                postalCode: addr.postal_code,
                country: addr.country
            })),
            ppraRegistrations: (ppraRegistrations || []).map(ppra => ({
                id: ppra.id,
                ppraType: ppra.ppra_type,
                registrationNumber: ppra.registration_number,
                registrationDate: ppra.registration_date,
                expiryDate: ppra.expiry_date
            })),
            pastExperience: (pastExperience || []).map(exp => ({
                id: exp.id,
                projectTitle: exp.project_title,
                clientName: exp.client_name,
                workType: exp.work_type,
                projectValue: exp.project_value,
                duration: exp.duration,
                startDate: exp.start_date,
                endDate: exp.end_date,
                status: exp.status,
                description: exp.description
            })),
            clientReferences: (clientReferences || []).map(ref => ({
                id: ref.id,
                contactName: ref.contact_name,
                organization: ref.organization,
                position: ref.position,
                phone: ref.phone,
                email: ref.email,
                relationship: ref.relationship
            })),
            workProofImages: (workProofImages || []).map(img => ({
                id: img.id,
                imageUrl: img.image_url,
                description: img.description,
                projectReference: img.project_reference
            })),
            documents: (documents || []).reduce((acc, doc) => {
                acc[doc.document_type] = {
                    fileName: doc.original_name,
                    filePath: doc.file_path
                };
                return acc;
            }, {}),
            resubmissionFeedback: resubmissionFeedback ? {
                ...JSON.parse(resubmissionFeedback.failed_criteria),
                evaluatorName: resubmissionFeedback.evaluator_name,
                requestedAt: resubmissionFeedback.requested_at,
                overallComment: resubmissionFeedback.overall_comment
            } : null,
            supplier: {
                id: supplier.id,
                username: supplier.username,
                businessEmail: supplier.business_email,
                emailVerified: supplier.email_verified === 1,
                registrationStep: supplier.registration_step,
                status: supplier.status
            }
        };

        console.log('Registration data fetched successfully');
        res.json(formattedData);

    } catch (error) {
        console.error('Error fetching supplier registration data:', error);
        res.status(500).json({ error: 'Failed to fetch registration data' });
    }
};

// Request resubmission from supplier
const requestResubmission = async (req, res) => {
    const { supplierId } = req.params;
    const { issues, additionalMessage, failedCriteria } = req.body;
    const evaluatorId = req.user.id;
    const evaluatorName = req.user.username || req.user.name || 'Supplier Evaluation Committee';
    const db = getDatabase();

    try {
        console.log('Resubmission request data:', { supplierId, issues, additionalMessage, failedCriteria });

        // Get supplier information
        const supplier = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM suppliers WHERE id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile for email
        const businessProfile = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM supplier_business_profile WHERE supplier_id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Update supplier status to pending_resubmission
        await new Promise((resolve, reject) => {
            db.run('UPDATE suppliers SET status = ? WHERE id = ?', ['pending_resubmission', supplierId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Store detailed resubmission feedback
        const feedbackData = {
            failedCriteria: failedCriteria || [],
            issues: issues || [],
            additionalMessage: additionalMessage || '',
            evaluatorName: evaluatorName,
            requestedAt: new Date().toISOString()
        };

        // Clear any existing active feedback for this supplier
        await new Promise((resolve, reject) => {
            db.run('UPDATE supplier_resubmission_feedback SET is_active = 0 WHERE supplier_id = ?', [supplierId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Insert new feedback
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO supplier_resubmission_feedback 
                 (supplier_id, evaluator_id, evaluator_name, failed_criteria, overall_comment, is_active) 
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [
                    supplierId,
                    evaluatorId,
                    evaluatorName,
                    JSON.stringify(feedbackData),
                    additionalMessage || null
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Log the resubmission request in evaluations table
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO supplier_evaluations (
                    supplier_id, 
                    evaluator_id, 
                    status, 
                    comments,
                    created_at
                ) VALUES (?, ?, 'resubmission_requested', ?, CURRENT_TIMESTAMP)`,
                [
                    supplierId, 
                    evaluatorId, 
                    `Resubmission requested: ${additionalMessage || 'Please review and resubmit application'}`
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Send email notification to supplier
        try {
            const EmailService = require('../utils/emailService');
            const emailService = new EmailService();
            
            // Use the business_email field (the only email field that exists)
            const supplierEmail = supplier.business_email;
            
            if (!supplierEmail) {
                console.warn('No email address found for supplier:', supplierId);
                return res.json({ 
                    message: 'Resubmission request logged successfully, but no email sent (no email address on file)',
                    status: 'pending_resubmission'
                });
            }
            
            console.log('Sending resubmission email to:', supplierEmail);
            await emailService.sendSupplierResubmissionEmail(
                supplierEmail,
                businessProfile?.business_name || supplier.username || 'Supplier',
                issues || [],
                additionalMessage || ''
            );
            console.log('Resubmission email sent successfully');
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

// Grievance-related functions
const submitGrievance = async (req, res) => {
    const { tenderId, itemId, grievanceText, grievanceType } = req.body;
    const supplierId = req.user.id;

    if (!tenderId || !grievanceText || !grievanceType) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const db = getDatabase();

    try {
        const grievanceId = Date.now().toString(); // Simple ID generation
        
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO grievances (
                    id, supplierId, tenderId, itemId, grievanceText, grievanceType, 
                    status, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                grievanceId, supplierId, tenderId, itemId, grievanceText, 
                grievanceType, 'pending', new Date().toISOString()
            ], function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });

        res.status(201).json({
            message: 'Grievance submitted successfully',
            grievanceId: grievanceId
        });

    } catch (error) {
        console.error('Error submitting grievance:', error);
        res.status(500).json({ error: 'Failed to submit grievance' });
    }
};

const getSupplierGrievances = async (req, res) => {
    const supplierId = req.user.id;
    const db = getDatabase();

    try {
        const grievances = await new Promise((resolve, reject) => {
            db.all(`
                SELECT g.*, t.title as tenderTitle, s.company_name as supplierName
                FROM grievances g
                LEFT JOIN tenders t ON g.tenderId = t.id
                LEFT JOIN suppliers s ON g.supplierId = s.id
                WHERE g.supplierId = ?
                ORDER BY g.createdAt DESC
            `, [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        res.json(grievances);

    } catch (error) {
        console.error('Error fetching grievances:', error);
        res.status(500).json({ error: 'Failed to fetch grievances' });
    }
};

const getRejectedItems = async (req, res) => {
    const supplierId = req.user.id;
    const db = getDatabase();

    try {
        // This would typically fetch rejected bid items for the supplier
        const rejectedItems = await new Promise((resolve, reject) => {
            db.all(`
                SELECT bi.*, t.title as tenderTitle, i.itemName, i.specifications
                FROM bid_items bi
                LEFT JOIN tenders t ON bi.tenderId = t.id
                LEFT JOIN items i ON bi.itemId = i.id
                WHERE bi.supplierId = ? AND bi.status = 'rejected'
                ORDER BY bi.updatedAt DESC
            `, [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        res.json(rejectedItems);

    } catch (error) {
        console.error('Error fetching rejected items:', error);
        res.status(500).json({ error: 'Failed to fetch rejected items' });
    }
};

const getDeadlineStatus = async (req, res) => {
    const supplierId = req.user.id;
    const db = getDatabase();

    try {
        const deadlineStatus = await new Promise((resolve, reject) => {
            db.all(`
                SELECT t.id, t.title, t.submission_deadline as submissionDeadline, t.status,
                       COUNT(b.id) as bidSubmitted
                FROM tenders t
                LEFT JOIN bids b ON t.id = b.tender_id AND b.supplier_id = ?
                WHERE t.status = 'published' OR (t.status = 'closed' AND b.id IS NOT NULL)
                GROUP BY t.id, t.title, t.submission_deadline, t.status
                ORDER BY t.submission_deadline ASC
            `, [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        const currentDate = new Date();
        const statusWithFlags = deadlineStatus.map(tender => ({
            ...tender,
            isExpired: new Date(tender.submissionDeadline) < currentDate,
            hasBid: tender.bidSubmitted > 0
        }));

        res.json(statusWithFlags);

    } catch (error) {
        console.error('Error fetching deadline status:', error);
        res.status(500).json({ error: 'Failed to fetch deadline status' });
    }
};

// Get supplier profile for bid form auto-population
const getSupplierProfile = async (req, res) => {
    const supplierId = req.user.id;
    const db = getDatabase();

    try {
        // Get supplier business profile
        const businessProfile = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM supplier_business_profile WHERE supplier_id = ?', [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Get PPRA registrations to find registration number
        const ppraRegistrations = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?', [supplierId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get the first PPRA registration number
        const ppraNumber = ppraRegistrations && ppraRegistrations.length > 0 
            ? ppraRegistrations[0].registration_number 
            : '';

        const profileData = {
            companyName: businessProfile ? businessProfile.business_name : '',
            registeredNumber: ppraNumber
        };

        res.json(profileData);

    } catch (error) {
        console.error('Error fetching supplier profile:', error);
        res.status(500).json({ error: 'Failed to fetch supplier profile' });
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
    getSupplierProfile,
    // Grievance functions
    submitGrievance,
    getSupplierGrievances,
    getRejectedItems,
    getDeadlineStatus,
    // Legacy exports for backward compatibility
    legacyRegisterSupplier,
    sendRegistrationOTP,
    verifySMSOTP,
    completeRegistration,
    resendOTP,
    getComprehensiveSupplierData,
    getSupplierRegistrationData,
    requestResubmission
};

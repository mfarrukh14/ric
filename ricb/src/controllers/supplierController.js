const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const path = require('path');
const fs = require('fs');
const { dbAll, dbGet, dbRun } = require('../db');
const { sendOTPEmail } = require('../utils/otpService');

// Generate random OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Initial supplier registration (creates account but doesn't complete profile)
const registerSupplier = async (req, res) => {
    
    const { username, businessEmail, password } = req.body;
    
    if (!username || !businessEmail || !password) {
        return res.status(400).json({ error: 'Username, business email, and password are required' });
    }


    try {
        
        // Check if username or email already exists
        const existingSupplier = await dbGet(
            'SELECT id FROM suppliers WHERE username = ? OR business_email = ?',
            [username, businessEmail]
        );

        if (existingSupplier) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create supplier account
        const supplierId = await dbRun(
            `INSERT INTO suppliers (username, business_email, password, email_verified, registration_step, status) 
             VALUES (?, ?, ?, 0, 0, 'draft')`,
            [username, businessEmail, hashedPassword]
        ).then(result => result.lastID);

        // Generate JWT token
        const token = jwt.sign(
            { supplierId, username, businessEmail },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

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
        res.status(500).json({ error: 'Registration failed' });
    }
};

// Supplier login
const supplierSession = (supplier) => ({
    id: supplier.id,
    username: supplier.username,
    businessEmail: supplier.business_email,
    emailVerified: supplier.email_verified === 1,
    registrationStep: supplier.registration_step,
    status: supplier.status
});

const loginSupplier = async (req, res) => {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
        return res.status(400).json({ error: 'Username/email and password are required' });
    }

    try {
        // Find supplier by username or email
        const supplier = await dbGet(
            'SELECT * FROM suppliers WHERE username = ? OR business_email = ?',
            [usernameOrEmail, usernameOrEmail]
        );

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
            JWT_SECRET,
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

        // Approved suppliers with 2FA prove the second factor before getting a session.
        if (supplier.two_factor_enabled) {
            const challenge = jwt.sign({ purpose: 'supplier-2fa', supplierId: supplier.id }, JWT_SECRET, { expiresIn: '5m' });
            return res.json({ requires2FA: true, challenge, message: 'Please provide your 2FA code to complete login' });
        }

        res.json({ message: 'Login successful', token, supplier: supplierSession(supplier) });

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

    try {
        // Get supplier email + company name (business_name may not be saved yet
        // this early in registration, so fall back to the username)
        const supplier = await dbGet(`SELECT s.business_email, s.username, bp.business_name
         FROM suppliers s
         LEFT JOIN supplier_business_profile bp ON bp.supplier_id = s.id
         WHERE s.id = ?`, [supplierId]);

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        const companyName = supplier.business_name || supplier.username;

        // Generate OTP
        const otp = generateOTP();

        // Invalidate any previous unverified email OTP for this supplier so a
        // resend always supersedes the old code rather than leaving it valid
        // alongside the new one.
        await dbRun(`DELETE FROM supplier_otp_verifications
         WHERE supplier_id = ? AND otp_type = 'email_verification' AND verified = 0`, [supplierId]);

        // Store OTP in database - expiry computed by the DB's own clock
        // (datetime('now', ...) -> GETDATE()-based) so it's never compared
        // against a different clock/timezone than the verification check below.
        await dbRun(`INSERT INTO supplier_otp_verifications
         (supplier_id, email, otp_code, otp_type, expires_at, verified)
         VALUES (?, ?, ?, 'email_verification', datetime('now', '+2 minutes'), 0)`, [supplierId, supplier.business_email, otp]);

        // Send OTP email
        await sendOTPEmail(supplier.business_email, otp, companyName);

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

    try {
        // Find valid OTP
        const otpRecord = await dbGet(`SELECT * FROM supplier_otp_verifications 
         WHERE supplier_id = ? AND otp_code = ? AND otp_type = 'email_verification' 
         AND verified = 0 AND expires_at > datetime('now')`, [supplierId, otp]);

        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // Mark OTP as verified
        await dbRun(
            'UPDATE supplier_otp_verifications SET verified = 1 WHERE id = ?',
            [otpRecord.id]
        );

        // Mark supplier email as verified
        await dbRun('UPDATE suppliers SET email_verified = 1 WHERE id = ?', [supplierId]);

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

    try {
        switch (step) {
            case 1:
                // Save business profile
                await dbRun(`INSERT OR REPLACE INTO supplier_business_profile 
                 (supplier_id, business_entity_type, business_category, business_industry, 
                  description, iban_number, business_name, contact_person_name, origin_classification, origin_country, 
                  date_of_incorporation, website_url, business_mobile_number, business_fax_number, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, [
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
                ]);
                break;

            case 3:
                // Save registration bodies
                if (data.registrationBodies && data.registrationBodies.length > 0) {
                    // Clear existing registration bodies
                    await dbRun(
                        'DELETE FROM supplier_registration_bodies WHERE supplier_id = ?',
                        [supplierId]
                    );

                    // Insert new registration bodies
                    for (const body of data.registrationBodies) {
                        await dbRun(`INSERT INTO supplier_registration_bodies 
                         (supplier_id, registration_body, registration_number, registration_date) 
                         VALUES (?, ?, ?, ?)`, [supplierId, body.registrationBody, body.registrationNumber, body.registrationDate]);
                    }
                }
                break;

            case 5:
                // Save addresses
                if (data.addresses && data.addresses.length > 0) {
                    // Clear existing addresses
                    await dbRun('DELETE FROM supplier_addresses WHERE supplier_id = ?', [supplierId]);

                    // Insert new addresses
                    for (const address of data.addresses) {
                        await dbRun(`INSERT INTO supplier_addresses 
                         (supplier_id, address_type, address_line_1, address_line_2, city, state_province, postal_code, country) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                            supplierId,
                            address.addressType,
                            address.addressLine1,
                            address.addressLine2 || null,
                            address.city,
                            address.stateProvince,
                            address.postalCode,
                            address.country
                        ]);
                    }
                }
                break;

            case 6:
                // Save Past Experience (Step 6)
                if (data.pastExperience && data.pastExperience.length > 0) {
                    // Clear existing past experience
                    await dbRun('DELETE FROM supplier_past_experience WHERE supplier_id = ?', [supplierId]);

                    // Insert new past experience
                    for (const experience of data.pastExperience) {
                        await dbRun(`INSERT INTO supplier_past_experience 
                         (supplier_id, project_title, client_name, work_type, project_value, duration, start_date, end_date, status, description) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
                        ]);
                    }
                }

                // Save Client References
                if (data.clientReferences && data.clientReferences.length > 0) {
                    // Clear existing client references
                    await dbRun(
                        'DELETE FROM supplier_client_references WHERE supplier_id = ?',
                        [supplierId]
                    );

                    // Insert new client references
                    for (const reference of data.clientReferences) {
                        await dbRun(`INSERT INTO supplier_client_references 
                         (supplier_id, contact_name, organization, position, phone, email, relationship) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                            supplierId,
                            reference.contactName,
                            reference.organization,
                            reference.position || null,
                            reference.phone || null,
                            reference.email || null,
                            reference.relationship || null
                        ]);
                    }
                }

                // Save Work Proof Images (for now just store URLs/paths)
                if (data.workProofImages && data.workProofImages.length > 0) {
                    // Clear existing work proof images
                    await dbRun(
                        'DELETE FROM supplier_work_proof_images WHERE supplier_id = ?',
                        [supplierId]
                    );

                    // Insert new work proof images
                    for (const image of data.workProofImages) {
                        await dbRun(`INSERT INTO supplier_work_proof_images 
                         (supplier_id, image_url, description, project_reference) 
                         VALUES (?, ?, ?, ?)`, [
                            supplierId,
                            image.preview || image.file?.name || 'uploaded_image',
                            image.description || null,
                            image.project_reference || null
                        ]);
                    }
                }
                break;

            case 7:
                // Save PPRA registrations (Step 7)
                if (data.ppraRegistrations && data.ppraRegistrations.length > 0) {
                    // Clear existing PPRA registrations
                    await dbRun(
                        'DELETE FROM supplier_ppra_registrations WHERE supplier_id = ?',
                        [supplierId]
                    );

                    // Insert new PPRA registrations
                    for (const ppra of data.ppraRegistrations) {
                        await dbRun(`INSERT INTO supplier_ppra_registrations 
                         (supplier_id, ppra_type, registration_number, registration_date, expiry_date) 
                         VALUES (?, ?, ?, ?, ?)`, [
                            supplierId,
                            ppra.ppraType,
                            ppra.registrationNumber,
                            ppra.registrationDate,
                            ppra.expiryDate || null
                        ]);
                    }
                }
                break;
        }

        // Update registration step
        await dbRun(
            'UPDATE suppliers SET registration_step = ? WHERE id = ?',
            [Math.max(step, 0), supplierId]
        );

        res.json({ message: 'Step saved successfully' });

    } catch (error) {
        console.error('Save step error:', error);
        res.status(500).json({ error: 'Failed to save step' });
    }
};

// Submit final application
const submitApplication = async (req, res) => {
    const { supplierId } = req.body;
    try {
        const current = await dbGet('SELECT status, email_verified FROM suppliers WHERE id = ?', [supplierId]);
        if (!Number(current?.email_verified)) {
            return res.status(400).json({ error: 'Verify your email address before submitting.' });
        }

        for (const docType of ['professionalTaxCert', 'ntnDocument', 'drugSaleLicense', 'pecDocument', 'gstDocument']) {
            const file = req.files?.[docType]?.[0];
            if (file) {
                await dbRun(
                    'INSERT INTO supplier_documents (supplier_id, document_type, file_path, original_name) VALUES (?, ?, ?, ?)',
                    [supplierId, docType, file.path, file.originalname],
                );
            }
        }

        await dbRun("UPDATE suppliers SET status = 'pending', registration_step = 6 WHERE id = ?", [supplierId]);
        res.json({
            message: current.status === 'pending_resubmission'
                ? 'Application resubmitted for review'
                : 'Application submitted for approval',
        });
    } catch (error) {
        console.error('Submit application error:', error);
        res.status(500).json({ error: 'Failed to submit application' });
    }
};

// Get pending suppliers for admin review
const getPendingSuppliers = async (req, res) => {
    try {
        const suppliers = await dbAll(`SELECT 
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
         ORDER BY s.created_at DESC`);

        res.json({ suppliers });

    } catch (error) {
        console.error('Get pending suppliers error:', error);
        res.status(500).json({ error: 'Failed to fetch pending suppliers' });
    }
};

// Get supplier details for admin review
const getSupplierDetails = async (req, res) => {
    const { id } = req.params;

    try {
        // Get supplier basic info
        const supplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [id]);

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile
        const businessProfile = await dbGet('SELECT * FROM supplier_business_profile WHERE supplier_id = ?', [id]);

        // Get registration bodies
        const registrationBodies = await dbAll('SELECT * FROM supplier_registration_bodies WHERE supplier_id = ?', [id]);

        // Get documents
        const documents = await dbAll('SELECT * FROM supplier_documents WHERE supplier_id = ?', [id]);

        // Get addresses
        const addresses = await dbAll('SELECT * FROM supplier_addresses WHERE supplier_id = ?', [id]);

        // Get PPRA registrations
        const ppraRegistrations = await dbAll('SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?', [id]);

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

    try {
        const status = action === 'approve' ? 'approved' : 'rejected';
        const timestamp = new Date().toISOString();

        // First, get supplier details for email
        const supplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [supplierId]);

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Update supplier status
        await dbRun(`UPDATE suppliers SET status = ?, rejection_reason = ?, 
         ${action === 'approve' ? 'approved_at' : 'rejected_at'} = ? 
         WHERE id = ?`, [status, rejectionReason || null, timestamp, supplierId]);

        // Send email notification
        try {
            const EmailService = require('../utils/emailService');
            const emailService = new EmailService();
            
            if (action === 'approve') {
                await emailService.sendSupplierApprovalEmail(supplier.business_email, supplier.username);
            } else {
                await emailService.sendSupplierRejectionEmail(supplier.business_email, supplier.username, rejectionReason);
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

    try {
        const document = await dbGet(
            'SELECT * FROM supplier_documents WHERE supplier_id = ? AND document_type = ?',
            [supplierId, documentType]
        );

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

    try {
        // Open tenders: active with the deadline still ahead (stored and compared in UTC).
        const tenders = await dbAll(
            `SELECT dt.*, d.item_name, d.quantity, d.estimated_cost, d.description, d.urgency, d.required_by
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             WHERE dt.tender_status = 'active'
             AND dt.bidding_end_time > ?
             ORDER BY dt.bidding_end_time ASC`,
            [new Date()]
        );

        // For each tender, get the associated demand items
        const tendersWithItems = await Promise.all(
            tenders.map(async (tender) => {
                const items = await dbAll(
                    `SELECT id, item_name, quantity, estimated_cost, remarks, specifications, unit 
                     FROM demand_items 
                     WHERE demand_id = ? AND is_removed = 0`,
                    [tender.demand_id]
                );

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

        res.json(tendersWithItems);

    } catch (error) {
        console.error('Get active tenders error:', error);
        res.status(500).json({ error: 'Failed to fetch active tenders' });
    }
};

const submitBid = async (req, res) => {
    const { tenderId } = req.params;
    const supplierId = req.user.id;

    try {

        // Validate required fields
        const { 
            proposedQuantity, 
            totalCost, 
            deliveryDays, 
            comments, 
            items,
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
        const tender = await dbGet(`SELECT dt.*, d.item_name, d.description, d.quantity as demand_quantity
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         WHERE dt.id = ?`, [tenderId]);

        if (!tender) {
            return res.status(404).json({ error: 'Tender not found' });
        }

        // Check if tender is still accepting bids
        if (new Date() > new Date(tender.bidding_end_time)) {
            return res.status(400).json({ error: 'Bidding period has ended for this tender' });
        }

        if (tender.tender_status !== 'active') {
            return res.status(400).json({ error: 'This tender is not accepting bids' });
        }

        // Check if supplier has already submitted a bid for this tender
        const existingBid = await dbGet(
            'SELECT id FROM supplier_bids WHERE tender_id = ? AND supplier_id = ?',
            [tenderId, supplierId]
        );

        if (existingBid) {
            return res.status(400).json({ 
                error: 'You have already submitted a bid for this tender' 
            });
        }

        // Ensure supplier acknowledged knockout clauses and all were checked
        const knockoutAck = await dbGet(`SELECT all_clauses_checked FROM supplier_knockout_acknowledgments 
         WHERE tender_id = ? AND supplier_id = ?`, [tenderId, supplierId]);
        if (!knockoutAck || knockoutAck.all_clauses_checked !== 1) {
            return res.status(400).json({ 
                error: 'Please review and acknowledge all knockout clauses before submitting a bid.'
            });
        }

        // Get file paths
        const technicalBidPath = req.files.technicalBid[0].filename;
        const financialBidPath = req.files.financialBid[0].filename;
        const bidCdrDocumentPath = req.files.bidCdrDocument[0].filename;

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

        {
            // Insert main bid record
            const bidResult = await dbRun(`INSERT INTO supplier_bids (
                tender_id, supplier_id, total_cost, proposed_quantity,
                delivery_days, bid_comments, technical_bid_document, financial_bid_document, bid_cdr_document
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                tenderId,
                supplierId,
                parseFloat(totalCost) > 0 ? parseFloat(totalCost) : derivedTotals.cost,
                parseInt(proposedQuantity) > 0 ? parseInt(proposedQuantity) : derivedTotals.quantity,
                parseInt(deliveryDays),
                comments || '',
                technicalBidPath,
                financialBidPath,
                bidCdrDocumentPath
            ]).then(result => ({
                id: result.lastID
            }));

            const bidId = bidResult.id;

            // Insert bid items
            for (const item of itemsData) {
                await dbRun(`INSERT INTO supplier_bid_items (
                    bid_id, item_id, item_name, required_quantity,
                    proposed_quantity, unit_price, total_cost, unit, manufacturer_brand
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    bidId,
                    item.item_id,
                    item.item_name,
                    item.required_quantity,
                    item.can_provide,
                    item.price_per_unit || (item.total_cost / item.can_provide).toFixed(2), // Use provided price_per_unit or calculate
                    item.total_cost,
                    item.unit || 'pieces',
                    item.manufacturer_brand || ''
                ]);
            }

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
        }

    } catch (error) {
        console.error('❌ SubmitBid error:', error);
        res.status(500).json({ 
            error: 'Failed to submit bid: ' + error.message 
        });
    }
};

const getSupplierBids = async (req, res) => {
    try {
        const supplierId = req.user.id; // Get supplier ID from authenticated user
        
        const bids = await dbAll(
            `SELECT sb.*, dt.tender_number, dt.bidding_start_time, dt.bidding_end_time, dt.tender_status,
                    d.item_name, d.quantity, d.estimated_cost, d.description,
                    sa.award_status, sa.award_amount,
                    (SELECT COUNT(*) FROM technical_evaluations te WHERE te.bid_id = sb.id AND te.status = 'approved') AS items_qualified,
                    (SELECT COUNT(*) FROM technical_evaluations te WHERE te.bid_id = sb.id AND te.status = 'rejected') AS items_rejected
             FROM supplier_bids sb
             JOIN demand_tenders dt ON sb.tender_id = dt.id
             JOIN demands d ON dt.demand_id = d.id
             LEFT JOIN supplier_awards sa ON sa.tender_id = sb.tender_id AND sa.supplier_id = sb.supplier_id
             WHERE sb.supplier_id = ?
             ORDER BY sb.created_at DESC`,
            [supplierId]
        );

        // Where this bid stands. Awards live in supplier_awards: demand_tenders.awarded_supplier_id
        // is not set by the award flow, so the old screen showed every bid as lost.
        const now = new Date();
        const outcome = (bid) => {
            if (bid.award_status && bid.award_status !== 'cancelled') return 'won';
            if (bid.tender_status === 'awarded') return 'not_selected';
            if (['active', 'published'].includes(bid.tender_status) && new Date(bid.bidding_end_time) > now) return 'submitted';
            if (bid.tender_status === 'technically_evaluated' && bid.items_rejected > 0 && bid.items_qualified === 0) return 'not_qualified';
            return 'under_evaluation';
        };
        res.json(bids.map((bid) => ({ ...bid, outcome: outcome(bid) })));

    } catch (error) {
        console.error('Get supplier bids error:', error);
        res.status(500).json({ error: 'Failed to fetch supplier bids' });
    }
};

// Get comprehensive supplier data for evaluation
const getComprehensiveSupplierData = async (req, res) => {
    const { id } = req.params;

    try {
        // Get supplier basic information
        const supplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [id]);

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile
        const businessProfileRaw = await dbGet('SELECT * FROM supplier_business_profile WHERE supplier_id = ?', [id]);
        
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
        const addressesRaw = await dbAll('SELECT * FROM supplier_addresses WHERE supplier_id = ?', [id]);
        
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
        const documentsRaw = await dbAll('SELECT * FROM supplier_documents WHERE supplier_id = ?', [id]);
        
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
        const registrationBodies = await dbAll('SELECT * FROM supplier_registration_bodies WHERE supplier_id = ?', [id]);

        // Get PPRA registrations
        const ppraRegistrations = await dbAll('SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?', [id]);

        // Get past experience
        const pastExperience = await dbAll('SELECT * FROM supplier_past_experience WHERE supplier_id = ?', [id]);

        // Get client references
        const clientReferences = await dbAll('SELECT * FROM supplier_client_references WHERE supplier_id = ?', [id]);

        // Get work proof images
        const workProofImages = await dbAll('SELECT * FROM supplier_work_proof_images WHERE supplier_id = ?', [id]);

        // Get existing evaluations
        const evaluations = await dbAll(`
            SELECT 
                se.*,
                u.username as evaluator_name
            FROM supplier_evaluations se
            LEFT JOIN users u ON se.evaluator_id = u.id
            WHERE se.supplier_id = ?
            ORDER BY se.created_at DESC
        `, [id]);

        // Get committee count for progress tracking
        const committeeCount = await dbGet('SELECT COUNT(*) as count FROM users WHERE role = ?', ['committee']);

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
            evaluations: Array.isArray(evaluations) ? evaluations.filter((entry) => entry != null) : [],
            committeeCount: committeeCount?.count || 0
        };

        res.json(comprehensiveData);

    } catch (error) {
        console.error('Error fetching comprehensive supplier data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get supplier registration data for autofilling forms
const getSupplierRegistrationData = async (req, res) => {

    const supplierId = req.user?.supplierId || req.params.supplierId;

    if (!supplierId) {
        return res.status(400).json({ error: 'Supplier ID is required' });
    }

    try {

        // Get supplier basic info
        const supplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [supplierId]);

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile
        const businessProfile = await dbGet(
            'SELECT * FROM supplier_business_profile WHERE supplier_id = ?',
            [supplierId]
        );

        // Get registration bodies
        const registrationBodies = await dbAll(
            'SELECT * FROM supplier_registration_bodies WHERE supplier_id = ?',
            [supplierId]
        );

        // Get addresses
        const addresses = await dbAll('SELECT * FROM supplier_addresses WHERE supplier_id = ?', [supplierId]);

        // Get PPRA registrations
        const ppraRegistrations = await dbAll(
            'SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?',
            [supplierId]
        );

        // Get past experience
        const pastExperience = await dbAll(
            'SELECT * FROM supplier_past_experience WHERE supplier_id = ?',
            [supplierId]
        );

        // Get client references
        const clientReferences = await dbAll(
            'SELECT * FROM supplier_client_references WHERE supplier_id = ?',
            [supplierId]
        );

        // Get work proof images
        const workProofImages = await dbAll(
            'SELECT * FROM supplier_work_proof_images WHERE supplier_id = ?',
            [supplierId]
        );

        // Get resubmission feedback
        const resubmissionFeedback = await dbGet(
            'SELECT * FROM supplier_resubmission_feedback WHERE supplier_id = ? AND is_active = 1 ORDER BY requested_at DESC',
            [supplierId]
        );

        // Get documents
        const documents = await dbAll(
            'SELECT document_type, file_path, original_name FROM supplier_documents WHERE supplier_id = ?',
            [supplierId]
        );

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

    try {

        // Get supplier information
        const supplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [supplierId]);

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Get business profile for email
        const businessProfile = await dbGet(
            'SELECT * FROM supplier_business_profile WHERE supplier_id = ?',
            [supplierId]
        );

        // Update supplier status to pending_resubmission
        await dbRun(
            'UPDATE suppliers SET status = ? WHERE id = ?',
            ['pending_resubmission', supplierId]
        );

        // Store detailed resubmission feedback
        const feedbackData = {
            failedCriteria: failedCriteria || [],
            issues: issues || [],
            additionalMessage: additionalMessage || '',
            evaluatorName: evaluatorName,
            requestedAt: new Date().toISOString()
        };

        // Clear any existing active feedback for this supplier
        await dbRun(
            'UPDATE supplier_resubmission_feedback SET is_active = 0 WHERE supplier_id = ?',
            [supplierId]
        );

        // Insert new feedback
        await dbRun(`INSERT INTO supplier_resubmission_feedback 
         (supplier_id, evaluator_id, evaluator_name, failed_criteria, overall_comment, is_active) 
         VALUES (?, ?, ?, ?, ?, 1)`, [
            supplierId,
            evaluatorId,
            evaluatorName,
            JSON.stringify(feedbackData),
            additionalMessage || null
        ]);

        // Log the resubmission request in evaluations table
        await dbRun(`INSERT OR REPLACE INTO supplier_evaluations (
            supplier_id, 
            evaluator_id, 
            status, 
            comments,
            created_at
        ) VALUES (?, ?, 'resubmission_requested', ?, CURRENT_TIMESTAMP)`, [
            supplierId, 
            evaluatorId, 
            `Resubmission requested: ${additionalMessage || 'Please review and resubmit application'}`
        ]);

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
            
            await emailService.sendSupplierResubmissionEmail(
                supplierEmail,
                businessProfile?.business_name || supplier.username || 'Supplier',
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

// Get supplier profile for bid form auto-population
const getSupplierProfile = async (req, res) => {
    const supplierId = req.user.id;

    try {
        // Get supplier business profile
        const businessProfile = await dbGet(
            'SELECT * FROM supplier_business_profile WHERE supplier_id = ?',
            [supplierId]
        );

        // Get PPRA registrations to find registration number
        const ppraRegistrations = await dbAll(
            'SELECT * FROM supplier_ppra_registrations WHERE supplier_id = ?',
            [supplierId]
        );

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

// Second step of a supplier sign-in when 2FA is enabled.
const completeSupplier2FALogin = async (req, res) => {
    const { challenge, token, isBackupCode } = req.body;
    let supplierId;
    try {
        const claims = jwt.verify(String(challenge || ''), JWT_SECRET);
        if (claims.purpose !== 'supplier-2fa') throw new Error('wrong purpose');
        supplierId = claims.supplierId;
    } catch {
        return res.status(401).json({ error: 'Your sign-in attempt expired. Please enter your password again.' });
    }
    if (!token) return res.status(400).json({ error: 'Verification code is required' });

    try {
        const { verifySupplierSecondFactor } = require('./supplierTwoFactorController');
        if (!(await verifySupplierSecondFactor(supplierId, token, isBackupCode))) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }
        const supplier = await dbGet('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
        if (!supplier || supplier.status !== 'approved') return res.status(403).json({ error: 'This account cannot sign in.' });
        const session = jwt.sign({ supplierId: supplier.id, username: supplier.username, businessEmail: supplier.business_email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Login successful', token: session, supplier: supplierSession(supplier) });
    } catch (error) {
        console.error('Supplier 2FA login error:', error);
        res.status(500).json({ error: 'Error completing 2FA login' });
    }
};

module.exports = {
    registerSupplier,
    loginSupplier,
    completeSupplier2FALogin,
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
    getComprehensiveSupplierData,
    getSupplierRegistrationData,
    requestResubmission
};

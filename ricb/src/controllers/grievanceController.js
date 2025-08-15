const { getDatabase } = require('../config/database');
const EmailService = require('../utils/emailService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for minutes of meeting upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/grievance-minutes';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'grievance-minutes-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadMinutes = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for minutes of meeting'));
        }
    }
});

// Store the current minutes file path for use in approve/reject functions
let currentMinutesFilePath = null;

// Get supplier's rejected items for grievance
const getSupplierRejectedItems = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    if (user.role !== 'supplier') {
        return res.status(403).json({ message: 'Only suppliers can view their rejected items' });
    }

    try {
        // Get rejected items for this supplier
        const rejectedItems = await new Promise((resolve, reject) => {
            db.all(
                `SELECT te.*, dt.id as tender_id, di.item_name, di.quantity as required_quantity,
                        sb.proposed_quantity, sb.total_cost, sb.delivery_days,
                        dt.bidding_end_time, sbp.business_name as company_name
                 FROM technical_evaluations te
                 JOIN supplier_bids sb ON te.bid_id = sb.id
                 JOIN demand_tenders dt ON te.tender_id = dt.id
                 JOIN demand_items di ON te.item_id = di.id
                 JOIN suppliers s ON te.supplier_id = s.id
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 WHERE te.supplier_id = ? AND te.status = 'rejected'
                 ORDER BY te.evaluated_at DESC`,
                [user.id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(rejectedItems);
    } catch (error) {
        console.error('Error fetching rejected items:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Submit grievance application
const submitGrievanceApplication = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { 
        technicalEvaluationId, 
        grievanceReason, 
        supportingDocuments, 
        requestedAction,
        additionalComments 
    } = req.body;

    if (user.role !== 'supplier') {
        return res.status(403).json({ message: 'Only suppliers can submit grievance applications' });
    }

    try {
        // Create grievance_applications table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS grievance_applications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    technical_evaluation_id INTEGER NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    tender_id INTEGER NOT NULL,
                    item_id INTEGER NOT NULL,
                    grievance_reason TEXT NOT NULL,
                    supporting_documents TEXT,
                    requested_action TEXT NOT NULL,
                    additional_comments TEXT,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'under_review', 'meeting_scheduled', 'resolved', 'rejected')),
                    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    reviewed_by INTEGER,
                    reviewed_at DATETIME,
                    meeting_scheduled_date DATETIME,
                    meeting_details TEXT,
                    resolution TEXT,
                    FOREIGN KEY (technical_evaluation_id) REFERENCES technical_evaluations(id),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                    FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                    FOREIGN KEY (reviewed_by) REFERENCES users(id),
                    UNIQUE(technical_evaluation_id, supplier_id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Get technical evaluation details
        const techEvaluation = await new Promise((resolve, reject) => {
            db.get(
                `SELECT te.*, dt.id as tender_id, di.item_name
                 FROM technical_evaluations te
                 JOIN demand_tenders dt ON te.tender_id = dt.id
                 JOIN demand_items di ON te.item_id = di.id
                 WHERE te.id = ? AND te.supplier_id = ?`,
                [technicalEvaluationId, user.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!techEvaluation) {
            return res.status(404).json({ message: 'Technical evaluation not found or not authorized' });
        }

        // Check if grievance already submitted for this evaluation
        const existingGrievance = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM grievance_applications WHERE technical_evaluation_id = ? AND supplier_id = ?',
                [technicalEvaluationId, user.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingGrievance) {
            return res.status(400).json({ message: 'Grievance application already submitted for this item' });
        }

        // Insert grievance application
        const grievanceId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO grievance_applications 
                 (technical_evaluation_id, supplier_id, tender_id, item_id, grievance_reason, 
                  supporting_documents, requested_action, additional_comments)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    technicalEvaluationId,
                    user.id,
                    techEvaluation.tender_id,
                    techEvaluation.item_id,
                    grievanceReason,
                    supportingDocuments || '',
                    requestedAction,
                    additionalComments || ''
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.json({ 
            message: 'Grievance application submitted successfully. It will be reviewed by the Grievance Committee.',
            grievanceId: grievanceId
        });

    } catch (error) {
        console.error('Error submitting grievance application:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get supplier's grievance applications
const getSupplierGrievances = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    if (user.role !== 'supplier') {
        return res.status(403).json({ message: 'Only suppliers can view their grievances' });
    }

    try {
        const grievances = await new Promise((resolve, reject) => {
            db.all(
                `SELECT ga.*, di.item_name, te.rejection_reason,
                        dt.bidding_end_time, u.name as reviewed_by_name
                 FROM grievance_applications ga
                 JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
                 JOIN demand_items di ON ga.item_id = di.id
                 JOIN demand_tenders dt ON ga.tender_id = dt.id
                 LEFT JOIN users u ON ga.reviewed_by = u.id
                 WHERE ga.supplier_id = ?
                 ORDER BY ga.submitted_at DESC`,
                [user.id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(grievances);
    } catch (error) {
        console.error('Error fetching grievances:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all grievance applications for committee review
const getAllGrievances = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from grievance committee
    const canView = user.role === 'superadmin' || 
                   (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));

    if (!canView) {
        return res.status(403).json({ message: 'Only Grievance Committee members can view all grievances' });
    }

    try {
        const grievances = await new Promise((resolve, reject) => {
            db.all(
                `SELECT ga.*, di.item_name, te.rejection_reason,
                        sbp.business_name as company_name, s.business_email as company_email, 
                        sbp.contact_person_name as contact_person, sbp.business_mobile_number as contact_number,
                        dt.bidding_end_time, u.name as reviewed_by_name
                 FROM grievance_applications ga
                 JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
                 JOIN demand_items di ON ga.item_id = di.id
                 JOIN demand_tenders dt ON ga.tender_id = dt.id
                 JOIN suppliers s ON ga.supplier_id = s.id
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 LEFT JOIN users u ON ga.reviewed_by = u.id
                 ORDER BY ga.submitted_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(grievances);
    } catch (error) {
        console.error('Error fetching all grievances:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Schedule grievance meeting
const scheduleGrievanceMeeting = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { grievanceId } = req.params;
    const { meetingDate, meetingTime, meetingLocation, meetingDetails } = req.body;

    // Check if user is from grievance committee
    const canSchedule = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));

    if (!canSchedule) {
        return res.status(403).json({ message: 'Only Grievance Committee members can schedule meetings' });
    }

    try {
        // Get grievance details with supplier info
        const grievance = await new Promise((resolve, reject) => {
            db.get(
                `SELECT ga.*, sbp.business_name as company_name, s.business_email as company_email, 
                        sbp.contact_person_name as contact_person,
                        di.item_name, te.rejection_reason
                 FROM grievance_applications ga
                 JOIN suppliers s ON ga.supplier_id = s.id
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 JOIN demand_items di ON ga.item_id = di.id
                 JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
                 WHERE ga.id = ?`,
                [grievanceId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!grievance) {
            return res.status(404).json({ message: 'Grievance application not found' });
        }

        const meetingDateTime = `${meetingDate} ${meetingTime}`;
        const meetingInfo = {
            date: meetingDate,
            time: meetingTime,
            location: meetingLocation,
            details: meetingDetails
        };

        // Update grievance with meeting details
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE grievance_applications SET 
                 status = 'meeting_scheduled',
                 meeting_scheduled_date = ?,
                 meeting_details = ?,
                 reviewed_by = ?,
                 reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [meetingDateTime, JSON.stringify(meetingInfo), user.id, grievanceId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Send email notification to supplier
        try {
            const emailService = new EmailService();
            
            // Get grievance letter attachment if provided
            let grievanceLetterPath = null;
            if (req.file) {
                grievanceLetterPath = req.file.path;
            }

            await emailService.sendGrievanceMeetingNotification(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                meetingDate,
                meetingTime,
                meetingLocation,
                meetingDetails,
                grievanceLetterPath
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Don't fail the request if email fails
        }

        res.json({ 
            message: 'Grievance meeting scheduled successfully. Email notification sent to supplier.',
            meetingDate: meetingDate,
            meetingTime: meetingTime
        });

    } catch (error) {
        console.error('Error scheduling grievance meeting:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update grievance status
const updateGrievanceStatus = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { grievanceId } = req.params;
    const { status, resolution } = req.body;

    // Check if user is from grievance committee
    const canUpdate = user.role === 'superadmin' || 
                     (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));

    if (!canUpdate) {
        return res.status(403).json({ message: 'Only Grievance Committee members can update grievance status' });
    }

    try {
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE grievance_applications SET 
                 status = ?,
                 resolution = ?,
                 reviewed_by = ?,
                 reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [status, resolution || '', user.id, grievanceId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: 'Grievance status updated successfully' });

    } catch (error) {
        console.error('Error updating grievance status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Approve grievance application
const approveGrievance = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { grievanceId } = req.params;    // Check if user is from grievance committee
    const canApprove = user.role === 'superadmin' || 
                      (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));

    if (!canApprove) {
        return res.status(403).json({ message: 'Only Grievance Committee members can approve grievances' });
    }

    try {
        // Get grievance details with meeting information
        const grievance = await new Promise((resolve, reject) => {
            db.get(
                `SELECT ga.*, sbp.business_name as company_name, s.business_email as company_email, 
                        sbp.contact_person_name as contact_person,
                        di.item_name, te.*, dt.id as tender_id,
                        ga.meeting_scheduled_date as meeting_date_time
                 FROM grievance_applications ga
                 JOIN suppliers s ON ga.supplier_id = s.id
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 JOIN demand_items di ON ga.item_id = di.id
                 JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
                 JOIN demand_tenders dt ON ga.tender_id = dt.id
                 WHERE ga.id = ?`,
                [grievanceId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!grievance) {
            return res.status(404).json({ message: 'Grievance application not found' });
        }

     // Check if meeting was scheduled and has passed (Pakistan UTC+5 time)
        if (!grievance.meeting_date_time) {
            return res.status(400).json({ 
                message: 'Grievance cannot be approved without a scheduled meeting.' 
            });
        }        // Convert to Pakistan time (UTC+5) properly
        const now = new Date();
        // Pakistan is UTC+5, calculate from UTC properly
        const utcTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000));
        const pakistanTime = new Date(utcTime.getTime() + (5 * 60 * 60 * 1000));
        
        const meetingDateTime = new Date(grievance.meeting_date_time);
        
        if (meetingDateTime > pakistanTime) {
            return res.status(400).json({ 
                message: 'Grievance cannot be approved before the scheduled meeting time has passed.' 
            });
        }

        // Update grievance status to approved (resolved)
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE grievance_applications SET 
                 status = 'resolved',
                 resolution = 'Grievance approved by committee. Company added to temporary approval pool.',
                 reviewed_by = ?,
                 reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [user.id, grievanceId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Add company to temporary approval pool
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

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO temporary_approvals 
                 (supplier_id, tender_id, item_id, grievance_id, approved_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [grievance.supplier_id, grievance.tender_id, grievance.item_id, grievanceId, user.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Send approval email to supplier with minutes attachment
        try {
            const emailService = new EmailService();
            await emailService.sendGrievanceApprovalEmail(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                grievance.contact_person,
                currentMinutesFilePath // Add minutes as attachment
            );
        } catch (emailError) {
            console.error('Failed to send approval email:', emailError);
            // Don't fail the request if email fails
        }

        res.json({ 
            message: 'Grievance approved successfully. Company added to temporary approval pool and email notification sent.'
        });

    } catch (error) {
        console.error('Error approving grievance:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Reject grievance application
const rejectGrievance = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { grievanceId } = req.params;
    const { rejectionReason } = req.body;

    // Check if user is from grievance committee
    const canReject = user.role === 'superadmin' || 
                     (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));    if (!canReject) {
        return res.status(403).json({ message: 'Only Grievance Committee members can reject grievances' });
    }

    if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({ message: 'Rejection reason is required' });
    }

    try {
        // Get grievance details with meeting information
        const grievance = await new Promise((resolve, reject) => {
            db.get(
                `SELECT ga.*, sbp.business_name as company_name, s.business_email as company_email, 
                        sbp.contact_person_name as contact_person,
                        di.item_name, ga.meeting_scheduled_date as meeting_date_time
                 FROM grievance_applications ga
                 JOIN suppliers s ON ga.supplier_id = s.id
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 JOIN demand_items di ON ga.item_id = di.id
                 WHERE ga.id = ?`,
                [grievanceId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!grievance) {
            return res.status(404).json({ message: 'Grievance application not found' });
        }

        // Check if grievance is already resolved or rejected (irreversible)
        if (grievance.status === 'resolved' || grievance.status === 'rejected') {
            return res.status(400).json({ 
                message: `Grievance has already been ${grievance.status}. This decision is irreversible.` 
            });
        }        // Check if meeting was scheduled and has passed (Pakistan UTC+5 time)
        if (!grievance.meeting_date_time) {
            return res.status(400).json({ 
                message: 'Grievance cannot be rejected without a scheduled meeting.' 
            });
        }        // Convert to Pakistan time (UTC+5) properly
        const now = new Date();
        // Pakistan is UTC+5, calculate from UTC properly
        const utcTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000));
        const pakistanTime = new Date(utcTime.getTime() + (5 * 60 * 60 * 1000));
        
        const meetingDateTime = new Date(grievance.meeting_date_time);
        
        if (meetingDateTime > pakistanTime) {
            return res.status(400).json({ 
                message: 'Grievance cannot be rejected before the scheduled meeting time has passed.' 
            });
        }

        // Update grievance status to rejected
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE grievance_applications SET 
                 status = 'rejected',
                 resolution = ?,
                 reviewed_by = ?,
                 reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [rejectionReason, user.id, grievanceId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Send rejection email to supplier with minutes attachment
        try {
            const emailService = new EmailService();
            await emailService.sendGrievanceRejectionEmail(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                rejectionReason,
                grievance.contact_person,
                currentMinutesFilePath // Add minutes as attachment
            );
        } catch (emailError) {
            console.error('Failed to send rejection email:', emailError);
            // Don't fail the request if email fails
        }

        res.json({ 
            message: 'Grievance rejected successfully. Email notification sent to supplier.'
        });

    } catch (error) {
        console.error('Error rejecting grievance:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Check if grievance deadline has expired for a supplier
const checkGrievanceDeadlineExpired = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    if (user.role !== 'supplier') {
        return res.status(403).json({ message: 'Only suppliers can check grievance deadlines' });
    }

    try {
        // Get all active grievance deadlines for tenders where this supplier was rejected
        const deadlineInfo = await new Promise((resolve, reject) => {
            db.all(
                `SELECT gd.*, te.id as tech_eval_id, te.item_id, di.item_name,
                        CASE 
                            WHEN datetime('now') > datetime(gd.deadline_end) THEN 1 
                            ELSE 0 
                        END as has_expired
                 FROM grievance_deadlines gd
                 JOIN technical_evaluations te ON gd.tender_id = te.tender_id
                 JOIN demand_items di ON te.item_id = di.id
                 WHERE te.supplier_id = ? AND te.status = 'rejected' AND gd.is_active = 1`,
                [user.id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Group by tender_id and check if any grievance was already submitted
        const deadlineStatus = {};
        
        for (const deadline of deadlineInfo) {
            const tenderId = deadline.tender_id;
            const techEvalId = deadline.tech_eval_id;
            
            // Check if grievance already submitted for this technical evaluation
            const existingGrievance = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT id FROM grievance_applications WHERE technical_evaluation_id = ? AND supplier_id = ?',
                    [techEvalId, user.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!deadlineStatus[tenderId]) {
                deadlineStatus[tenderId] = {
                    tender_id: tenderId,
                    deadline_end: deadline.deadline_end,
                    has_expired: deadline.has_expired,
                    can_apply_grievance: !deadline.has_expired && !existingGrievance,
                    grievance_submitted: !!existingGrievance,
                    items: []
                };
            }

            deadlineStatus[tenderId].items.push({
                tech_eval_id: techEvalId,
                item_id: deadline.item_id,
                item_name: deadline.item_name,
                can_apply: !deadline.has_expired && !existingGrievance,
                grievance_submitted: !!existingGrievance
            });
        }

        res.json(Object.values(deadlineStatus));
    } catch (error) {
        console.error('Error checking grievance deadline:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Schedule bulk meeting for all pending grievances
const scheduleBulkGrievanceMeeting = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { meetingDate, meetingTime, meetingLocation, meetingDetails } = req.body;

    // Check if user is from grievance committee
    const canSchedule = user.role === 'superadmin' || 
                       (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));

    if (!canSchedule) {
        return res.status(403).json({ message: 'Only Grievance Committee members can schedule meetings' });
    }

    if (!meetingDate || !meetingTime || !meetingLocation || !meetingDetails) {
        return res.status(400).json({ message: 'All meeting details are required' });
    }

    try {
        // Get all pending grievances with supplier info
        const pendingGrievances = await new Promise((resolve, reject) => {
            db.all(
                `SELECT ga.*, sbp.business_name as company_name, s.business_email as company_email, 
                        sbp.contact_person_name as contact_person,
                        di.item_name, te.rejection_reason
                 FROM grievance_applications ga
                 JOIN suppliers s ON ga.supplier_id = s.id
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 JOIN demand_items di ON ga.item_id = di.id
                 JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
                 WHERE ga.status = 'submitted'
                 ORDER BY ga.submitted_at ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        if (pendingGrievances.length === 0) {
            return res.status(400).json({ message: 'No pending grievances found to schedule meetings for' });
        }

        const meetingDateTime = `${meetingDate} ${meetingTime}`;
        const meetingInfo = {
            date: meetingDate,
            time: meetingTime,
            location: meetingLocation,
            details: meetingDetails
        };

        // Begin transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Update all pending grievances with meeting details
            for (const grievance of pendingGrievances) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE grievance_applications SET 
                         status = 'meeting_scheduled',
                         meeting_scheduled_date = ?,
                         meeting_details = ?,
                         reviewed_by = ?,
                         reviewed_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [meetingDateTime, JSON.stringify(meetingInfo), user.id, grievance.id],
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

            // Get grievance letter attachment if provided
            let grievanceLetterPath = null;
            if (req.file) {
                grievanceLetterPath = req.file.path;
            }

            // Send bulk email notifications to all suppliers
            const EmailService = require('../utils/emailService');
            const emailService = new EmailService();

            const uniqueSuppliers = new Map();
            pendingGrievances.forEach(grievance => {
                if (!uniqueSuppliers.has(grievance.supplier_id)) {
                    uniqueSuppliers.set(grievance.supplier_id, {
                        email: grievance.company_email,
                        companyName: grievance.company_name,
                        contactPerson: grievance.contact_person,
                        grievances: []
                    });
                }
                uniqueSuppliers.get(grievance.supplier_id).grievances.push(grievance);
            });

            // Send notifications to each unique supplier
            const emailPromises = Array.from(uniqueSuppliers.values()).map(supplier => {
                const grievanceItems = supplier.grievances.map(g => g.item_name).join(', ');
                
                return emailService.sendBulkGrievanceMeetingNotification(
                    supplier.email,
                    supplier.companyName,
                    grievanceItems,
                    meetingDate,
                    meetingTime,
                    meetingLocation,
                    meetingDetails,
                    grievanceLetterPath
                );
            });

            // Wait for all emails to be sent (but don't fail if some emails fail)
            await Promise.allSettled(emailPromises);

            res.json({ 
                message: `Grievance meeting scheduled successfully for ${pendingGrievances.length} grievances. Email notifications sent to ${uniqueSuppliers.size} suppliers.`,
                meetingDate: meetingDate,
                meetingTime: meetingTime,
                affectedGrievances: pendingGrievances.length,
                notifiedSuppliers: uniqueSuppliers.size
            });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Error scheduling bulk grievance meeting:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Upload minutes of meeting (used by grievance committee)
const uploadMinutesOfMeeting = async (req, res) => {
    try {
        const { uploadedBy } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No PDF file uploaded'
            });
        }

        // Store the path globally for use in approve/reject functions
        currentMinutesFilePath = req.file.path;

        console.log('Minutes of meeting uploaded:', currentMinutesFilePath);

        res.json({
            success: true,
            message: 'Minutes of meeting uploaded successfully',
            minutesPath: currentMinutesFilePath
        });
    } catch (error) {
        console.error('Error uploading minutes of meeting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload minutes of meeting'
        });
    }
};

module.exports = {
    getSupplierRejectedItems,
    submitGrievanceApplication,
    getSupplierGrievances,
    getAllGrievances,
    scheduleGrievanceMeeting,
    scheduleBulkGrievanceMeeting,
    updateGrievanceStatus,
    approveGrievance,
    rejectGrievance,
    checkGrievanceDeadlineExpired,
    uploadMinutesOfMeeting,
    uploadMinutes
};
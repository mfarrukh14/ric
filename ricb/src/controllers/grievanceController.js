const { getDatabase } = require('../config/database');
const EmailService = require('../utils/emailService');

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
                        dt.bidding_end_time, s.company_name
                 FROM technical_evaluations te
                 JOIN supplier_bids sb ON te.bid_id = sb.id
                 JOIN demand_tenders dt ON te.tender_id = dt.id
                 JOIN demand_items di ON te.item_id = di.id
                 JOIN suppliers s ON te.supplier_id = s.id
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
                        s.company_name, s.company_email, s.contact_person, s.contact_number,
                        dt.bidding_end_time, u.name as reviewed_by_name
                 FROM grievance_applications ga
                 JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
                 JOIN demand_items di ON ga.item_id = di.id
                 JOIN demand_tenders dt ON ga.tender_id = dt.id
                 JOIN suppliers s ON ga.supplier_id = s.id
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
                `SELECT ga.*, s.company_name, s.company_email, s.contact_person,
                        di.item_name, te.rejection_reason
                 FROM grievance_applications ga
                 JOIN suppliers s ON ga.supplier_id = s.id
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
            const emailContent = `
Dear ${grievance.contact_person || grievance.company_name},

Your grievance application for item "${grievance.item_name}" has been reviewed by the Grievance Committee.

A meeting has been scheduled to discuss your grievance:

Date: ${meetingDate}
Time: ${meetingTime}
Location: ${meetingLocation}

Meeting Details:
${meetingDetails}

Please ensure your attendance at the scheduled meeting. If you have any questions or need to reschedule, please contact us immediately.

Thank you for your cooperation.

Best regards,
RIC Grievance Committee
            `;

            await emailService.sendGrievanceMeetingNotification(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                meetingDate,
                meetingTime,
                meetingLocation,
                meetingDetails
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
    const { grievanceId } = req.params;

    // Check if user is from grievance committee
    const canApprove = user.role === 'superadmin' || 
                      (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));

    if (!canApprove) {
        return res.status(403).json({ message: 'Only Grievance Committee members can approve grievances' });
    }

    try {
        // Get grievance details
        const grievance = await new Promise((resolve, reject) => {
            db.get(
                `SELECT ga.*, s.company_name, s.company_email, s.contact_person,
                        di.item_name, te.*, dt.id as tender_id
                 FROM grievance_applications ga
                 JOIN suppliers s ON ga.supplier_id = s.id
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

        // Send approval email to supplier
        try {
            const emailService = new EmailService();
            await emailService.sendGrievanceApprovalEmail(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                grievance.contact_person
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
                     (user.committee_name && user.committee_name.toLowerCase().includes('grievance'));

    if (!canReject) {
        return res.status(403).json({ message: 'Only Grievance Committee members can reject grievances' });
    }

    if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({ message: 'Rejection reason is required' });
    }

    try {
        // Get grievance details
        const grievance = await new Promise((resolve, reject) => {
            db.get(
                `SELECT ga.*, s.company_name, s.company_email, s.contact_person,
                        di.item_name
                 FROM grievance_applications ga
                 JOIN suppliers s ON ga.supplier_id = s.id
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

        // Send rejection email to supplier
        try {
            const emailService = new EmailService();
            await emailService.sendGrievanceRejectionEmail(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                rejectionReason,
                grievance.contact_person
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

module.exports = {
    getSupplierRejectedItems,
    submitGrievanceApplication,
    getSupplierGrievances,
    getAllGrievances,
    scheduleGrievanceMeeting,
    updateGrievanceStatus,
    approveGrievance,
    rejectGrievance
};
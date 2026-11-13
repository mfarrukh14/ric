const { dbAll, dbGet, dbRun } = require('../db');
const { parseInstant } = require('../utils/time');
const EmailService = require('../utils/emailService');
const fs = require('fs');
const { uploadDir } = require('../middleware/uploads');
const { resolveInside } = require('../utils/files');


const MINUTES_DIR = uploadDir('uploads/grievance-minutes');

// Minutes are uploaded once per meeting, then attached to each approval/rejection email.
// The client echoes back the file name it was given; it is resolved strictly inside the
// minutes folder. (This used to live in a module-level variable shared by every request,
// so one committee's minutes could be mailed out with another grievance.)
const minutesAttachment = (req) => {
    const target = req.body?.minutesFile ? resolveInside(MINUTES_DIR, req.body.minutesFile) : null;
    return target && fs.existsSync(target) ? target : null;
};

// Get supplier's rejected items for grievance
const getSupplierRejectedItems = async (req, res) => {
    const user = req.user;

    if (user.role !== 'supplier') {
        return res.status(403).json({ message: 'Only suppliers can view their rejected items' });
    }

    try {
        // Get rejected items for this supplier
        const rejectedItems = await dbAll(
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
            [user.id]
        );

        res.json(rejectedItems);
    } catch (error) {
        console.error('Error fetching rejected items:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Submit grievance application
const submitGrievanceApplication = async (req, res) => {
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

        // Get technical evaluation details
        const techEvaluation = await dbGet(`SELECT te.*, dt.id as tender_id, di.item_name
         FROM technical_evaluations te
         JOIN demand_tenders dt ON te.tender_id = dt.id
         JOIN demand_items di ON te.item_id = di.id
         WHERE te.id = ? AND te.supplier_id = ?`, [technicalEvaluationId, user.id]);

        if (!techEvaluation) {
            return res.status(404).json({ message: 'Technical evaluation not found or not authorized' });
        }

        // Check if grievance already submitted for this evaluation
        const existingGrievance = await dbGet(
            'SELECT id FROM grievance_applications WHERE technical_evaluation_id = ? AND supplier_id = ?',
            [technicalEvaluationId, user.id]
        );

        if (existingGrievance) {
            return res.status(400).json({ message: 'Grievance application already submitted for this item' });
        }

        // Insert grievance application
        const grievanceId = await dbRun(`INSERT INTO grievance_applications 
         (technical_evaluation_id, supplier_id, tender_id, item_id, grievance_reason, 
          supporting_documents, requested_action, additional_comments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            technicalEvaluationId,
            user.id,
            techEvaluation.tender_id,
            techEvaluation.item_id,
            grievanceReason,
            supportingDocuments || '',
            requestedAction,
            additionalComments || ''
        ]).then(result => result.lastID);

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
    const user = req.user;

    if (user.role !== 'supplier') {
        return res.status(403).json({ message: 'Only suppliers can view their grievances' });
    }

    try {
        const grievances = await dbAll(`SELECT ga.*, di.item_name, te.rejection_reason,
                dt.bidding_end_time, u.name as reviewed_by_name
         FROM grievance_applications ga
         JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
         JOIN demand_items di ON ga.item_id = di.id
         JOIN demand_tenders dt ON ga.tender_id = dt.id
         LEFT JOIN users u ON ga.reviewed_by = u.id
         WHERE ga.supplier_id = ?
         ORDER BY ga.submitted_at DESC`, [user.id]);

        res.json(grievances);
    } catch (error) {
        console.error('Error fetching grievances:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all grievance applications for committee review
const getAllGrievances = async (req, res) => {

    // Check if user is from grievance committee

    try {
        const grievances = await dbAll(`SELECT ga.*, di.item_name, te.rejection_reason,
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
         ORDER BY ga.submitted_at DESC`, []);

        res.json(grievances);
    } catch (error) {
        console.error('Error fetching all grievances:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Schedule grievance meeting
const scheduleGrievanceMeeting = async (req, res) => {
    const user = req.user;
    const { grievanceId } = req.params;
    const { meetingDate, meetingTime, meetingLocation, meetingDetails } = req.body;

    // Check if user is from grievance committee

    try {
        // Get grievance details with supplier info
        const grievance = await dbGet(
            `SELECT ga.*, sbp.business_name as company_name, s.business_email as company_email, 
                    sbp.contact_person_name as contact_person,
                    di.item_name, te.rejection_reason
             FROM grievance_applications ga
             JOIN suppliers s ON ga.supplier_id = s.id
             LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
             JOIN demand_items di ON ga.item_id = di.id
             JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
             WHERE ga.id = ?`,
            [grievanceId]
        );

        if (!grievance) {
            return res.status(404).json({ message: 'Grievance application not found' });
        }

        const meetingDateTime = parseInstant(`${meetingDate}T${meetingTime}`);
        if (!meetingDateTime) return res.status(400).json({ message: 'A valid meeting date and time is required' });
        const meetingInfo = {
            date: meetingDate,
            time: meetingTime,
            location: meetingLocation,
            details: meetingDetails
        };

        // Update grievance with meeting details
        await dbRun(`UPDATE grievance_applications SET 
         status = 'meeting_scheduled',
         meeting_scheduled_date = ?,
         meeting_details = ?,
         reviewed_by = ?,
         reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [meetingDateTime, JSON.stringify(meetingInfo), user.id, grievanceId]);

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
    const user = req.user;
    const { grievanceId } = req.params;
    const { status, resolution } = req.body;

    // Check if user is from grievance committee

    try {
        // Get grievance details first
        const grievance = await dbGet('SELECT * FROM grievance_applications WHERE id = ?', [grievanceId]);

        if (!grievance) {
            return res.status(404).json({ message: 'Grievance not found' });
        }

        {
            // Update grievance status
            await dbRun(`UPDATE grievance_applications SET 
             status = ?,
             resolution = ?,
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ?`, [status, resolution || '', user.id, grievanceId]);

            // If grievance is resolved as approved, update corresponding technical evaluation
            if (status === 'resolved' && resolution && 
                (resolution.toLowerCase().includes('approved') || 
                 resolution.toLowerCase().includes('favor') ||
                 resolution.toLowerCase().includes('accepted'))) {
                
                
                // Update the specific technical evaluation related to this grievance
                await dbRun(`UPDATE technical_evaluations SET 
                 status = 'approved',
                 evaluation_status = 'approved'
                 WHERE id = ?`, [grievance.technical_evaluation_id]);

            } else if (status === 'resolved' && resolution && 
                      (resolution.toLowerCase().includes('rejected') || 
                       resolution.toLowerCase().includes('denied') ||
                       resolution.toLowerCase().includes('dismissed'))) {
                
            }

            res.json({
                message: 'Grievance status updated successfully',
                technicalEvaluationUpdated: status === 'resolved' && resolution &&
                    (resolution.toLowerCase().includes('approved') ||
                     resolution.toLowerCase().includes('favor') ||
                     resolution.toLowerCase().includes('accepted'))
            });
        }

    } catch (error) {
        console.error('Error updating grievance status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Approve grievance application
const approveGrievance = async (req, res) => {
    const user = req.user;
    const { grievanceId } = req.params;    // Check if user is from grievance committee

    try {
        // Get grievance details with meeting information
        const grievance = await dbGet(
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
            [grievanceId]
        );

        if (!grievance) {
            return res.status(404).json({ message: 'Grievance application not found' });
        }

     // Check if meeting was scheduled and has passed (Pakistan UTC+5 time)
        if (!grievance.meeting_date_time) {
            return res.status(400).json({ 
                message: 'Grievance cannot be approved without a scheduled meeting.' 
            });
        }        // Convert to Pakistan time (UTC+5) properly
        // Both are real instants, so no time-zone arithmetic is needed.
        if (new Date(grievance.meeting_date_time) > new Date()) {
            return res.status(400).json({ 
                message: 'Grievance cannot be approved before the scheduled meeting time has passed.' 
            });
        }

        // Update grievance status to approved (resolved)
        await dbRun(`UPDATE grievance_applications SET 
         status = 'resolved',
         resolution = 'Grievance approved by committee. Company added to temporary approval pool.',
         reviewed_by = ?,
         reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [user.id, grievanceId]);

        // Update the corresponding technical evaluation to approved
        
        await dbRun(`UPDATE technical_evaluations SET 
         status = 'approved',
         evaluation_status = 'approved'
         WHERE id = ?`, [grievance.technical_evaluation_id]);


        await dbRun(`INSERT OR REPLACE INTO temporary_approvals 
         (supplier_id, tender_id, item_id, grievance_id, approved_by)
         VALUES (?, ?, ?, ?, ?)`, [grievance.supplier_id, grievance.tender_id, grievance.item_id, grievanceId, user.id]);

        // Send approval email to supplier with minutes attachment
        try {
            const emailService = new EmailService();
            await emailService.sendGrievanceApprovalEmail(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                grievance.contact_person,
                minutesAttachment(req)
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
    const user = req.user;
    const { grievanceId } = req.params;
    const { rejectionReason } = req.body;

    // Check if user is from grievance committee

    if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({ message: 'Rejection reason is required' });
    }

    try {
        // Get grievance details with meeting information
        const grievance = await dbGet(
            `SELECT ga.*, sbp.business_name as company_name, s.business_email as company_email, 
                    sbp.contact_person_name as contact_person,
                    di.item_name, ga.meeting_scheduled_date as meeting_date_time
             FROM grievance_applications ga
             JOIN suppliers s ON ga.supplier_id = s.id
             LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
             JOIN demand_items di ON ga.item_id = di.id
             WHERE ga.id = ?`,
            [grievanceId]
        );

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
        // Both are real instants, so no time-zone arithmetic is needed.
        if (new Date(grievance.meeting_date_time) > new Date()) {
            return res.status(400).json({ 
                message: 'Grievance cannot be rejected before the scheduled meeting time has passed.' 
            });
        }

        // Update grievance status to rejected
        await dbRun(`UPDATE grievance_applications SET 
         status = 'rejected',
         resolution = ?,
         reviewed_by = ?,
         reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [rejectionReason, user.id, grievanceId]);

        // Send rejection email to supplier with minutes attachment
        try {
            const emailService = new EmailService();
            await emailService.sendGrievanceRejectionEmail(
                grievance.company_email,
                grievance.company_name,
                grievance.item_name,
                rejectionReason,
                grievance.contact_person,
                minutesAttachment(req)
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
    const user = req.user;

    if (user.role !== 'supplier') {
        return res.status(403).json({ message: 'Only suppliers can check grievance deadlines' });
    }

    try {
        // Get all active grievance deadlines for tenders where this supplier was rejected
        const deadlineInfo = await dbAll(`SELECT gd.*, te.id as tech_eval_id, te.item_id, di.item_name,
                CASE 
                    WHEN datetime('now') > datetime(gd.deadline_end) THEN 1 
                    ELSE 0 
                END as has_expired
         FROM grievance_deadlines gd
         JOIN technical_evaluations te ON gd.tender_id = te.tender_id
         JOIN demand_items di ON te.item_id = di.id
         WHERE te.supplier_id = ? AND te.status = 'rejected' AND gd.is_active = 1`, [user.id]);

        // Group by tender_id and check if any grievance was already submitted
        const deadlineStatus = {};
        
        for (const deadline of deadlineInfo) {
            const tenderId = deadline.tender_id;
            const techEvalId = deadline.tech_eval_id;
            
            // Check if grievance already submitted for this technical evaluation
            const existingGrievance = await dbGet(
                'SELECT id FROM grievance_applications WHERE technical_evaluation_id = ? AND supplier_id = ?',
                [techEvalId, user.id]
            );

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
    const user = req.user;
    const { meetingDate, meetingTime, meetingLocation, meetingDetails } = req.body;

    // Check if user is from grievance committee

    if (!meetingDate || !meetingTime || !meetingLocation || !meetingDetails) {
        return res.status(400).json({ message: 'All meeting details are required' });
    }

    try {
        // Get all pending grievances with supplier info
        const pendingGrievances = await dbAll(
            `SELECT ga.*, sbp.business_name as company_name, s.business_email as company_email, 
                    sbp.contact_person_name as contact_person,
                    di.item_name, te.rejection_reason
             FROM grievance_applications ga
             JOIN suppliers s ON ga.supplier_id = s.id
             LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
             JOIN demand_items di ON ga.item_id = di.id
             JOIN technical_evaluations te ON ga.technical_evaluation_id = te.id
             WHERE ga.status = 'pending'
             ORDER BY ga.submitted_at ASC`,
            []
        );

        if (pendingGrievances.length === 0) {
            return res.status(400).json({ message: 'No pending grievances found to schedule meetings for' });
        }

        const meetingDateTime = parseInstant(`${meetingDate}T${meetingTime}`);
        if (!meetingDateTime) return res.status(400).json({ message: 'A valid meeting date and time is required' });
        const meetingInfo = {
            date: meetingDate,
            time: meetingTime,
            location: meetingLocation,
            details: meetingDetails
        };

        {
            // Update all pending grievances with meeting details
            for (const grievance of pendingGrievances) {
                await dbRun(`UPDATE grievance_applications SET 
                 status = 'meeting_scheduled',
                 meeting_scheduled_date = ?,
                 meeting_details = ?,
                 reviewed_by = ?,
                 reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = ?`, [meetingDateTime, JSON.stringify(meetingInfo), user.id, grievance.id]);
            }

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
        }

    } catch (error) {
        console.error('Error scheduling bulk grievance meeting:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Upload minutes of meeting (used by grievance committee)
const uploadMinutesOfMeeting = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No PDF file uploaded'
            });
        }

        res.json({
            success: true,
            message: 'Minutes of meeting uploaded successfully',
            minutesFile: req.file.filename
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
    uploadMinutesOfMeeting
};
const { dbAll, dbGet, dbRun } = require('../db');
const { parseInstant } = require('../utils/time');
const path = require('path');
const fs = require('fs');
const { createUpload, MIME } = require('../middleware/uploads');
const { sendFinancialGrievanceEmail } = require('../utils/emailService');


const uploadMeetingMinutes = createUpload({
    dir: 'meeting-minutes',
    prefix: 'meeting-minutes',
    accept: [...MIME.pdf, ...MIME.word],
    typeError: 'Only PDF and Word documents are allowed for meeting minutes.',
}).single('minutesFile');

// Initiate financial grievance process
const initiateFinancialGrievance = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { meetingDateTime, meetingLocation, customMessage } = req.body;
        const userId = req.user.id;

        const meetingAt = parseInstant(meetingDateTime);
        if (!meetingAt) {
            return res.status(400).json({ error: 'A valid meeting date and time is required' });
        }

        // Validate that tender exists and is financially opened
        const tender = await dbGet(`
            SELECT 
                dt.id,
                dt.tender_number,
                dt.demand_id,
                d.item_name,
                d.description,
                fo.status as financial_status,
                fo.opened_at,
                COUNT(DISTINCT te.supplier_id) as approved_suppliers_count
            FROM demand_tenders dt
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN financial_openings fo ON dt.id = fo.tender_id
            LEFT JOIN technical_evaluations te ON dt.id = te.tender_id AND te.status = 'approved'
            WHERE dt.id = ?
            GROUP BY dt.id, dt.tender_number, dt.demand_id, d.item_name, d.description, fo.status, fo.opened_at
        `, [tenderId]);

        if (!tender) {
            return res.status(404).json({ error: 'Tender not found' });
        }

        if (tender.financial_status !== 'opened') {
            return res.status(400).json({ 
                error: 'Tender must be financially opened before initiating grievance process' 
            });
        }

        // Check if financial grievance already initiated for this tender
        const existingGrievance = await dbGet('SELECT id FROM financial_grievances WHERE tender_id = ?', [tenderId]);

        if (existingGrievance) {
            return res.status(400).json({ 
                error: 'Financial grievance process already initiated for this tender' 
            });
        }

        // Get all approved suppliers for this tender
        const approvedSuppliers = await dbAll(`
            SELECT DISTINCT
                s.id as supplier_id,
                s.business_email,
                sbp.business_name,
                sbp.contact_person_name
            FROM technical_evaluations te
            JOIN supplier_bids sb ON te.bid_id = sb.id
            JOIN suppliers s ON sb.supplier_id = s.id
            JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
            WHERE te.tender_id = ? AND te.status = 'approved'
        `, [tenderId]);

        if (approvedSuppliers.length === 0) {
            return res.status(400).json({ 
                error: 'No approved suppliers found for this tender' 
            });
        }

        // Calculate grievance deadline (10 days from now)
        const grievanceStartDate = new Date();
        const grievanceEndDate = new Date();
        grievanceEndDate.setDate(grievanceEndDate.getDate() + 10);

        // Insert financial grievance record
        const grievanceId = await dbRun(`
            INSERT INTO financial_grievances 
            (tender_id, meeting_datetime, meeting_location, custom_message, 
             grievance_start_date, grievance_end_date, initiated_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
            tenderId,
            meetingAt,
            meetingLocation || 'Conference Room - Rawalpindi Institute of Cardiology',
            customMessage || '',
            grievanceStartDate,
            grievanceEndDate,
            userId
        ]).then(result => result.lastID);

        // Get financial opening report path
        const financialReport = await dbGet(
            'SELECT report_file_path FROM financial_opening_reports WHERE tender_id = ? ORDER BY created_at DESC LIMIT 1',
            [tenderId]
        );

        // Send emails to all approved suppliers
        let emailsSent = 0;
        const emailPromises = approvedSuppliers.map(async (supplier) => {
            try {

                // Get financial opening report file path for attachment
                let reportPath = null;
                if (financialReport && financialReport.report_file_path) {
                    const fullReportPath = path.join(__dirname, '../../financial-reports', financialReport.report_file_path);
                    if (fs.existsSync(fullReportPath)) {
                        reportPath = fullReportPath;
                    }
                }

                await sendFinancialGrievanceEmail(
                    supplier.business_email,
                    supplier.company_name,
                    tender.item_name,
                    tender.tender_number,
                    meetingDateTime,
                    reportPath
                );

                // Log successful email
                await dbRun(`
                    INSERT INTO financial_grievance_emails 
                    (grievance_id, supplier_id, email_address, status, sent_at)
                    VALUES (?, ?, ?, 'sent', CURRENT_TIMESTAMP)
                `, [grievanceId, supplier.supplier_id, supplier.business_email]);

                emailsSent++;
            } catch (emailError) {
                console.error(`Failed to send email to ${supplier.business_email}:`, emailError);
                
                // Log failed email
                await dbRun(`
                    INSERT INTO financial_grievance_emails 
                    (grievance_id, supplier_id, email_address, status, error_message, sent_at)
                    VALUES (?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
                `, [grievanceId, supplier.supplier_id, supplier.business_email, emailError.message]);
            }
        });

        await Promise.all(emailPromises);

        // Update grievance record with email stats
        await dbRun(`
            UPDATE financial_grievances 
            SET emails_sent = ?, total_recipients = ?
            WHERE id = ?
        `, [emailsSent, approvedSuppliers.length, grievanceId]);

        res.json({
            message: 'Financial grievance initiated successfully',
            grievance_id: grievanceId,
            emails_sent: emailsSent,
            total_recipients: approvedSuppliers.length,
            grievance_period_days: 10,
            grievance_end_date: grievanceEndDate.toISOString(),
            meeting_datetime: meetingDateTime
        });

    } catch (error) {
        console.error('Error initiating financial grievance:', error);
        res.status(500).json({ error: 'Failed to initiate financial grievance' });
    }
};

// Upload meeting minutes after grievance meeting  
const uploadFinancialGrievanceMinutes = (req, res) => {
    uploadMeetingMinutes(req, res, async (err) => {
        if (err) {
            console.error('File upload error:', err);
            return res.status(400).json({ 
                success: false, 
                message: err.message || 'File upload failed' 
            });
        }

        try {
            const { tenderId } = req.params;
            const userId = req.user.id;

            // Check if grievance exists for this tender
            const grievance = await dbGet(`
                SELECT fg.*, dt.tender_number, d.item_name
                FROM financial_grievances fg
                JOIN demand_tenders dt ON fg.tender_id = dt.id
                JOIN demands d ON dt.demand_id = d.id
                WHERE fg.tender_id = ?
            `, [tenderId]);

            if (!grievance) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Financial grievance not found for this tender' 
                });
            }

            if (grievance.status !== 'active') {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Financial grievance is not in active status' 
                });
            }

            // Check if meeting time has passed
            const meetingTime = new Date(grievance.meeting_datetime);
            const currentTime = new Date();

            if (currentTime < meetingTime) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Cannot upload minutes before the meeting time' 
                });
            }

            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Meeting minutes file is required' 
                });
            }

            // Update grievance status to completed with meeting minutes info
            await dbRun(`
                UPDATE financial_grievances 
                SET status = 'completed', 
                    meeting_held_at = CURRENT_TIMESTAMP, 
                    completed_by = ?,
                    meeting_minutes_file = ?
                WHERE tender_id = ?
            `, [userId, req.file.filename, tenderId]);

            // Get all suppliers who received grievance emails
            const suppliers = await dbAll(`
                SELECT DISTINCT
                    s.business_email,
                    sbp.business_name,
                    sbp.contact_person_name
                FROM financial_grievance_emails fge
                JOIN suppliers s ON fge.supplier_id = s.id
                JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                WHERE fge.grievance_id = ? AND fge.status = 'sent'
            `, [grievance.id]);

            // Send meeting minutes to all suppliers via email
            let emailsSent = 0;
            const emailPromises = suppliers.map(async (supplier) => {
                try {
                    // Send email with meeting minutes (simplified for now)
                    const emailSent = await sendFinancialGrievanceEmail(
                        supplier.business_email,
                        supplier.business_name,
                        grievance.item_name,
                        grievance.tender_number || `#${grievance.tender_id}`,
                        grievance.meeting_datetime,
                        req.file.path, // Meeting minutes file path
                        'meeting_minutes'
                    );

                    if (emailSent) {
                        emailsSent++;
                    }
                } catch (emailError) {
                    console.error(`Failed to send meeting minutes to ${supplier.business_email}:`, emailError);
                }
            });

            await Promise.all(emailPromises);

            res.json({
                success: true,
                message: 'Meeting minutes uploaded and distributed successfully',
                data: {
                    tenderId,
                    fileName: req.file.filename,
                    fileSize: req.file.size,
                    distributedTo: emailsSent,
                    totalRecipients: suppliers.length
                }
            });
        } catch (error) {
            console.error('Error uploading financial grievance minutes:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to upload meeting minutes' 
            });
        }
    });
};

// Get financial grievance status for a tender
const getFinancialGrievanceStatus = async (req, res) => {
    try {
        const { tenderId } = req.params;

        // Get financial grievance for this tender
        const grievance = await dbGet(`
            SELECT 
                fg.*,
                dt.tender_number,
                d.item_name
            FROM financial_grievances fg
            JOIN demand_tenders dt ON fg.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            WHERE fg.tender_id = ?
        `, [tenderId]);

        if (!grievance) {
            return res.json({
                success: true,
                data: {
                    tenderId,
                    status: 'not_initiated',
                    hasGrievance: false
                }
            });
        }

        // Determine current status based on meeting time and completion
        const meetingTime = new Date(grievance.meeting_datetime);
        const currentTime = new Date();

        let currentStatus = grievance.status;
        if (grievance.status === 'active' && currentTime >= meetingTime) {
            currentStatus = 'meeting_time_passed';
        }

        res.json({
            success: true,
            data: {
                tenderId,
                status: currentStatus,
                hasGrievance: true,
                meetingDateTime: grievance.meeting_datetime,
                meetingLocation: grievance.meeting_location,
                createdAt: grievance.created_at,
                completedAt: grievance.meeting_held_at,
                tenderTitle: `${grievance.tender_number} - ${grievance.item_name}`
            }
        });
    } catch (error) {
        console.error('Error getting financial grievance status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get financial grievance status' 
        });
    }
};

module.exports = {
    initiateFinancialGrievance,
    uploadFinancialGrievanceMinutes,
    getFinancialGrievanceStatus
};

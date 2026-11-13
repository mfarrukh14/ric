const { dbAll, dbGet, dbRun } = require('../db');
const { calendarDate, clockTime, pktDate } = require('../utils/time');
const EmailService = require('../utils/emailService');
const path = require('path');
const fs = require('fs');


// Schedule pre-bid meeting for a published tender
const schedulePreBidMeeting = async (req, res) => {
    const { tenderId } = req.params;
    const { meetingDate, meetingTime, location, venue, agenda, additionalNotes } = req.body;
    const user = req.user;

    // Check if user is from purchase department

    if (!meetingDate || !meetingTime || !location) {
        return res.status(400).json({ message: 'Meeting date, time, and location are required' });
    }

    try {
        // Check if tender exists and is published
        const tender = await dbGet(`SELECT dt.*, d.item_name, d.description 
         FROM demand_tenders dt
         JOIN demands d ON dt.demand_id = d.id
         WHERE dt.id = ? AND dt.tender_status = 'active'`, [tenderId]);

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not published yet' });
        }


        // Check if meeting already exists for this tender
        const existingMeeting = await dbGet('SELECT * FROM pre_bid_meetings WHERE tender_id = ?', [tenderId]);

        if (existingMeeting) {
            // Update existing meeting
            await dbRun(`UPDATE pre_bid_meetings SET 
             meeting_date = ?, meeting_time = ?, location = ?, venue = ?, 
             agenda = ?, additional_notes = ?, scheduled_by = ?, 
             scheduled_at = CURRENT_TIMESTAMP, status = 'scheduled'
             WHERE tender_id = ?`, [meetingDate, meetingTime, location, venue, agenda, additionalNotes, user.id, tenderId]);
        } else {
            // Create new meeting
            await dbRun(`INSERT INTO pre_bid_meetings 
             (tender_id, meeting_date, meeting_time, location, venue, agenda, additional_notes, scheduled_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [tenderId, meetingDate, meetingTime, location, venue, agenda, additionalNotes, user.id]);
        }

        
        // Get all registered suppliers
        const suppliers = await dbAll(
            `SELECT s.id, s.username, s.business_email, bp.business_name, bp.contact_person_name
             FROM suppliers s
             LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
             WHERE s.status = 'approved' AND s.business_email IS NOT NULL`,
            []
        );

        if (suppliers.length === 0) {
        }

        
        // Send email notifications to all suppliers
        const emailService = new EmailService();
        let emailsSent = 0;
        let emailsFailed = 0;
        const failedEmails = [];

        for (const supplier of suppliers) {
            try {
                
                await emailService.sendPreBidMeetingNotification(
                    supplier.business_email,
                    supplier.business_name || supplier.username,
                    supplier.contact_person_name,
                    {
                        tender_id: tender.id,
                        tender_number: tender.tender_number,
                        tender_title: tender.item_name,
                        tender_description: tender.description,
                        meeting_date: meetingDate,
                        meeting_time: meetingTime,
                        location: location,
                        venue: venue,
                        agenda: agenda,
                        additional_notes: additionalNotes
                    }
                );
                
                emailsSent++;
                
            } catch (emailError) {
                console.error(`Failed to send pre-bid meeting email to ${supplier.business_email}:`, emailError);
                emailsFailed++;
                failedEmails.push({
                    supplier: supplier.business_name || supplier.username,
                    email: supplier.business_email,
                    error: emailError.message
                });
            }
        }

        res.json({
            message: 'Pre-bid meeting scheduled successfully',
            tender_id: tenderId,
            meeting_details: {
                meeting_date: meetingDate,
                meeting_time: meetingTime,
                location: location,
                venue: venue,
                agenda: agenda,
                additional_notes: additionalNotes
            },
            notifications: {
                total_suppliers: suppliers.length,
                emails_sent: emailsSent,
                emails_failed: emailsFailed,
                failed_emails: failedEmails
            }
        });

    } catch (error) {
        console.error('Error scheduling pre-bid meeting:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get pre-bid meetings for purchase department
const getPreBidMeetings = async (req, res) => {

    // Check if user is from purchase department

    try {
        const meetings = await dbAll(
            `SELECT pbm.*, dt.tender_number, d.item_name as tender_title, d.description as tender_description,
                    u.name as scheduled_by_name, cu.name as completed_by_name
             FROM pre_bid_meetings pbm
             JOIN demand_tenders dt ON pbm.tender_id = dt.id
             JOIN demands d ON dt.demand_id = d.id
             LEFT JOIN users u ON pbm.scheduled_by = u.id
             LEFT JOIN users cu ON pbm.completed_by = cu.id
             ORDER BY pbm.meeting_date DESC, pbm.meeting_time DESC`,
            []
        );

        // Categorize meetings by status and their (Pakistan) calendar date
        const todayDate = pktDate();

        const categorizedMeetings = {
            upcoming: [],
            today: [],
            past_incomplete: [],
            completed: [],
            cancelled: []
        };

        meetings.forEach(meeting => {
            meeting.meeting_date = calendarDate(meeting.meeting_date);
            meeting.meeting_time = clockTime(meeting.meeting_time);
            const meetingDate = meeting.meeting_date;
            
            if (meeting.status === 'completed') {
                categorizedMeetings.completed.push(meeting);
            } else if (meeting.status === 'cancelled') {
                categorizedMeetings.cancelled.push(meeting);
            } else if (meetingDate === todayDate) {
                categorizedMeetings.today.push(meeting);
            } else if (meetingDate > todayDate) {
                categorizedMeetings.upcoming.push(meeting);
            } else {
                categorizedMeetings.past_incomplete.push(meeting);
            }
        });

        res.json({
            current_date: todayDate,
            meetings: categorizedMeetings
        });

    } catch (error) {
        console.error('Error fetching pre-bid meetings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Upload meeting minutes after meeting completion
const uploadMeetingMinutes = async (req, res) => {
    const { meetingId } = req.params;
    const user = req.user;

    // Check if user is from purchase department

    if (!req.file) {
        return res.status(400).json({ message: 'Meeting minutes document is required' });
    }

    try {
        
        // Get meeting details
        const meeting = await dbGet(`SELECT pbm.*, dt.tender_number, d.item_name as tender_title
         FROM pre_bid_meetings pbm
         JOIN demand_tenders dt ON pbm.tender_id = dt.id
         JOIN demands d ON dt.demand_id = d.id
         WHERE pbm.id = ?`, [meetingId]);

        if (!meeting) {
            return res.status(404).json({ message: 'Pre-bid meeting not found' });
        }

        // Minutes can be uploaded from the meeting day on (Pakistan calendar).
        if (calendarDate(meeting.meeting_date) > pktDate()) {
            return res.status(400).json({ message: 'Cannot upload minutes for future meetings' });
        }

        
        // Update meeting with minutes document
        await dbRun(`UPDATE pre_bid_meetings SET 
         minutes_file_path = ?, minutes_original_name = ?, status = 'completed', 
         completed_at = CURRENT_TIMESTAMP, completed_by = ?
         WHERE id = ?`, [req.file.path, req.file.originalname, user.id, meetingId]);

        
        // Get all registered suppliers to send the minutes
        const suppliers = await dbAll(
            `SELECT s.id, s.username, s.business_email, bp.business_name, bp.contact_person_name
             FROM suppliers s
             LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
             WHERE s.status = 'approved' AND s.business_email IS NOT NULL`,
            []
        );

        if (suppliers.length === 0) {
        }

        // Send meeting minutes to all suppliers
        const emailService = new EmailService();
        let emailsSent = 0;
        let emailsFailed = 0;
        const failedEmails = [];

        
        // Read the uploaded file for email attachment
        const minutesBuffer = fs.readFileSync(req.file.path);

        
        for (const supplier of suppliers) {
            try {
                
                await emailService.sendMeetingMinutes(
                    supplier.business_email,
                    supplier.business_name || supplier.username,
                    supplier.contact_person_name,
                    {
                        tender_id: meeting.tender_id,
                        tender_number: meeting.tender_number,
                        tender_title: meeting.tender_title,
                        meeting_date: meeting.meeting_date,
                        meeting_time: meeting.meeting_time,
                        location: meeting.location
                    },
                    minutesBuffer,
                    req.file.originalname
                );
                
                emailsSent++;
                
            } catch (emailError) {
                console.error(`Failed to send meeting minutes to ${supplier.business_email}:`, emailError);
                emailsFailed++;
                failedEmails.push({
                    supplier: supplier.business_name || supplier.username,
                    email: supplier.business_email,
                    error: emailError.message
                });
            }
        }

        res.json({
            message: 'Meeting minutes uploaded and distributed successfully',
            meeting_id: meetingId,
            document_path: req.file.path,
            notifications: {
                total_suppliers: suppliers.length,
                emails_sent: emailsSent,
                emails_failed: emailsFailed,
                failed_emails: failedEmails
            }
        });

    } catch (error) {
        console.error('Error uploading meeting minutes:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Download meeting minutes
const downloadMeetingMinutes = async (req, res) => {
    const { meetingId } = req.params;

    // Check if user is from purchase department

    try {
        const meeting = await dbGet(
            'SELECT minutes_file_path, minutes_original_name FROM pre_bid_meetings WHERE id = ?',
            [meetingId]
        );

        if (!meeting || !meeting.minutes_file_path) {
            return res.status(404).json({ message: 'Meeting minutes not found' });
        }

        const filePath = meeting.minutes_file_path;

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Meeting minutes file not found on server' });
        }

        // Get file extension to set proper content type
        const fileExt = path.extname(filePath).toLowerCase();
        let contentType = 'application/octet-stream';
        
        switch (fileExt) {
            case '.pdf':
                contentType = 'application/pdf';
                break;
            case '.doc':
                contentType = 'application/msword';
                break;
            case '.docx':
                contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                break;
        }

        // Use original filename if available, otherwise generate one
        const downloadName = meeting.minutes_original_name || `meeting-minutes-${meetingId}${fileExt}`;

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', contentType);
        
        // Send file
        res.sendFile(path.resolve(filePath));

    } catch (error) {
        console.error('Error downloading meeting minutes:', error);
        res.status(500).json({ message: 'Failed to download meeting minutes' });
    }
};

// Cancel pre-bid meeting
const cancelPreBidMeeting = async (req, res) => {
    const { meetingId } = req.params;
    const { cancellationReason } = req.body;

    // Check if user is from purchase department

    try {
        // Get meeting details
        const meeting = await dbGet(`SELECT pbm.*, dt.tender_number, d.item_name as tender_title
         FROM pre_bid_meetings pbm
         JOIN demand_tenders dt ON pbm.tender_id = dt.id
         JOIN demands d ON dt.demand_id = d.id
         WHERE pbm.id = ? AND pbm.status = 'scheduled'`, [meetingId]);

        if (!meeting) {
            return res.status(404).json({ message: 'Scheduled meeting not found' });
        }

        // Update meeting status to cancelled
        await dbRun(`UPDATE pre_bid_meetings SET 
         status = 'cancelled', additional_notes = ?
         WHERE id = ?`, [cancellationReason || 'Meeting cancelled', meetingId]);

        // Get all registered suppliers
        const suppliers = await dbAll(
            `SELECT s.id, s.username, s.business_email, bp.business_name, bp.contact_person_name
             FROM suppliers s
             LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
             WHERE s.status = 'approved' AND s.business_email IS NOT NULL`,
            []
        );

        // Send cancellation notifications
        const emailService = new EmailService();
        let emailsSent = 0;
        let emailsFailed = 0;

        for (const supplier of suppliers) {
            try {
                await emailService.sendMeetingCancellation(
                    supplier.business_email,
                    supplier.business_name || supplier.username,
                    supplier.contact_person_name,
                    {
                        tender_id: meeting.tender_id,
                        tender_number: meeting.tender_number,
                        tender_title: meeting.tender_title,
                        meeting_date: meeting.meeting_date,
                        meeting_time: meeting.meeting_time,
                        location: meeting.location,
                        cancellation_reason: cancellationReason
                    }
                );
                emailsSent++;
            } catch (emailError) {
                console.error(`Failed to send cancellation email to ${supplier.business_email}:`, emailError);
                emailsFailed++;
            }
        }

        res.json({
            message: 'Pre-bid meeting cancelled successfully',
            meeting_id: meetingId,
            notifications: {
                total_suppliers: suppliers.length,
                emails_sent: emailsSent,
                emails_failed: emailsFailed
            }
        });

    } catch (error) {
        console.error('Error cancelling pre-bid meeting:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    schedulePreBidMeeting,
    getPreBidMeetings,
    uploadMeetingMinutes,
    downloadMeetingMinutes,
    cancelPreBidMeeting
};

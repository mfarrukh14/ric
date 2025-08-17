const { getDatabase } = require('../config/database');
const EmailService = require('../utils/emailService');
const path = require('path');
const fs = require('fs');

// Schedule pre-bid meeting for a published tender
const schedulePreBidMeeting = async (req, res) => {
    const db = getDatabase();
    const { tenderId } = req.params;
    const { meetingDate, meetingTime, location, venue, agenda, additionalNotes } = req.body;
    const user = req.user;

    // Check if user is from purchase department
    const canSchedule = user.role === 'superadmin' || 
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canSchedule) {
        return res.status(403).json({ message: 'Only purchase department members can schedule pre-bid meetings' });
    }

    if (!meetingDate || !meetingTime || !location) {
        return res.status(400).json({ message: 'Meeting date, time, and location are required' });
    }

    try {
        // Check if tender exists and is published
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.item_name, d.description 
                 FROM demand_tenders dt
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE dt.id = ? AND dt.tender_status = 'active'`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tender) {
            return res.status(404).json({ message: 'Tender not found or not published yet' });
        }

        // Create pre_bid_meetings table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS pre_bid_meetings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tender_id INTEGER NOT NULL,
                    meeting_date DATE NOT NULL,
                    meeting_time TIME NOT NULL,
                    location TEXT NOT NULL,
                    venue TEXT,
                    agenda TEXT,
                    additional_notes TEXT,
                    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled')),
                    meeting_minutes_document TEXT,
                    scheduled_by INTEGER NOT NULL,
                    scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    completed_by INTEGER,
                    FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                    FOREIGN KEY (scheduled_by) REFERENCES users(id),
                    FOREIGN KEY (completed_by) REFERENCES users(id),
                    UNIQUE(tender_id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Check if meeting already exists for this tender
        const existingMeeting = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM pre_bid_meetings WHERE tender_id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingMeeting) {
            // Update existing meeting
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE pre_bid_meetings SET 
                     meeting_date = ?, meeting_time = ?, location = ?, venue = ?, 
                     agenda = ?, additional_notes = ?, scheduled_by = ?, 
                     scheduled_at = CURRENT_TIMESTAMP, status = 'scheduled'
                     WHERE tender_id = ?`,
                    [meetingDate, meetingTime, location, venue, agenda, additionalNotes, user.id, tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        } else {
            // Create new meeting
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO pre_bid_meetings 
                     (tender_id, meeting_date, meeting_time, location, venue, agenda, additional_notes, scheduled_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [tenderId, meetingDate, meetingTime, location, venue, agenda, additionalNotes, user.id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        console.log('Fetching suppliers for email notifications...');
        
        // Get all registered suppliers
        const suppliers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT s.id, s.username, s.business_email, bp.business_name, bp.contact_person_name
                 FROM suppliers s
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE s.status = 'approved' AND s.business_email IS NOT NULL`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('Database error fetching suppliers:', err);
                        reject(err);
                    } else {
                        console.log(`Found ${rows.length} suppliers for email notifications`);
                        console.log('Suppliers:', rows.map(s => ({ name: s.business_name || s.username, email: s.business_email })));
                        resolve(rows);
                    }
                }
            );
        });

        if (suppliers.length === 0) {
            console.log('Warning: No approved suppliers with email addresses found');
        }

        console.log('Starting email notification distribution...');
        
        // Send email notifications to all suppliers
        const emailService = new EmailService();
        let emailsSent = 0;
        let emailsFailed = 0;
        const failedEmails = [];

        for (const supplier of suppliers) {
            try {
                console.log(`Sending pre-bid meeting notification to: ${supplier.business_email}`);
                
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
                console.log(`Email sent successfully to: ${supplier.business_email}`);
                
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

        console.log('Email notification distribution completed:', {
            totalSuppliers: suppliers.length,
            emailsSent,
            emailsFailed
        });

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
    const db = getDatabase();
    const user = req.user;

    // Check if user is from purchase department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canView) {
        return res.status(403).json({ message: 'You do not have permission to view pre-bid meetings' });
    }

    try {
        const meetings = await new Promise((resolve, reject) => {
            db.all(
                `SELECT pbm.*, dt.tender_number, d.item_name as tender_title, d.description as tender_description,
                        u.name as scheduled_by_name, cu.name as completed_by_name
                 FROM pre_bid_meetings pbm
                 JOIN demand_tenders dt ON pbm.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON pbm.scheduled_by = u.id
                 LEFT JOIN users cu ON pbm.completed_by = cu.id
                 ORDER BY pbm.meeting_date DESC, pbm.meeting_time DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Categorize meetings by status and date
        const now = new Date();
        const pakistanTime = new Date(now.getTime() + (5 * 60 * 60 * 1000)); // UTC+5
        const todayDate = pakistanTime.toISOString().split('T')[0];

        const categorizedMeetings = {
            upcoming: [],
            today: [],
            past_incomplete: [],
            completed: [],
            cancelled: []
        };

        meetings.forEach(meeting => {
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
    const db = getDatabase();
    const { meetingId } = req.params;
    const user = req.user;

    console.log('Upload meeting minutes request:', {
        meetingId,
        userId: user.id,
        hasFile: !!req.file,
        fileDetails: req.file ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            path: req.file.path
        } : null
    });

    // Check if user is from purchase department
    const canUpload = user.role === 'superadmin' || 
                     (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canUpload) {
        console.log('Upload rejected: User does not have permission');
        return res.status(403).json({ message: 'Only purchase department members can upload meeting minutes' });
    }

    if (!req.file) {
        console.log('Upload rejected: No file provided');
        return res.status(400).json({ message: 'Meeting minutes document is required' });
    }

    try {
        console.log('Fetching meeting details for ID:', meetingId);
        
        // Get meeting details
        const meeting = await new Promise((resolve, reject) => {
            db.get(
                `SELECT pbm.*, dt.tender_number, d.item_name as tender_title
                 FROM pre_bid_meetings pbm
                 JOIN demand_tenders dt ON pbm.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE pbm.id = ?`,
                [meetingId],
                (err, row) => {
                    if (err) {
                        console.error('Database error fetching meeting:', err);
                        reject(err);
                    } else {
                        console.log('Meeting found:', row);
                        resolve(row);
                    }
                }
            );
        });

        if (!meeting) {
            console.log('Meeting not found for ID:', meetingId);
            return res.status(404).json({ message: 'Pre-bid meeting not found' });
        }

        // Check if meeting date has passed
        const now = new Date();
        const pakistanTime = new Date(now.getTime() + (5 * 60 * 60 * 1000)); // UTC+5
        const todayDate = pakistanTime.toISOString().split('T')[0];
        
        console.log('Date check:', {
            meetingDate: meeting.meeting_date,
            todayDate: todayDate,
            canUpload: meeting.meeting_date <= todayDate
        });
        
        if (meeting.meeting_date > todayDate) {
            console.log('Upload rejected: Meeting date is in future');
            return res.status(400).json({ message: 'Cannot upload minutes for future meetings' });
        }

        console.log('Updating meeting with minutes document...');
        
        // Update meeting with minutes document
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE pre_bid_meetings SET 
                 minutes_file_path = ?, minutes_original_name = ?, status = 'completed', 
                 completed_at = CURRENT_TIMESTAMP, completed_by = ?
                 WHERE id = ?`,
                [req.file.path, req.file.originalname, user.id, meetingId],
                (err) => {
                    if (err) {
                        console.error('Database error updating meeting:', err);
                        reject(err);
                    } else {
                        console.log('Meeting updated successfully');
                        resolve();
                    }
                }
            );
        });

        console.log('Fetching suppliers for email distribution...');
        
        // Get all registered suppliers to send the minutes
        const suppliers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT s.id, s.username, s.business_email, bp.business_name, bp.contact_person_name
                 FROM suppliers s
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE s.status = 'approved' AND s.business_email IS NOT NULL`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('Database error fetching suppliers:', err);
                        reject(err);
                    } else {
                        console.log(`Found ${rows.length} suppliers for email distribution`);
                        resolve(rows);
                    }
                }
            );
        });

        if (suppliers.length === 0) {
            console.log('Warning: No suppliers found for email distribution');
        }

        // Send meeting minutes to all suppliers
        const emailService = new EmailService();
        let emailsSent = 0;
        let emailsFailed = 0;
        const failedEmails = [];

        console.log('Reading uploaded file for email attachment...');
        
        // Read the uploaded file for email attachment
        const minutesBuffer = fs.readFileSync(req.file.path);
        console.log(`File read successfully, size: ${minutesBuffer.length} bytes`);

        console.log('Starting email distribution...');
        
        for (const supplier of suppliers) {
            try {
                console.log(`Sending email to: ${supplier.business_email}`);
                
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
                console.log(`Email sent successfully to: ${supplier.business_email}`);
                
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

        console.log('Email distribution completed:', {
            totalSuppliers: suppliers.length,
            emailsSent,
            emailsFailed
        });

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
    const db = getDatabase();
    const { meetingId } = req.params;
    const user = req.user;

    // Check if user is from purchase department
    const canDownload = user.role === 'superadmin' || 
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canDownload) {
        return res.status(403).json({ message: 'You do not have permission to download meeting minutes' });
    }

    try {
        const meeting = await new Promise((resolve, reject) => {
            db.get(
                'SELECT minutes_file_path, minutes_original_name FROM pre_bid_meetings WHERE id = ?',
                [meetingId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

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
    const db = getDatabase();
    const { meetingId } = req.params;
    const { cancellationReason } = req.body;
    const user = req.user;

    // Check if user is from purchase department
    const canCancel = user.role === 'superadmin' || 
                     (user.department_name && user.department_name.toLowerCase() === 'purchase');

    if (!canCancel) {
        return res.status(403).json({ message: 'Only purchase department members can cancel pre-bid meetings' });
    }

    try {
        // Get meeting details
        const meeting = await new Promise((resolve, reject) => {
            db.get(
                `SELECT pbm.*, dt.tender_number, d.item_name as tender_title
                 FROM pre_bid_meetings pbm
                 JOIN demand_tenders dt ON pbm.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE pbm.id = ? AND pbm.status = 'scheduled'`,
                [meetingId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!meeting) {
            return res.status(404).json({ message: 'Scheduled meeting not found' });
        }

        // Update meeting status to cancelled
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE pre_bid_meetings SET 
                 status = 'cancelled', additional_notes = ?
                 WHERE id = ?`,
                [cancellationReason || 'Meeting cancelled', meetingId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Get all registered suppliers
        const suppliers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT s.id, s.username, s.business_email, bp.business_name, bp.contact_person_name
                 FROM suppliers s
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE s.status = 'approved' AND s.business_email IS NOT NULL`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

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

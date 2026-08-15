const express = require('express');
const router = express.Router();
const EmailService = require('../utils/emailService');
const { authenticateToken } = require('../middleware/auth');

// Test email functionality
router.post('/test-email', authenticateToken, async (req, res) => {
    const { email, subject, message } = req.body;
    
    if (!email) {
        return res.status(400).json({ message: 'Email address is required' });
    }
    
    try {
        const emailService = new EmailService();
        
        // Test basic email sending
        const testSubject = subject || 'RIC E-Tender System - Test Email';
        const testMessage = message || 'This is a test email from the RIC E-Tender System to verify email functionality.';
        
        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'RIC E-Tender System',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: email,
            subject: testSubject,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
                        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 8px; }
                        .header { background-color: #00509e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { padding: 20px; }
                        .footer { background-color: #f8f8f8; padding: 15px; text-align: center; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🧪 Test Email</h1>
                        </div>
                        <div class="content">
                            <h2>Email Test Successful!</h2>
                            <p>${testMessage}</p>
                            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                            <p><strong>System:</strong> RIC E-Tender System</p>
                        </div>
                        <div class="footer">
                            <p>This is an automated test email from the RIC E-Tender System.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
        
        console.log('Sending test email to:', email);
        const info = await emailService.transporter.sendMail(mailOptions);
        
        console.log('Test email sent successfully:', info.messageId);
        
        res.json({
            success: true,
            message: 'Test email sent successfully',
            messageId: info.messageId,
            recipient: email,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Test email failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test email',
            error: error.message,
            details: {
                code: error.code,
                command: error.command,
                response: error.response
            }
        });
    }
});

// Test pre-bid meeting notification email
router.post('/test-prebid-email', authenticateToken, async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ message: 'Email address is required' });
    }
    
    try {
        const emailService = new EmailService();
        
        // Test pre-bid meeting notification
        await emailService.sendPreBidMeetingNotification(
            email,
            'Test Company',
            'Test Contact Person',
            {
                tender_id: 999,
                tender_number: 'TEST-001',
                tender_title: 'Test Tender Item',
                tender_description: 'This is a test tender for email verification',
                meeting_date: '2025-08-20',
                meeting_time: '14:00',
                location: 'Test Conference Room',
                venue: 'Test Venue',
                agenda: 'Test agenda for pre-bid meeting',
                additional_notes: 'This is a test email'
            }
        );
        
        res.json({
            success: true,
            message: 'Pre-bid meeting test email sent successfully',
            recipient: email,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Pre-bid test email failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send pre-bid meeting test email',
            error: error.message
        });
    }
});

module.exports = router;

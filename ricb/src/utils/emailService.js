const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    }

    async sendSupplierApprovalEmail(supplierEmail, companyName) {
        const htmlContent = this.generateApprovalEmailHTML(companyName);

        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'RIC E-Tender System',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: 'Congratulations! Your Supplier Application Has Been Approved',
            html: htmlContent
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Approval email sent successfully to:', supplierEmail);
            console.log('Message ID:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Error sending approval email:', error);
            throw error;
        }
    }

    generateApprovalEmailHTML(companyName) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Supplier Application Approved</title>
                <style>
                    /* Reset */
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background-color: #f2f2f2;
                        color: #333333;
                        line-height: 1.6;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 40px auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                        overflow: hidden;
                    }
                    /* Colors: Primary (#00509e) and Accent (#f2a900) */
                    :root {
                        --primary: #00509e;
                        --accent: #f2a900;
                    }
                    .header {
                        background-color: var(--primary);
                        color: #ffffff;
                        padding: 30px;
                        text-align: center;
                    }
                    .header h1 {
                        font-size: 24px;
                        margin-bottom: 8px;
                        font-weight: 700;
                    }
                    .header p {
                        font-size: 16px;
                        opacity: 0.9;
                    }
                    .content {
                        padding: 30px;
                    }
                    .content p {
                        margin-bottom: 20px;
                        font-size: 16px;
                    }
                    .highlight {
                        background-color: var(--accent);
                        color: #ffffff;
                        padding: 20px;
                        border-radius: 4px;
                        text-align: center;
                        margin: 30px 0;
                    }
                    .next-steps {
                        margin: 30px 0;
                    }
                    .next-steps h3 {
                        font-size: 18px;
                        color: var(--primary);
                        margin-bottom: 12px;
                    }
                    .next-steps ul {
                        list-style: none;
                        padding-left: 0;
                    }
                    .next-steps li {
                        position: relative;
                        padding-left: 24px;
                        margin-bottom: 12px;
                        font-size: 15px;
                    }
                    .next-steps li::before {
                        content: '✓';
                        position: absolute;
                        left: 0;
                        top: 0;
                        color: var(--accent);
                        font-weight: bold;
                    }
                    .button-container {
                        text-align: center;
                        margin: 30px 0;
                    }
                    .cta-button {
                        display: inline-block;
                        background-color: var(--primary);
                        color: #ffffff;
                        text-decoration: none;
                        padding: 14px 28px;
                        border-radius: 4px;
                        font-weight: 600;
                        transition: background-color 0.2s ease;
                    }
                    .cta-button:hover {
                        background-color: #003c6b;
                    }
                    .footer {
                        background-color: #fafafa;
                        padding: 20px 30px;
                        font-size: 13px;
                        color: #777777;
                        text-align: center;
                    }
                    .footer p {
                        margin-bottom: 6px;
                    }
                    @media (max-width: 600px) {
                        .email-container {
                            margin: 20px;
                        }
                        .header h1 {
                            font-size: 20px;
                        }
                        .content {
                            padding: 20px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="header">
                        <h1>Congratulations!</h1>
                        <p>Your supplier application has been approved</p>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${companyName}</strong> Team,</p>
                        <p>We are pleased to inform you that your supplier application has been <strong>approved</strong> by the Rawalpindi Institute of Cardiology Evaluation Committee.</p>
                        <div class="highlight">
                            <p><strong>Welcome to our Supplier Network!</strong><br>You can now participate in procurement opportunities.</p>
                        </div>
                        <div class="next-steps">
                            <h3>Next Steps:</h3>
                            <ul>
                                <li>Log in to your supplier dashboard</li>
                                <li>Complete your profile details</li>
                                <li>Explore active tenders</li>
                                <li>Submit your competitive bids</li>
                                <li>Ensure ongoing compliance</li>
                            </ul>
                        </div>
                        <div class="button-container">
                            <a href="${process.env.COMPANY_WEBSITE || '#'}" class="cta-button">Access Your Dashboard</a>
                        </div>
                        <p>If you need assistance, please contact our Purchasing Team at <a href="mailto:${process.env.EMAIL_FROM_EMAIL || 'procurement@ric.edu.pk'}">${process.env.EMAIL_FROM_EMAIL || 'procurement@ric.edu.pk'}</a>.</p>
                        <p>Thank you for partnering with us.</p>
                        <p><strong>Best regards,</strong><br>Procurement Team<br>Rawalpindi Institute of Cardiology</p>
                    </div>
                    <div class="footer">
                        <p>Rawalpindi Institute of Cardiology | Rawalpindi, Pakistan</p>
                        <p>Email: ${process.env.EMAIL_FROM_EMAIL || 'procurement@ric.edu.pk'} | Website: ${process.env.COMPANY_WEBSITE || 'www.ric.edu.pk'}</p>
                        <p style="font-size:12px;opacity:0.6;">This is an automated message. Please do not reply.</p>
                        <p style="font-size:11px;opacity:0.6;">© ${new Date().getFullYear()} Rawalpindi Institute of Cardiology. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    async sendSupplyOrderEmail(supplierEmail, companyName, orderData, pdfBuffer) {
        const htmlContent = this.generateSupplyOrderEmailHTML(companyName, orderData);
        const orderNumber = `SO-${orderData.tender_id}-${Date.now()}`;

        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'RIC E-Tender System',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: `Congratulations! Supply Order Awarded - ${orderNumber}`,
            html: htmlContent,
            attachments: [
                {
                    filename: `Supply_Order_${orderNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Supply order email sent successfully to:', supplierEmail);
            console.log('Message ID:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Error sending supply order email:', error);
            throw error;
        }
    }

    generateSupplyOrderEmailHTML(companyName, orderData) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const orderNumber = `SO-${orderData.tender_id}-${Date.now()}`;

        return `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supply Order Awarded</title>
    <style>
        /* Reset */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f2f2f2;
            color: #333333;
            line-height: 1.6;
        }
        .email-container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        /* Colors: Primary (#00509e) and Accent (#f2a900) */
        :root { --primary: #00509e; --accent: #f2a900; }
        .header {
            background-color: var(--primary);
            color: #ffffff;
            text-align: center;
            padding: 30px;
        }
        .header h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header p {
            font-size: 16px;
            opacity: 0.9;
        }
        .content { padding: 30px; }
        .badge {
            display: inline-block;
            background-color: var(--accent);
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        .greeting { font-size: 18px; margin-bottom: 20px; color: #374151; }
        .message { font-size: 16px; color: #555555; margin-bottom: 30px; line-height: 1.7; }
        .order-details {
            background-color: #f9fafb;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 25px;
        }
        .order-details h3 {
            font-size: 18px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 15px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-weight: 600; color: #374151; }
        .detail-value { color: #555555; }
        .amount { font-size: 20px; font-weight: 700; color: var(--accent); }
        .attachment {
            background-color: #fff4e5;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 15px;
            text-align: center;
            margin-bottom: 25px;
            font-weight: 600;
            color: #92400e;
        }
        .next-steps {
            background-color: #eef6ff;
            border-left: 4px solid var(--primary);
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 25px;
        }
        .next-steps h3 {
            font-size: 18px;
            color: var(--primary);
            margin-bottom: 12px;
            font-weight: 600;
        }
        .next-steps ul {
            list-style: none;
            padding-left: 0;
        }
        .next-steps li {
            position: relative;
            padding-left: 24px;
            margin-bottom: 10px;
            color: #374151;
        }
        .next-steps li::before {
            content: '✓';
            position: absolute;
            left: 0;
            top: 0;
            color: var(--accent);
            font-weight: bold;
        }
        .contact {
            background-color: #fafafa;
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 30px;
            text-align: left;
            font-size: 15px;
        }
        .contact h4 {
            font-size: 16px;
            color: var(--primary);
            margin-bottom: 10px;
            font-weight: 600;
        }
        .contact p {
            margin: 4px 0;
            color: #555555;
        }
        .footer {
            background-color: #fafafa;
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #777777;
        }
        .footer p { margin-bottom: 6px; }
        @media (max-width: 600px) {
            .email-container { margin: 20px; }
            .header h1 { font-size: 20px; }
            .content { padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Supply Order Awarded!</h1>
            <p>Rawalpindi Institute of Cardiology</p>
        </div>
        <div class="content">
            <div class="badge">ORDER AWARDED</div>
            <div class="greeting">Dear <strong>${companyName}</strong> Team,</div>
            <div class="message">
                Congratulations! Your bid has been selected for the supply order. Your competitive pricing and commitment to quality make you our preferred supplier for this requirement.
            </div>
            <div class="order-details">
                <h3>📋 Order Summary</h3>
                <div class="detail-row"><span class="detail-label">Order Number:</span><span class="detail-value">${orderNumber}</span></div>
                <div class="detail-row"><span class="detail-label">Order Date:</span><span class="detail-value">${currentDate}</span></div>
                <div class="detail-row"><span class="detail-label">Item:</span><span class="detail-value">${orderData.item_name}</span></div>
                <div class="detail-row"><span class="detail-label">Quantity:</span><span class="detail-value">${orderData.quantity}</span></div>
                <div class="detail-row"><span class="detail-label">Delivery Timeline:</span><span class="detail-value">${orderData.delivery_time_days} days</span></div>
                <div class="detail-row"><span class="detail-label">Award Amount:</span><span class="detail-value amount">PKR ${(orderData.awarded_bid_amount || 0).toLocaleString()}</span></div>
            </div>
            <div class="attachment">📎 Detailed supply order document is attached to this email</div>
            <div class="next-steps">
                <h3>📌 Next Steps</h3>
                <ul>
                    <li>Review the attached supply order document carefully</li>
                    <li>Confirm order acceptance within 48 hours</li>
                    <li>Begin procurement and preparation for delivery</li>
                    <li>Ensure delivery within ${orderData.delivery_time_days} days as committed</li>
                    <li>Contact us for any clarifications or special requirements</li>
                </ul>
            </div>
            <div class="contact">
                <h4>📞 Contact Information</h4>
                <p><strong>Purchase Department</strong></p>
                <p>Email: purchase@ric.edu.pk</p>
                <p>Phone: +92-XXX-XXXXXXX</p>
                <p>Office Hours: Monday - Friday, 9:00 AM - 5:00 PM</p>
            </div>
            <div class="message">
                We look forward to a successful partnership and timely delivery of the ordered items. Thank you for participating in our tender process.
            </div>
        </div>
        <div class="footer">
            <p><strong>Rawalpindi Institute of Cardiology</strong></p>
            <p>RIC e-Tender System | Automated Message</p>
            <p>This email was sent on ${currentDate}</p>
            <p>Please do not reply to this automated email. For inquiries, contact our Purchase Department.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    // Test email connectivity
    async testConnection() {
        try {
            await this.transporter.verify();
            console.log('Email service is ready to send emails');
            return true;
        } catch (error) {
            console.error('Email service configuration error:', error);
            return false;
        }
    }

    // Send grievance meeting notification email
    async sendGrievanceMeetingNotification(supplierEmail, companyName, itemName, meetingDate, meetingTime, meetingLocation, meetingDetails) {
        const htmlContent = this.generateGrievanceMeetingEmailHTML(companyName, itemName, meetingDate, meetingTime, meetingLocation, meetingDetails);

        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: `Grievance Meeting Scheduled - ${itemName}`,
            html: htmlContent
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Grievance meeting notification sent successfully to:', supplierEmail);
            console.log('Message ID:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Error sending grievance meeting notification:', error);
            throw error;
        }
    }

    generateGrievanceMeetingEmailHTML(companyName, itemName, meetingDate, meetingTime, meetingLocation, meetingDetails) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grievance Meeting Scheduled</title>
    <style>
        /* Reset */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f2f2f2;
            color: #333333;
            line-height: 1.6;
        }
        .email-container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        /* Colors: Primary (#00509e) and Accent (#f2a900) */
        :root { --primary: #00509e; --accent: #f2a900; }
        .header {
            background-color: var(--primary);
            color: #ffffff;
            text-align: center;
            padding: 30px;
        }
        .header h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header p {
            font-size: 16px;
            opacity: 0.9;
        }
        .badge {
            display: inline-block;
            background-color: var(--accent);
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            margin-bottom: 15px;
        }
        .content { padding: 30px; }
        .content p { margin-bottom: 20px; font-size: 16px; }
        .company-name { color: var(--accent); font-weight: 700; }
        .message { color: #555555; line-height: 1.7; }
        .item-info {
            background-color: #f9fafb;
            border-left: 4px solid var(--primary);
            border-radius: 4px;
            padding: 20px;
            margin: 25px 0;
        }
        .item-info h4 {
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 10px;
        }
        .meeting-details {
            background-color: #eef6ff;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin: 25px 0;
        }
        .meeting-details h3 {
            font-size: 18px;
            color: var(--primary);
            font-weight: 600;
            margin-bottom: 12px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-weight: 600; color: #374151; }
        .detail-value { color: #555555; text-align: right; }
        .instructions {
            background-color: #fff4e5;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin: 30px 0;
        }
        .instructions h3 {
            font-size: 18px;
            color: var(--primary);
            margin-bottom: 12px;
            font-weight: 600;
        }
        .instructions ul { list-style: none; padding-left: 0; }
        .instructions li {
            position: relative;
            padding-left: 24px;
            margin-bottom: 10px;
            color: #374151;
        }
        .instructions li::before {
            content: '⚠️';
            position: absolute;
            left: 0;
            top: 0;
            font-size: 16px;
        }
        .contact {
            background-color: #fafafa;
            border-radius: 4px;
            padding: 20px;
            margin: 30px 0;
            font-size: 15px;
        }
        .contact h4 {
            font-size: 16px;
            color: var(--primary);
            margin-bottom: 10px;
            font-weight: 600;
        }
        .contact p { margin: 4px 0; color: #555555; }
        .footer {
            background-color: #fafafa;
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #777777;
        }
        .footer p { margin-bottom: 6px; }
        @media (max-width: 600px) {
            .email-container { margin: 20px; }
            .header h1 { font-size: 20px; }
            .content { padding: 20px; }
            .detail-row { flex-direction: column; align-items: flex-start; }
            .detail-value { text-align: left; margin-top: 5px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="badge">MEETING SCHEDULED</div>
            <h1>Grievance Meeting Scheduled</h1>
            <p>Your grievance application has been reviewed</p>
        </div>
        <div class="content">
            <p>Dear <span class="company-name">${companyName}</span> Team,</p>
            <p class="message">Your grievance application has been reviewed by the <strong>Grievance Committee</strong>. We have scheduled a meeting to discuss your concerns regarding the technical evaluation decision.</p>
            <div class="item-info">
                <h4>📦 Regarding Item:</h4>
                <p><strong>${itemName}</strong></p>
            </div>
            <div class="meeting-details">
                <h3>📋 Meeting Details</h3>
                <div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${meetingDate}</span></div>
                <div class="detail-row"><span class="detail-label">Time:</span><span class="detail-value">${meetingTime}</span></div>
                <div class="detail-row"><span class="detail-label">Location:</span><span class="detail-value">${meetingLocation}</span></div>
                ${meetingDetails ? `<div style="margin-top:12px;"><p style="font-weight:600;color:#374151;">Additional Details:</p><p style="color:#555555;">${meetingDetails}</p></div>` : ''}
            </div>
            <div class="instructions">
                <h3>⚠️ Important Instructions</h3>
                <ul>
                    <li>Please confirm your attendance by responding to this email</li>
                    <li>Bring all relevant documentation and evidence to support your case</li>
                    <li>Arrive 15 minutes before the scheduled time</li>
                    <li>If you cannot attend, contact us immediately to reschedule</li>
                    <li>Be prepared to present your grievance clearly and concisely</li>
                </ul>
            </div>
            <div class="contact">
                <h4>📞 Contact Information</h4>
                <p><strong>Grievance Committee Secretary</strong></p>
                <p>Email: grievance@ric.edu.pk</p>
                <p>Phone: +92-XXX-XXXXXXX</p>
            </div>
            <p class="message">We are committed to ensuring a fair and transparent grievance process. Your concerns will be thoroughly reviewed during the meeting.</p>
            <p><strong>Best regards,</strong><br>The Grievance Committee<br>Rawalpindi Institute of Cardiology</p>
        </div>
        <div class="footer">
            <p><strong>Grievance Committee</strong></p>
            <p>Rawalpindi Institute of Cardiology</p>
            <p>Email: grievance@ric.edu.pk | Phone: +92-XXX-XXXXXXX</p>
            <p style="font-size:12px;opacity:0.6;">This is an automated message regarding your grievance application.</p>
            <p style="font-size:11px;opacity:0.6;">© ${new Date().getFullYear()} Rawalpindi Institute of Cardiology. All rights reserved.</p>
            <p style="font-size:11px;opacity:0.6;">Sent on ${currentDate}</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    // Send grievance approval email
    async sendGrievanceApprovalEmail(supplierEmail, companyName, itemName, contactPerson) {
        const htmlContent = this.generateGrievanceApprovalEmailHTML(companyName, itemName, contactPerson);

        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: `✅ Grievance Approved - ${itemName}`,
            html: htmlContent
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Grievance approval notification sent successfully to:', supplierEmail);
            console.log('Message ID:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Error sending grievance approval notification:', error);
            throw error;
        }
    }

    generateGrievanceApprovalEmailHTML(companyName, itemName, contactPerson) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grievance Approved</title>
    <style>
        /* Reset */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f2f2f2;
            color: #333333;
            line-height: 1.6;
        }
        .email-container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        /* Colors: Primary (#00509e) and Accent (#f2a900) */
        :root { --primary: #00509e; --accent: #f2a900; }
        .header {
            background-color: var(--primary);
            color: #ffffff;
            text-align: center;
            padding: 30px;
        }
        .header h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header p {
            font-size: 16px;
            opacity: 0.9;
        }
        .badge {
            display: inline-block;
            background-color: var(--accent);
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            margin-bottom: 15px;
        }
        .content { padding: 30px; }
        .content p { margin-bottom: 20px; font-size: 16px; }
        .company-name { color: var(--accent); font-weight: 700; }
        .message { color: #555555; line-height: 1.7; }
        .item-info {
            background-color: #f9fafb;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin: 25px 0;
        }
        .item-info h4 {
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 10px;
        }
        .item-info p { color: #555555; }
        .next-steps {
            background-color: #eef6ff;
            border-left: 4px solid var(--primary);
            border-radius: 4px;
            padding: 20px;
            margin: 30px 0;
        }
        .next-steps h4 {
            font-size: 18px;
            color: var(--primary);
            margin-bottom: 12px;
            font-weight: 600;
        }
        .next-steps ul {
            list-style: none;
            padding-left: 0;
            color: #374151;
        }
        .next-steps li {
            margin-bottom: 8px;
            padding-left: 24px;
            position: relative;
        }
        .next-steps li::before {
            content: '✓';
            position: absolute;
            left: 0;
            color: var(--accent);
            font-weight: bold;
        }
        .contact {
            background-color: #fafafa;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin: 30px 0;
            font-size: 15px;
        }
        .contact h4 {
            font-size: 16px;
            color: var(--primary);
            margin-bottom: 10px;
            font-weight: 600;
        }
        .contact p { margin: 4px 0; color: #555555; }
        .footer {
            background-color: #fafafa;
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #777777;
        }
        .footer p { margin-bottom: 6px; }
        @media (max-width: 600px) {
            .email-container { margin: 20px; }
            .header h1 { font-size: 20px; }
            .content { padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="badge">GRIEVANCE APPROVED</div>
            <h1>Congratulations!</h1>
            <p>Your grievance has been approved by the committee</p>
        </div>
        <div class="content">
            <p>Dear <span class="company-name">${companyName}</span> Team,</p>
            <p class="message">We are pleased to inform you that your grievance application has been <strong>approved</strong> by the Grievance Committee after thorough review and consideration.</p>
            <div class="item-info">
                <h4>📦 Approved Item</h4>
                <p><strong>${itemName}</strong></p>
                <p style="margin-top:8px; font-size:14px; color:#374151;">Your company has been added to the temporary approval pool for this item.</p>
            </div>
            <div class="next-steps">
                <h4>📋 Next Steps</h4>
                <ul>
                    <li>Your company is now eligible for consideration in the tender process for this item</li>
                    <li>You will be included in the temporary approval pool for relevant tenders</li>
                    <li>Please monitor your email for future tender notifications</li>
                    <li>Ensure all your company documentation remains up to date</li>
                </ul>
            </div>
            <div class="contact">
                <h4>📞 Contact Information</h4>
                <p>If you have any questions regarding this decision, please contact:</p>
                <p><strong>Grievance Committee Secretary</strong></p>
                <p>Email: grievance@ric.edu.pk</p>
                <p>Phone: +92-XXX-XXXXXXX</p>
            </div>
            <p class="message">Thank you for your patience during the grievance review process. We look forward to your continued participation in our tender processes.</p>
            <p><strong>Best regards,</strong><br>The Grievance Committee<br>Rawalpindi Institute of Cardiology</p>
        </div>
        <div class="footer">
            <p><strong>Grievance Committee</strong></p>
            <p>Rawalpindi Institute of Cardiology</p>
            <p>Email: grievance@ric.edu.pk | Phone: +92-XXX-XXXXXXX</p>
            <p style="font-size:12px;opacity:0.6;">This is an automated message regarding your grievance application.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    // Send grievance rejection email
    async sendGrievanceRejectionEmail(supplierEmail, companyName, itemName, rejectionReason, contactPerson) {
        const htmlContent = this.generateGrievanceRejectionEmailHTML(companyName, itemName, rejectionReason, contactPerson);

        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: `Grievance Decision - ${itemName}`,
            html: htmlContent
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Grievance rejection notification sent successfully to:', supplierEmail);
            console.log('Message ID:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Error sending grievance rejection notification:', error);
            throw error;
        }
    }

    generateGrievanceRejectionEmailHTML(companyName, itemName, rejectionReason, contactPerson) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grievance Decision</title>
    <style>
        /* Reset */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f2f2f2;
            color: #333333;
            line-height: 1.6;
        }
        .email-container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        /* Colors: Primary (#00509e) and Accent (#f2a900) */
        :root { --primary: #00509e; --accent: #f2a900; }
        .header {
            background-color: var(--primary);
            color: #ffffff;
            text-align: center;
            padding: 30px;
        }
        .header h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header p {
            font-size: 16px;
            opacity: 0.9;
        }
        .badge {
            display: inline-block;
            background-color: var(--accent);
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            margin-bottom: 15px;
        }
        .content { padding: 30px; }
        .content p { margin-bottom: 20px; font-size: 16px; }
        .company-name { color: var(--accent); font-weight: 700; }
        .message { color: #555555; line-height: 1.7; }
        .item-info {
            background-color: #f9fafb;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin: 25px 0;
        }
        .item-info h4 {
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 10px;
        }
        .item-info p { color: #555555; }
        .reason-details {
            background-color: #eef6ff;
            border-left: 4px solid var(--primary);
            border-radius: 4px;
            padding: 20px;
            margin: 30px 0;
        }
        .reason-details h4 {
            font-size: 18px;
            color: var(--primary);
            margin-bottom: 12px;
            font-weight: 600;
        }
        .reason-text {
            background-color: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            padding: 15px;
            color: #555555;
            font-style: italic;
        }
        .next-steps {
            background-color: #eef6ff;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin: 30px 0;
        }
        .next-steps h4 {
            font-size: 18px;
            color: var(--accent);
            margin-bottom: 12px;
            font-weight: 600;
        }
        .next-steps ul { list-style: none; padding-left: 0; color: #374151; }
        .next-steps li { margin-bottom: 8px; padding-left: 24px; position: relative; }
        .next-steps li::before {
            content: '✓';
            position: absolute;
            left: 0;
            color: var(--accent);
            font-weight: bold;
        }
        .contact {
            background-color: #fafafa;
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 20px;
            margin: 30px 0;
            font-size: 15px;
        }
        .contact h4 {
            font-size: 16px;
            color: var(--primary);
            margin-bottom: 10px;
            font-weight: 600;
        }
        .contact p { margin: 4px 0; color: #555555; }
        .footer {
            background-color: #fafafa;
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #777777;
        }
        .footer p { margin-bottom: 6px; }
        @media (max-width: 600px) {
            .email-container { margin: 20px; }
            .header h1 { font-size: 20px; }
            .content { padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="badge">GRIEVANCE DECISION</div>
            <h1>Grievance Review Complete</h1>
            <p>Your grievance application has been reviewed</p>
        </div>
        <div class="content">
            <p>Dear <span class="company-name">${companyName}</span> Team,</p>
            <p class="message">We have completed our thorough review of your grievance application. After careful consideration by the Grievance Committee, we regret to inform you that your grievance has been <strong>rejected</strong>.</p>
            <div class="item-info">
                <h4>📦 Regarding Item</h4>
                <p><strong>${itemName}</strong></p>
            </div>
            <div class="reason-details">
                <h4>📝 Committee Decision</h4>
                <div class="reason-text">
                    ${rejectionReason}
                </div>
            </div>
            <div class="next-steps">
                <h4>📋 Next Steps</h4>
                <ul>
                    <li>You may address the concerns raised and apply for future tenders</li>
                    <li>Consider improving your technical specifications or documentation</li>
                    <li>Contact us if you need clarification on the decision</li>
                    <li>Monitor our portal for new tender opportunities</li>
                </ul>
            </div>
            <div class="contact">
                <h4>📞 Contact Information</h4>
                <p>If you have any questions regarding this decision, please contact:</p>
                <p><strong>Grievance Committee Secretary</strong></p>
                <p>Email: grievance@ric.edu.pk</p>
                <p>Phone: +92-XXX-XXXXXXX</p>
            </div>
            <p class="message">We appreciate your understanding and encourage you to continue participating in our tender processes. We are committed to maintaining fairness and transparency in all our evaluations.</p>
            <p><strong>Best regards,</strong><br>The Grievance Committee<br>Rawalpindi Institute of Cardiology</p>
        </div>
        <div class="footer">
            <p><strong>Grievance Committee</strong></p>
            <p>Rawalpindi Institute of Cardiology</p>
            <p>Email: grievance@ric.edu.pk | Phone: +92-XXX-XXXXXXX</p>
            <p style="font-size:12px;opacity:0.6;">This is an automated message regarding your grievance application.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    // Send technical evaluation rejection email
    async sendTechnicalEvaluationRejectionEmail(supplierEmail, companyName, itemName, rejectionReason, contactPerson) {
        const htmlContent = this.generateTechnicalEvaluationRejectionEmailHTML(companyName, itemName, rejectionReason, contactPerson);

        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'RIC Technical Evaluation Committee',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: `Technical Evaluation Result - ${itemName}`,
            html: htmlContent
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Technical evaluation rejection email sent successfully to:', supplierEmail);
            console.log('Message ID:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Error sending technical evaluation rejection email:', error);
            throw error;
        }
    }

    generateTechnicalEvaluationRejectionEmailHTML(companyName, itemName, rejectionReason, contactPerson) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Calculate the grievance deadline (3 days from now)
        const grievanceDeadline = new Date();
        grievanceDeadline.setDate(grievanceDeadline.getDate() + 3);
        const deadlineString = grievanceDeadline.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
        <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Technical Evaluation Result</title>
  <style>
    /* Reset */
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color:#f2f2f2;
      color:#333333;
      line-height:1.6;
    }
    .email-container {
      max-width:600px;
      margin:40px auto;
      background-color:#ffffff;
      border-radius:8px;
      box-shadow:0 2px 8px rgba(0,0,0,0.1);
      overflow:hidden;
    }
    /* Primary and Accent */
    :root { --primary:#00509e; --accent:#f2a900; }
    .header {
      background-color:var(--primary);
      color:#ffffff;
      text-align:center;
      padding:30px;
    }
    .header h1 {
      font-size:24px;
      font-weight:700;
      margin-bottom:8px;
    }
    .header p {
      font-size:16px;
      opacity:0.9;
    }
    .badge {
      display:inline-block;
      background-color:var(--accent);
      color:#ffffff;
      padding:8px 16px;
      border-radius:20px;
      font-weight:600;
      margin-bottom:15px;
    }
    .content { padding:30px; }
    .content p { margin-bottom:20px; font-size:16px; }
    .company-name { color:var(--accent); font-weight:700; }
    .message { color:#555555; line-height:1.7; }
    .item-info {
      background-color:#f9fafb;
      border-left:4px solid var(--accent);
      border-radius:4px;
      padding:20px;
      margin:25px 0;
    }
    .item-info h4 {
      font-size:16px;
      font-weight:600;
      color:#374151;
      margin-bottom:10px;
    }
    .item-info p { color:#555555; }
    .reason-details {
      background-color:#eef6ff;
      border-left:4px solid var(--primary);
      border-radius:4px;
      padding:20px;
      margin:30px 0;
    }
    .reason-details h4 {
      font-size:18px;
      color:var(--primary);
      font-weight:600;
      margin-bottom:12px;
    }
    .reason-text {
      background-color:#ffffff;
      border:1px solid #e5e7eb;
      border-radius:4px;
      padding:15px;
      color:#555555;
      font-style:italic;
    }
    .grievance-info {
      background-color:#eef6ff;
      border-left:4px solid var(--accent);
      border-radius:4px;
      padding:20px;
      margin:30px 0;
    }
    .grievance-info h4 {
      font-size:18px;
      color:var(--accent);
      font-weight:600;
      margin-bottom:12px;
    }
    .deadline {
      background-color:#fef3c7;
      border:2px solid var(--accent);
      border-radius:8px;
      padding:15px;
      text-align:center;
      margin:15px 0;
    }
    .deadline strong { color:#92400e; font-size:18px; }
    .steps-list {
      list-style:none;
      padding-left:0;
      margin:15px 0;
    }
    .steps-list li {
      position:relative;
      padding-left:24px;
      margin:10px 0;
      color:#1e40af;
    }
    .steps-list li::before {
      content:'👉';
      position:absolute;
      left:0;
      font-size:16px;
    }
    .warning-box {
      background-color:#fef2f2;
      border:2px solid #fca5a5;
      border-radius:8px;
      padding:20px;
      margin:20px 0;
      text-align:center;
    }
    .warning-box h5 { color:#dc2626; margin-bottom:10px; font-size:16px; }
    .warning-box p { color:#991b1b; font-size:14px; }
    .contact-info {
      background-color:#f0fdf4;
      border-left:4px solid #16a34a;
      border-radius:4px;
      padding:20px;
      margin:30px 0;
    }
    .contact-info h4 {
      font-size:18px;
      color:#15803d;
      font-weight:600;
      margin-bottom:12px;
    }
    .contact-info p { margin:4px 0; color:#555555; }
    .footer {
      background-color:#fafafa;
      text-align:center;
      padding:20px;
      font-size:13px;
      color:#777777;
    }
    .footer p { margin-bottom:6px; }
    @media (max-width:600px) {
      .email-container { margin:20px; }
      .header h1 { font-size:20px; }
      .content { padding:20px; }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <div class="badge">📋 TECHNICAL EVALUATION RESULT</div>
      <h1>Technical Evaluation Complete</h1>
      <p>Your bid has been technically evaluated</p>
    </div>
    <div class="content">
      <p>Dear <span class="company-name">${companyName}</span> Team,</p>
      <p class="message">We have completed the technical evaluation of your bid submission. After careful review by our <strong>Technical Evaluation Committee</strong>, we regret to inform you that your bid has been <strong>rejected</strong> during the technical evaluation phase.</p>
      <div class="item-info">
        <h4>📦 Evaluated Item</h4>
        <p><strong>${itemName}</strong></p>
      </div>
      <div class="reason-details">
        <h4>📝 Rejection Reason</h4>
        <div class="reason-text">${rejectionReason}</div>
      </div>
      <div class="grievance-info">
        <h4>⚖️ Grievance Application Right</h4>
        <p>If you believe this decision was made in error or if you have additional information, you have the right to file a grievance application.</p>
        <div class="deadline">
          <strong>⏰ Grievance Deadline: ${deadlineString}</strong>
          <p style="margin-top:8px;font-size:14px;color:#92400e;">Submit within 3 days of notification</p>
        </div>
        <h5 style="color:#1e40af;margin:20px 0 10px;">How to Apply:</h5>
        <ul class="steps-list">
          <li>Log in to your supplier portal</li>
          <li>Navigate to "Grievance Management"</li>
          <li>Select the evaluated item and submit grievance</li>
          <li>Provide detailed reasons & docs</li>
          <li>Submit before the deadline</li>
        </ul>
      </div>
      <div class="warning-box">
        <h5>⚠️ Important Notice</h5>
        <p>Grievances after the 3-day deadline will not be accepted.</p>
      </div>
      <div class="contact-info">
        <h4>📞 Need Assistance?</h4>
        <p>Contact:</p>
        <p><strong>Grievance Committee Secretary</strong></p>
        <p>Email: grievance@rics.edu.pk | Phone: +92-XXX-XXXXXXX</p>
        <p style="margin-top:8px;font-size:14px;color:#15803d;">We're here to help with your grievance process.</p>
      </div>
      <p style="margin-top:30px;">We appreciate your participation in our tender process. Our decisions ensure highest quality and technical compliance.</p>
      <p style="margin-top:20px;"><strong>Best regards,</strong><br>Technical Evaluation Committee<br>Rawalpindi Institute of Cardiology</p>
    </div>
    <div class="footer">
      <p><strong>Technical Evaluation Committee</strong></p>
      <p>Rawalpindi Institute of Cardiology</p>
      <p>Email: technical@rics.edu.pk | Phone: +92-XXX-XXXXXXX</p>
      <p style="margin-top:15px;font-size:12px;opacity:0.6;">This is an automated message regarding your bid evaluation.</p>
      <p style="font-size:12px;opacity:0.6;">Generated on ${currentDate}</p>
    </div>
  </div>
</body>
</html>
        `;
    }
}

module.exports = EmailService;
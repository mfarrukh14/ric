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
                name: process.env.EMAIL_FROM_NAME || 'RIC Tender System',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: '🎉 Congratulations! Your Supplier Application Has Been Approved',
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
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f7fa;
                }
                
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    background: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 40px 30px;
                    text-align: center;
                    position: relative;
                }
                
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" patternUnits="userSpaceOnUse" width="100" height="100"><circle cx="25" cy="25" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="75" cy="75" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="50" cy="10" r="0.5" fill="rgba(255,255,255,0.05)"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>') repeat;
                }
                
                .header-content {
                    position: relative;
                    z-index: 1;
                }
                
                .header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    margin-bottom: 10px;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .header p {
                    font-size: 16px;
                    opacity: 0.9;
                    margin-bottom: 0;
                }
                
                .success-badge {
                    display: inline-block;
                    background: rgba(255, 255, 255, 0.2);
                    padding: 8px 20px;
                    border-radius: 50px;
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 15px;
                    backdrop-filter: blur(10px);
                }
                
                .content {
                    padding: 40px 30px;
                }
                
                .company-name {
                    color: #667eea;
                    font-weight: 700;
                    font-size: 20px;
                }
                
                .message {
                    font-size: 16px;
                    margin: 25px 0;
                    line-height: 1.8;
                }
                
                .highlight-box {
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    color: white;
                    padding: 25px;
                    border-radius: 10px;
                    margin: 30px 0;
                    text-align: center;
                }
                
                .highlight-box h3 {
                    font-size: 18px;
                    margin-bottom: 10px;
                }
                
                .next-steps {
                    background: #f8fafc;
                    border-left: 4px solid #667eea;
                    padding: 25px;
                    margin: 30px 0;
                    border-radius: 0 8px 8px 0;
                }
                
                .next-steps h3 {
                    color: #667eea;
                    font-size: 18px;
                    margin-bottom: 15px;
                }
                
                .next-steps ul {
                    list-style: none;
                    padding-left: 0;
                }
                
                .next-steps li {
                    margin: 10px 0;
                    padding-left: 25px;
                    position: relative;
                }
                
                .next-steps li::before {
                    content: '✓';
                    position: absolute;
                    left: 0;
                    color: #10b981;
                    font-weight: bold;
                    font-size: 16px;
                }
                
                .cta-button {
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 30px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: 600;
                    margin: 20px 0;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                    transition: transform 0.2s ease;
                }
                
                .cta-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
                }
                
                .footer {
                    background: #1f2937;
                    color: #d1d5db;
                    padding: 30px;
                    text-align: center;
                }
                
                .footer p {
                    margin: 5px 0;
                    font-size: 14px;
                }
                
                .contact-info {
                    margin: 20px 0;
                    padding: 20px;
                    background: rgba(102, 126, 234, 0.05);
                    border-radius: 8px;
                    border: 1px solid rgba(102, 126, 234, 0.1);
                }
                
                .contact-info h4 {
                    color: #667eea;
                    margin-bottom: 10px;
                }
                
                .emoji {
                    font-size: 24px;
                    margin-right: 10px;
                }
                
                @media (max-width: 600px) {
                    .email-container {
                        margin: 10px;
                        border-radius: 8px;
                    }
                    
                    .header {
                        padding: 30px 20px;
                    }
                    
                    .content {
                        padding: 30px 20px;
                    }
                    
                    .header h1 {
                        font-size: 24px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <div class="header-content">
                        <div class="success-badge">
                            <span class="emoji">🎉</span> APPROVED
                        </div>
                        <h1>Congratulations!</h1>
                        <p>Your supplier application has been successfully approved</p>
                    </div>
                </div>
                
                <div class="content">
                    <p>Dear <span class="company-name">${companyName}</span> Team,</p>
                    
                    <div class="message">
                        We are delighted to inform you that your supplier application has been <strong>successfully reviewed and approved</strong> by our Evaluation Committee. After a thorough assessment of your documentation and credentials, we are confident that your organization meets our high standards for partnership.
                    </div>
                    
                    <div class="highlight-box">
                        <h3><span class="emoji">🚀</span> Welcome to Our Supplier Network!</h3>
                        <p>You are now an approved supplier in our tender system and can participate in upcoming procurement opportunities.</p>
                    </div>
                    
                    <div class="next-steps">
                        <h3>Next Steps:</h3>
                        <ul>
                            <li>Log in to your supplier dashboard using your registered credentials</li>
                            <li>Complete your profile with additional business information</li>
                            <li>Browse and participate in active tender opportunities</li>
                            <li>Submit competitive bids for relevant procurements</li>
                            <li>Maintain compliance with all supplier requirements</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.COMPANY_WEBSITE || '#'}" class="cta-button">
                            Access Your Supplier Dashboard
                        </a>
                    </div>
                    
                    <div class="contact-info">
                        <h4><span class="emoji">📞</span> Need Support?</h4>
                        <p>Our procurement team is here to help you get started. If you have any questions or need assistance navigating the system, please don't hesitate to reach out to us.</p>
                    </div>
                    
                    <p style="margin-top: 30px;">
                        Thank you for choosing to partner with us. We look forward to a successful and mutually beneficial business relationship.
                    </p>
                    
                    <p style="margin-top: 20px;">
                        <strong>Best regards,</strong><br>
                        <span style="color: #667eea; font-weight: 600;">The Procurement Team</span><br>
                        ${process.env.COMPANY_NAME || 'Research & Innovation Center'}
                    </p>
                </div>
                
                <div class="footer">
                    <p><strong>${process.env.COMPANY_NAME || 'Research & Innovation Center'}</strong></p>
                    <p>${process.env.COMPANY_ADDRESS || '123 Innovation Street, Tech City'}</p>
                    <p>Email: ${process.env.EMAIL_FROM_EMAIL || 'procurement@company.com'} | Website: ${process.env.COMPANY_WEBSITE || 'www.company.com'}</p>
                    <p style="margin-top: 15px; font-size: 12px; opacity: 0.8;">
                        This is an automated message. Please do not reply directly to this email.
                    </p>
                    <p style="font-size: 12px; opacity: 0.8;">
                        © ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Company Name'}. All rights reserved.
                    </p>
                    <p style="font-size: 11px; margin-top: 10px; opacity: 0.6;">
                        Generated on ${currentDate}
                    </p>
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
                name: process.env.EMAIL_FROM_NAME || 'RIC Tender System',
                address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
            },
            to: supplierEmail,
            subject: `🏆 Congratulations! Supply Order Awarded - ${orderNumber}`,
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
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f8fafc;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 40px 30px;
                    text-align: center;
                }
                .header h1 {
                    font-size: 28px;
                    margin-bottom: 10px;
                    font-weight: 600;
                }
                .header p {
                    font-size: 16px;
                    opacity: 0.9;
                }
                .content {
                    padding: 40px 30px;
                }
                .success-badge {
                    display: inline-block;
                    background-color: #10b981;
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 20px;
                }
                .greeting {
                    font-size: 18px;
                    margin-bottom: 20px;
                    color: #374151;
                }
                .message {
                    font-size: 16px;
                    line-height: 1.7;
                    margin-bottom: 30px;
                    color: #6b7280;
                }
                .order-details {
                    background-color: #f9fafb;
                    border-radius: 8px;
                    padding: 25px;
                    margin: 25px 0;
                    border-left: 4px solid #10b981;
                }
                .order-details h3 {
                    color: #374151;
                    margin-bottom: 15px;
                    font-size: 18px;
                }
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                    border-bottom: 1px solid #e5e7eb;
                }
                .detail-row:last-child {
                    border-bottom: none;
                }
                .detail-label {
                    font-weight: 600;
                    color: #374151;
                }
                .detail-value {
                    color: #6b7280;
                    font-weight: 500;
                }
                .amount {
                    font-size: 24px;
                    font-weight: 700;
                    color: #059669;
                }
                .next-steps {
                    background-color: #eff6ff;
                    border-radius: 8px;
                    padding: 25px;
                    margin: 25px 0;
                    border-left: 4px solid #3b82f6;
                }
                .next-steps h3 {
                    color: #1e40af;
                    margin-bottom: 15px;
                    font-size: 18px;
                }
                .steps-list {
                    list-style: none;
                    padding: 0;
                }
                .steps-list li {
                    padding: 8px 0;
                    position: relative;
                    padding-left: 25px;
                    color: #374151;
                }
                .steps-list li:before {
                    content: "✓";
                    position: absolute;
                    left: 0;
                    color: #10b981;
                    font-weight: bold;
                }
                .footer {
                    background-color: #f9fafb;
                    padding: 30px;
                    text-align: center;
                    border-top: 1px solid #e5e7eb;
                }
                .footer p {
                    color: #6b7280;
                    font-size: 14px;
                    margin-bottom: 10px;
                }
                .contact-info {
                    background-color: #fef7ff;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    border-left: 4px solid #a855f7;
                }
                .contact-info h4 {
                    color: #7c2d12;
                    margin-bottom: 10px;
                }
                .contact-info p {
                    color: #92400e;
                    margin: 5px 0;
                }
                .attachment-notice {
                    background-color: #fef3c7;
                    border-radius: 8px;
                    padding: 15px;
                    margin: 20px 0;
                    border-left: 4px solid #f59e0b;
                    text-align: center;
                }
                .attachment-notice p {
                    color: #92400e;
                    font-weight: 600;
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏆 Supply Order Awarded!</h1>
                    <p>Regional Institute of Computer Sciences</p>
                </div>
                
                <div class="content">
                    <div class="success-badge">ORDER AWARDED</div>
                    
                    <div class="greeting">
                        Dear ${companyName} Team,
                    </div>
                    
                    <div class="message">
                        Congratulations! We are pleased to inform you that your bid has been selected for the supply order. 
                        Your competitive pricing and commitment to quality have made you our preferred supplier for this requirement.
                    </div>

                    <div class="order-details">
                        <h3>📋 Order Summary</h3>
                        <div class="detail-row">
                            <span class="detail-label">Order Number:</span>
                            <span class="detail-value">${orderNumber}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Order Date:</span>
                            <span class="detail-value">${currentDate}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Item:</span>
                            <span class="detail-value">${orderData.item_name}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Quantity:</span>
                            <span class="detail-value">${orderData.quantity}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Delivery Timeline:</span>
                            <span class="detail-value">${orderData.delivery_time_days} days</span>
                        </div>                        <div class="detail-row">
                            <span class="detail-label">Award Amount:</span>
                            <span class="detail-value amount">$${(orderData.awarded_bid_amount || 0).toLocaleString()}</span>
                        </div>
                    </div>

                    <div class="attachment-notice">
                        <p>📎 Detailed supply order document is attached to this email</p>
                    </div>

                    <div class="next-steps">
                        <h3>📌 Next Steps</h3>
                        <ul class="steps-list">
                            <li>Review the attached supply order document carefully</li>
                            <li>Confirm order acceptance within 48 hours</li>
                            <li>Begin procurement and preparation for delivery</li>
                            <li>Ensure delivery within ${orderData.delivery_time_days} days as committed</li>
                            <li>Contact us for any clarifications or special requirements</li>
                        </ul>
                    </div>

                    <div class="contact-info">
                        <h4>📞 Contact Information</h4>
                        <p><strong>Purchase Department</strong></p>
                        <p>Email: purchase@rics.edu.pk</p>
                        <p>Phone: +92-XXX-XXXXXXX</p>
                        <p>Office Hours: Monday - Friday, 9:00 AM - 5:00 PM</p>
                    </div>

                    <div class="message">
                        We look forward to a successful partnership and timely delivery of the ordered items. 
                        Thank you for your participation in our tender process.
                    </div>
                </div>
                
                <div class="footer">
                    <p><strong>Regional Institute of Computer Sciences</strong></p>
                    <p>Tender Management System | Automated Message</p>
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
            subject: `📅 Grievance Meeting Scheduled - ${itemName}`,
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
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f7fa;
                }
                
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    background: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                
                .header {
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                    color: white;
                    padding: 40px 30px;
                    text-align: center;
                    position: relative;
                }
                
                .header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    margin-bottom: 10px;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .header p {
                    font-size: 16px;
                    opacity: 0.9;
                    margin-bottom: 0;
                }
                
                .meeting-badge {
                    display: inline-block;
                    background: rgba(255, 255, 255, 0.2);
                    padding: 8px 20px;
                    border-radius: 50px;
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 15px;
                    backdrop-filter: blur(10px);
                }
                
                .content {
                    padding: 40px 30px;
                }
                
                .company-name {
                    color: #f59e0b;
                    font-weight: 700;
                    font-size: 20px;
                }
                
                .message {
                    font-size: 16px;
                    margin: 25px 0;
                    line-height: 1.8;
                }
                
                .meeting-details {
                    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                    padding: 25px;
                    border-radius: 10px;
                    margin: 30px 0;
                    border-left: 4px solid #f59e0b;
                }
                
                .meeting-details h3 {
                    color: #92400e;
                    font-size: 18px;
                    margin-bottom: 15px;
                }
                
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                    border-bottom: 1px solid #fbbf24;
                }
                
                .detail-row:last-child {
                    border-bottom: none;
                }
                
                .detail-label {
                    font-weight: 600;
                    color: #92400e;
                    min-width: 120px;
                }
                
                .detail-value {
                    color: #451a03;
                    font-weight: 500;
                    text-align: right;
                    flex: 1;
                }
                
                .item-info {
                    background: #f3f4f6;
                    border-left: 4px solid #6b7280;
                    padding: 20px;
                    margin: 25px 0;
                    border-radius: 0 8px 8px 0;
                }
                
                .item-info h4 {
                    color: #374151;
                    margin-bottom: 10px;
                }
                
                .instructions {
                    background: #fef2f2;
                    border-left: 4px solid #ef4444;
                    padding: 25px;
                    margin: 30px 0;
                    border-radius: 0 8px 8px 0;
                }
                
                .instructions h3 {
                    color: #dc2626;
                    font-size: 18px;
                    margin-bottom: 15px;
                }
                
                .instructions ul {
                    list-style: none;
                    padding-left: 0;
                }
                
                .instructions li {
                    margin: 10px 0;
                    padding-left: 25px;
                    position: relative;
                    color: #7f1d1d;
                }
                
                .instructions li::before {
                    content: '⚠️';
                    position: absolute;
                    left: 0;
                    font-size: 16px;
                }
                
                .contact-info {
                    margin: 20px 0;
                    padding: 20px;
                    background: rgba(59, 130, 246, 0.05);
                    border-radius: 8px;
                    border: 1px solid rgba(59, 130, 246, 0.1);
                }
                
                .contact-info h4 {
                    color: #3b82f6;
                    margin-bottom: 10px;
                }
                
                .footer {
                    background: #1f2937;
                    color: #d1d5db;
                    padding: 30px;
                    text-align: center;
                }
                
                .footer p {
                    margin: 5px 0;
                    font-size: 14px;
                }
                
                .emoji {
                    font-size: 20px;
                    margin-right: 8px;
                }
                
                @media (max-width: 600px) {
                    .email-container {
                        margin: 10px;
                        border-radius: 8px;
                    }
                    
                    .header {
                        padding: 30px 20px;
                    }
                    
                    .content {
                        padding: 30px 20px;
                    }
                    
                    .detail-row {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    
                    .detail-value {
                        text-align: left;
                        margin-top: 5px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <div class="meeting-badge">
                        <span class="emoji">📅</span> MEETING SCHEDULED
                    </div>
                    <h1>Grievance Meeting Scheduled</h1>
                    <p>Your grievance application has been reviewed</p>
                </div>
                
                <div class="content">
                    <p>Dear <span class="company-name">${companyName}</span> Team,</p>
                    
                    <div class="message">
                        Your grievance application has been reviewed by the <strong>Grievance Committee</strong>. We have scheduled a meeting to discuss your concerns regarding the technical evaluation decision.
                    </div>
                    
                    <div class="item-info">
                        <h4><span class="emoji">📦</span> Regarding Item:</h4>
                        <p><strong>${itemName}</strong></p>
                    </div>
                    
                    <div class="meeting-details">
                        <h3><span class="emoji">📋</span> Meeting Details</h3>
                        <div class="detail-row">
                            <span class="detail-label">Date:</span>
                            <span class="detail-value">${meetingDate}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Time:</span>
                            <span class="detail-value">${meetingTime}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Location:</span>
                            <span class="detail-value">${meetingLocation}</span>
                        </div>
                        ${meetingDetails ? `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #fbbf24;">
                            <p style="color: #92400e; font-weight: 600; margin-bottom: 8px;">Additional Details:</p>
                            <p style="color: #451a03;">${meetingDetails}</p>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="instructions">
                        <h3><span class="emoji">⚠️</span> Important Instructions</h3>
                        <ul>
                            <li>Please confirm your attendance by responding to this email</li>
                            <li>Bring all relevant documentation and evidence to support your case</li>
                            <li>Arrive 15 minutes before the scheduled time</li>
                            <li>If you cannot attend, contact us immediately to reschedule</li>
                            <li>Be prepared to present your grievance clearly and concisely</li>
                        </ul>
                    </div>
                    
                    <div class="contact-info">
                        <h4><span class="emoji">📞</span> Contact Information</h4>
                        <p>If you have any questions or need to reschedule, please contact:</p>
                        <p><strong>Grievance Committee Secretary</strong></p>
                        <p>Email: grievance@rics.edu.pk</p>
                        <p>Phone: +92-XXX-XXXXXXX</p>
                    </div>
                    
                    <p style="margin-top: 30px;">
                        We are committed to ensuring a fair and transparent grievance process. Your concerns will be thoroughly reviewed during the meeting.
                    </p>
                    
                    <p style="margin-top: 20px;">
                        <strong>Best regards,</strong><br>
                        <span style="color: #f59e0b; font-weight: 600;">The Grievance Committee</span><br>
                        ${process.env.COMPANY_NAME || 'Research & Innovation Center'}
                    </p>
                </div>
                
                <div class="footer">
                    <p><strong>Grievance Committee</strong></p>
                    <p>${process.env.COMPANY_NAME || 'Research & Innovation Center'}</p>
                    <p>Email: grievance@rics.edu.pk | Phone: +92-XXX-XXXXXXX</p>
                    <p style="margin-top: 15px; font-size: 12px; opacity: 0.8;">
                        This is an automated message regarding your grievance application.
                    </p>
                    <p style="font-size: 12px; opacity: 0.8;">
                        © ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Company Name'}. All rights reserved.
                    </p>
                    <p style="font-size: 11px; margin-top: 10px; opacity: 0.6;">
                        Sent on ${currentDate}
                    </p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
}

module.exports = EmailService;

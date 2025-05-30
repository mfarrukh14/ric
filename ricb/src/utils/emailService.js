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
}

module.exports = EmailService;

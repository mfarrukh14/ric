const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

class PDFService {
    constructor() {
        this.browser = null;
    }

    async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return this.browser;
    }

    async generateSupplyOrderPDF(orderData) {
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();

            const html = this.generateSupplyOrderHTML(orderData);
            
            await page.setContent(html, {
                waitUntil: 'networkidle0'
            });

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                }
            });

            await page.close();
            
            return pdfBuffer;
        } catch (error) {
            console.error('Error generating supply order PDF:', error);
            throw error;
        }
    }

    generateSupplyOrderHTML(orderData) {
        const currentDate = new Date().toLocaleDateString();
        const orderNumber = `SO-${orderData.tender_id}-${Date.now()}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Supply Order - ${orderNumber}</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    margin: 0;
                    padding: 0;
                    color: #333;
                    line-height: 1.6;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #2563eb;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .company-name {
                    font-size: 28px;
                    font-weight: bold;
                    color: #1e40af;
                    margin-bottom: 10px;
                }
                .document-title {
                    font-size: 22px;
                    color: #374151;
                    margin-bottom: 5px;
                }
                .order-number {
                    font-size: 16px;
                    color: #6b7280;
                }
                .order-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 30px;
                }
                .info-section {
                    width: 48%;
                }
                .info-title {
                    font-size: 16px;
                    font-weight: bold;
                    color: #1f2937;
                    margin-bottom: 10px;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 5px;
                }
                .info-item {
                    margin-bottom: 8px;
                    display: flex;
                }
                .info-label {
                    font-weight: bold;
                    width: 120px;
                    color: #374151;
                }
                .info-value {
                    color: #6b7280;
                }
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }
                .items-table th {
                    background-color: #f3f4f6;
                    color: #1f2937;
                    font-weight: bold;
                    padding: 12px;
                    text-align: left;
                    border-bottom: 2px solid #e5e7eb;
                }
                .items-table td {
                    padding: 12px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .total-section {
                    text-align: right;
                    margin-bottom: 30px;
                }
                .total-row {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 8px;
                }
                .total-label {
                    font-weight: bold;
                    width: 150px;
                    text-align: right;
                    margin-right: 20px;
                }
                .total-value {
                    width: 100px;
                    text-align: right;
                    font-size: 18px;
                }
                .final-total {
                    border-top: 2px solid #2563eb;
                    padding-top: 8px;
                    font-size: 20px;
                    font-weight: bold;
                    color: #1e40af;
                }
                .terms {
                    margin-bottom: 30px;
                }
                .terms-title {
                    font-size: 16px;
                    font-weight: bold;
                    color: #1f2937;
                    margin-bottom: 10px;
                }
                .terms-list {
                    list-style-type: decimal;
                    padding-left: 20px;
                }
                .terms-list li {
                    margin-bottom: 5px;
                    color: #6b7280;
                }
                .signatures {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 50px;
                }
                .signature-section {
                    text-align: center;
                    width: 200px;
                }
                .signature-line {
                    border-top: 1px solid #374151;
                    margin-top: 50px;
                    padding-top: 10px;
                    font-weight: bold;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="company-name">Regional Institute of Computer Sciences</div>
                    <div class="document-title">SUPPLY ORDER</div>
                    <div class="order-number">Order No: ${orderNumber}</div>
                </div>

                <div class="order-info">
                    <div class="info-section">
                        <div class="info-title">Supplier Information</div>
                        <div class="info-item">
                            <span class="info-label">Company:</span>
                            <span class="info-value">${orderData.company_name}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Contact:</span>
                            <span class="info-value">${orderData.contact_person || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Email:</span>
                            <span class="info-value">${orderData.company_email}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Phone:</span>
                            <span class="info-value">${orderData.phone || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="info-section">
                        <div class="info-title">Order Details</div>
                        <div class="info-item">
                            <span class="info-label">Date:</span>
                            <span class="info-value">${currentDate}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Tender ID:</span>
                            <span class="info-value">${orderData.tender_id}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Delivery:</span>
                            <span class="info-value">${orderData.delivery_time_days} days</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Priority:</span>
                            <span class="info-value">${orderData.urgency.toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <strong>${orderData.item_name}</strong><br>
                                <small style="color: #6b7280;">${orderData.description}</small>
                            </td>
                            <td>${orderData.quantity}</td>
                            <td>$${(orderData.awarded_bid_amount / orderData.quantity).toFixed(2)}</td>
                            <td>$${orderData.awarded_bid_amount.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="total-section">
                    <div class="total-row">
                        <span class="total-label">Subtotal:</span>
                        <span class="total-value">$${orderData.awarded_bid_amount.toFixed(2)}</span>
                    </div>
                    <div class="total-row">
                        <span class="total-label">Tax (0%):</span>
                        <span class="total-value">$0.00</span>
                    </div>
                    <div class="total-row final-total">
                        <span class="total-label">Total Amount:</span>
                        <span class="total-value">$${orderData.awarded_bid_amount.toFixed(2)}</span>
                    </div>
                </div>

                ${orderData.bid_comments ? `
                <div class="terms">
                    <div class="terms-title">Supplier Comments</div>
                    <p style="color: #6b7280; padding: 10px; background-color: #f9fafb; border-left: 4px solid #2563eb;">
                        ${orderData.bid_comments}
                    </p>
                </div>
                ` : ''}

                <div class="terms">
                    <div class="terms-title">Terms and Conditions</div>
                    <ol class="terms-list">
                        <li>Delivery must be completed within ${orderData.delivery_time_days} days from the date of this order.</li>
                        <li>All items must meet the specifications mentioned in the original demand.</li>
                        <li>Payment will be processed within 30 days of satisfactory delivery.</li>
                        <li>The supplier must provide warranty for items as per industry standards.</li>
                        <li>Any damages during delivery will be the responsibility of the supplier.</li>
                        <li>This order is subject to terms and conditions of the original tender.</li>
                    </ol>
                </div>

                <div class="signatures">
                    <div class="signature-section">
                        <div class="signature-line">Authorized Signatory<br>Purchase Department</div>
                    </div>
                    <div class="signature-section">
                        <div class="signature-line">Supplier Signature<br>${orderData.company_name}</div>
                    </div>
                </div>

                <div class="footer">
                    <p>This is a computer-generated document and does not require a physical signature.</p>
                    <p>For any queries, please contact the Purchase Department at purchase@rics.edu.pk</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = new PDFService();

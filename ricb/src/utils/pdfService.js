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
                    <div class="company-name">Rawalpindi Institute of Cardiology</div>
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
                            <span class="info-label">Tender:</span>
                            <span class="info-value">${orderData.tender_number ? `Tender ${orderData.tender_number}` : `Tender #${orderData.tender_id}`}</span>
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
                        <tr>                            <td>
                                <strong>${orderData.item_name || 'N/A'}</strong><br>
                                <small style="color: #6b7280;">${orderData.description || 'No description'}</small>
                            </td>                            <td>${orderData.quantity || 0}</td>
                            <td>Rs ${(orderData.awarded_bid_amount && orderData.quantity && orderData.awarded_bid_amount > 0 && orderData.quantity > 0) ? (orderData.awarded_bid_amount / orderData.quantity).toFixed(2) : '0.00'}</td>
                            <td>Rs ${(orderData.awarded_bid_amount || 0).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>                <div class="total-section">
                    <div class="total-row">
                        <span class="total-label">Subtotal:</span>
                        <span class="total-value">Rs ${(orderData.awarded_bid_amount || 0).toFixed(2)}</span>
                    </div>
                    <div class="total-row">
                        <span class="total-label">Tax (0%):</span>
                        <span class="total-value">Rs 0.00</span>
                    </div>
                    <div class="total-row final-total">
                        <span class="total-label">Total Amount:</span>
                        <span class="total-value">Rs ${(orderData.awarded_bid_amount || 0).toFixed(2)}</span>
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
                    <p>For any queries, please contact the Purchase Department at purchase department at RIC</p>
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

// Generate tender opening report PDF
const generateTenderOpeningReport = async (reportData) => {
    const { tender, bids, generatedBy, generatedAt, totalBids } = reportData;
    
    const tenderDisplayName = tender.tender_number ? `Tender ${tender.tender_number}` : `Tender #${tender.id}`;
    
    // Calculate statistics
    const localCompanies = bids.filter(bid => bid.origin_classification !== 'international').length;
    const internationalCompanies = bids.filter(bid => bid.origin_classification === 'international').length;
    
    const deliveryTimes = bids.map(bid => bid.delivery_days).filter(days => days != null);
    const avgDeliveryTime = deliveryTimes.length > 0 ? 
        Math.round(deliveryTimes.reduce((sum, days) => sum + days, 0) / deliveryTimes.length) : 0;
    const minDeliveryTime = deliveryTimes.length > 0 ? Math.min(...deliveryTimes) : 0;
    const maxDeliveryTime = deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : 0;

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Tender Opening Report - ${tenderDisplayName}</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                    background: #fff;
                }
                .header {
                    text-align: center;
                    padding: 30px 0;
                    border-bottom: 3px solid #2563eb;
                    margin-bottom: 30px;
                }
                .logo {
                    color: #2563eb;
                    font-size: 28px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .header h1 {
                    color: #1f2937;
                    margin: 20px 0 10px 0;
                    font-size: 24px;
                }
                .header .subtitle {
                    color: #6b7280;
                    font-size: 16px;
                }
                .tender-info {
                    background: #f8fafc;
                    padding: 25px;
                    border-radius: 8px;
                    margin-bottom: 30px;
                    border-left: 4px solid #2563eb;
                }
                .tender-info h2 {
                    color: #1f2937;
                    margin-bottom: 20px;
                    font-size: 20px;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                }
                .info-item {
                    background: white;
                    padding: 15px;
                    border-radius: 6px;
                    border: 1px solid #e5e7eb;
                }
                .info-label {
                    font-weight: 600;
                    color: #374151;
                    display: block;
                    margin-bottom: 5px;
                    font-size: 14px;
                }
                .info-value {
                    color: #1f2937;
                    font-size: 16px;
                }
                .stats-section {
                    margin-bottom: 30px;
                }
                .stats-section h2 {
                    color: #1f2937;
                    margin-bottom: 20px;
                    font-size: 20px;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 10px;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                }
                .stat-value {
                    font-size: 32px;
                    font-weight: bold;
                    display: block;
                    margin-bottom: 5px;
                }
                .stat-label {
                    font-size: 14px;
                    opacity: 0.9;
                }
                .participants-section {
                    margin-bottom: 30px;
                }
                .participants-section h2 {
                    color: #1f2937;
                    margin-bottom: 20px;
                    font-size: 20px;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 10px;
                }
                .participants-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .participants-table th {
                    background: #f3f4f6;
                    color: #374151;
                    font-weight: 600;
                    padding: 15px 12px;
                    text-align: left;
                    font-size: 14px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .participants-table td {
                    padding: 12px;
                    border-bottom: 1px solid #f3f4f6;
                    font-size: 14px;
                }
                .participants-table tr:hover {
                    background: #f9fafb;
                }
                .confidential-notice {
                    background: #fef3cd;
                    border: 1px solid #f59e0b;
                    border-radius: 6px;
                    padding: 15px;
                    margin: 20px 0;
                    text-align: center;
                }
                .confidential-notice .icon {
                    color: #d97706;
                    font-size: 20px;
                    margin-right: 10px;
                }
                .confidential-notice .text {
                    color: #92400e;
                    font-weight: 600;
                }
                .footer {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                }
                .delivery-stats {
                    background: #f0f9ff;
                    border: 1px solid #0ea5e9;
                    border-radius: 6px;
                    padding: 20px;
                    margin: 20px 0;
                }
                .delivery-stats h3 {
                    color: #0c4a6e;
                    margin-bottom: 15px;
                    font-size: 16px;
                }
                .delivery-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                }
                .delivery-item {
                    text-align: center;
                }
                .delivery-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #0c4a6e;
                    display: block;
                }
                .delivery-label {
                    font-size: 12px;
                    color: #075985;
                    margin-top: 5px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">RIC - TENDER MANAGEMENT SYSTEM</div>
                <h1>Tender Opening Report</h1>
                <div class="subtitle">${tenderDisplayName} - Bidding Participation Analysis</div>
            </div>

            <div class="tender-info">
                <h2>Tender Information</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Tender Number:</span>
                        <span class="info-value">${tender.tender_number || `#${tender.id}`}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Item/Service:</span>
                        <span class="info-value">${tender.item_name || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Description:</span>
                        <span class="info-value">${tender.description || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Urgency Level:</span>
                        <span class="info-value">${tender.urgency || 'Normal'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Bidding End Time:</span>
                        <span class="info-value">${new Date(tender.bidding_end_time).toLocaleString('en-PK')}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Required By:</span>
                        <span class="info-value">${tender.required_by ? new Date(tender.required_by).toLocaleDateString('en-PK') : 'Not specified'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Requested By:</span>
                        <span class="info-value">${tender.created_by_name || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Department:</span>
                        <span class="info-value">${tender.creator_department || 'N/A'}</span>
                    </div>
                </div>
            </div>

            <div class="confidential-notice">
                <span class="icon">🔒</span>
                <span class="text">CONFIDENTIAL: Financial bid details are not disclosed in this report as per procurement policy</span>
            </div>

            <div class="stats-section">
                <h2>Participation Statistics</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <span class="stat-value">${totalBids}</span>
                        <span class="stat-label">Total Participants</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">${localCompanies}</span>
                        <span class="stat-label">Local Companies</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">${internationalCompanies}</span>
                        <span class="stat-label">International Companies</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">${Math.round((totalBids / (tender.minimum_suppliers || 3)) * 100)}%</span>
                        <span class="stat-label">Response Rate</span>
                    </div>
                </div>

                ${deliveryTimes.length > 0 ? `
                <div class="delivery-stats">
                    <h3>Delivery Time Analysis</h3>
                    <div class="delivery-grid">
                        <div class="delivery-item">
                            <span class="delivery-value">${minDeliveryTime}</span>
                            <div class="delivery-label">Fastest (days)</div>
                        </div>
                        <div class="delivery-item">
                            <span class="delivery-value">${maxDeliveryTime}</span>
                            <div class="delivery-label">Slowest (days)</div>
                        </div>
                        <div class="delivery-item">
                            <span class="delivery-value">${avgDeliveryTime}</span>
                            <div class="delivery-label">Average (days)</div>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>

            <div class="participants-section">
                <h2>Participating Companies</h2>
                ${totalBids === 0 ? `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        <div style="font-size: 48px; margin-bottom: 20px;">📪</div>
                        <h3>No Bids Received</h3>
                        <p>No companies submitted bids for this tender.</p>
                    </div>
                ` : `
                    <table class="participants-table">
                        <thead>
                            <tr>
                                <th>Sr.</th>
                                <th>Company Name</th>
                                <th>Type</th>
                                <th>Contact Email</th>
                                <th>Contact Phone</th>
                                <th>Proposed Delivery</th>
                                <th>Submission Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bids.map((bid, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${bid.company_name || 'N/A'}</td>
                                    <td>${bid.origin_classification === 'international' ? 'International' : 'Local'}</td>
                                    <td>${bid.company_email || 'N/A'}</td>
                                    <td>${bid.contact_phone || 'N/A'}</td>
                                    <td>${bid.delivery_days ? `${bid.delivery_days} days` : 'N/A'}</td>
                                    <td>${new Date(bid.created_at).toLocaleString('en-PK')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>

            <div class="footer">
                <p><strong>Generated by:</strong> ${generatedBy} | <strong>Generated on:</strong> ${new Date(generatedAt).toLocaleString('en-PK')}</p>
                <p>This report contains confidential information. Distribution is restricted to authorized personnel only.</p>
                <p>© ${new Date().getFullYear()} Research Institute for Consumer Protection - Tender Management System</p>
            </div>
        </body>
        </html>
    `;

    try {
        // Use puppeteer to generate PDF from HTML
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlContent, {
            waitUntil: 'networkidle0'
        });

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
        await browser.close();
        
        return pdfBuffer;
    } catch (error) {
        console.error('Error generating tender opening report PDF:', error);
        throw new Error('Failed to generate tender opening report PDF');
    }
};

// Create and export PDFService instance
const pdfServiceInstance = new PDFService();

module.exports = {
    generateSupplyOrderPDF: pdfServiceInstance.generateSupplyOrderPDF.bind(pdfServiceInstance),
    generateTenderOpeningReport
};

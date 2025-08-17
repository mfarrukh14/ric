const { getDatabase } = require('../config/database');
const path = require('path');
const fs = require('fs');
const EmailService = require('../utils/emailService');

const emailService = new EmailService();

// Get tenders ready for letter of intent (after financial opening)
const getTendersReadyForLetterOfIntent = async (req, res) => {
    try {
        const db = getDatabase();
        
        console.log('Fetching tenders ready for Letter of Intent...');
        
        const query = `
            SELECT 
                dt.id,
                dt.tender_number,
                dt.demand_id,
                dt.tender_status,
                d.item_name,
                d.description,
                u.name as created_by_name,
                fo.opened_at as financial_opened_at,
                fo.opened_by,
                fo.status as financial_status,
                COUNT(DISTINCT sb.supplier_id) as total_bidders,
                COUNT(DISTINCT te.supplier_id) as approved_bidders,
                tl_intent.id as intent_letter_sent,
                tl_intent.sent_at as intent_sent_at
            FROM demand_tenders dt
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN users u ON d.created_by = u.id
            LEFT JOIN financial_openings fo ON dt.id = fo.tender_id
            LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id
            LEFT JOIN technical_evaluations te ON sb.id = te.bid_id AND te.status = 'approved'
            LEFT JOIN tender_letters tl_intent ON dt.id = tl_intent.tender_id AND tl_intent.letter_type = 'intent'
            WHERE fo.opened_at IS NOT NULL
            AND fo.status = 'opened'
            AND dt.tender_status NOT IN ('awarded', 'cancelled')
            GROUP BY dt.id
            HAVING COUNT(DISTINCT te.supplier_id) > 0
            ORDER BY fo.opened_at DESC
        `;

        // Alternative simpler query for debugging
        const simpleQuery = `
            SELECT 
                dt.id,
                dt.tender_number,
                dt.tender_status,
                d.item_name,
                fo.status as financial_status,
                fo.opened_at
            FROM demand_tenders dt
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN financial_openings fo ON dt.id = fo.tender_id
            WHERE fo.opened_at IS NOT NULL
            ORDER BY fo.opened_at DESC
        `;

        // Run simple query first for debugging
        db.all(simpleQuery, [], (err, simpleTenders) => {
            if (err) {
                console.error('Error in simple query:', err);
            } else {
                console.log('Simple query results (all tenders with financial opening):');
                simpleTenders.forEach(tender => {
                    console.log(`- ${tender.tender_number}: status=${tender.financial_status}, opened=${tender.opened_at}`);
                });
            }
        });

        db.all(query, [], (err, tenders) => {
            if (err) {
                console.error('Error fetching tenders ready for letter of intent:', err);
                return res.status(500).json({ error: 'Failed to fetch tenders' });
            }

            console.log(`Found ${tenders.length} tenders ready for Letter of Intent:`);
            tenders.forEach(tender => {
                console.log(`- Tender ${tender.tender_number}: ${tender.approved_bidders} approved bidders, financial opened at ${tender.financial_opened_at}`);
            });

            res.json(tenders);
        });
    } catch (error) {
        console.error('Error in getTendersReadyForLetterOfIntent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Send letter of intent
const sendLetterOfIntent = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { letterTitle, letterContent, sendTo } = req.body;
        let { selectedSuppliers } = req.body;
        const userId = req.user.id;
        const db = getDatabase();

        console.log('Send Letter of Intent request:', {
            tenderId,
            letterTitle,
            sendTo,
            selectedSuppliers: typeof selectedSuppliers,
            selectedSuppliersValue: selectedSuppliers,
            hasFile: !!req.file
        });

        // Parse selectedSuppliers if it's a JSON string
        if (typeof selectedSuppliers === 'string') {
            try {
                selectedSuppliers = JSON.parse(selectedSuppliers);
            } catch (parseError) {
                console.error('Error parsing selectedSuppliers:', parseError);
                selectedSuppliers = [];
            }
        }

        // Ensure selectedSuppliers is an array
        if (!Array.isArray(selectedSuppliers)) {
            selectedSuppliers = [];
        }

        console.log('Processed selectedSuppliers:', selectedSuppliers);

        // Check if letter file was uploaded
        const letterFile = req.file;
        if (!letterFile) {
            return res.status(400).json({ error: 'Letter file is required' });
        }

        // Begin transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Insert letter record
            const letterId = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO tender_letters 
                    (tender_id, letter_type, letter_title, letter_content, letter_file_path, letter_original_name, sent_to, sent_by)
                    VALUES (?, 'intent', ?, ?, ?, ?, ?, ?)`,
                    [tenderId, letterTitle, letterContent, letterFile.filename, letterFile.originalname, sendTo, userId],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });

            // Get approved suppliers for this tender
            let recipientQuery;
            let queryParams;

            if (sendTo === 'all') {
                recipientQuery = `
                    SELECT DISTINCT s.id, s.business_email, sbp.business_name, sbp.contact_person_name
                    FROM suppliers s
                    JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                    JOIN supplier_bids sb ON s.id = sb.supplier_id
                    JOIN technical_evaluations te ON sb.id = te.bid_id
                    WHERE sb.tender_id = ? AND te.status = 'approved' AND s.status = 'approved'
                `;
                queryParams = [tenderId];
            } else {
                const supplierIds = selectedSuppliers.join(',');
                recipientQuery = `
                    SELECT DISTINCT s.id, s.business_email, sbp.business_name, sbp.contact_person_name
                    FROM suppliers s
                    JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                    WHERE s.id IN (${supplierIds}) AND s.status = 'approved'
                `;
                queryParams = [];
            }

            const recipients = await new Promise((resolve, reject) => {
                db.all(recipientQuery, queryParams, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            if (recipients.length === 0) {
                throw new Error('No eligible recipients found');
            }

            // Insert recipients and send emails
            let successfulSends = 0;
            let failedSends = 0;
            const emailPromises = [];

            for (const recipient of recipients) {
                // Insert recipient record
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO letter_recipients 
                        (letter_id, supplier_id, supplier_email, supplier_name, email_status)
                        VALUES (?, ?, ?, ?, 'pending')`,
                        [letterId, recipient.id, recipient.business_email, recipient.business_name],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Send email
                const emailPromise = sendLetterOfIntentEmail(
                    recipient.business_email,
                    recipient.business_name,
                    recipient.contact_person_name,
                    letterTitle,
                    letterContent,
                    letterFile.path,
                    letterFile.originalname,
                    letterId,
                    recipient.id
                ).then(() => {
                    successfulSends++;
                    return { success: true, email: recipient.business_email };
                }).catch((error) => {
                    failedSends++;
                    console.error(`Failed to send email to ${recipient.business_email}:`, error);
                    return { success: false, email: recipient.business_email, error: error.message };
                });

                emailPromises.push(emailPromise);
            }

            // Wait for all emails to be sent
            const emailResults = await Promise.all(emailPromises);

            // Update letter statistics
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE tender_letters 
                    SET total_recipients = ?, successful_sends = ?, failed_sends = ?
                    WHERE id = ?`,
                    [recipients.length, successfulSends, failedSends, letterId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Update recipient statuses based on email results
            for (let i = 0; i < emailResults.length; i++) {
                const result = emailResults[i];
                const recipient = recipients[i];
                
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE letter_recipients 
                        SET email_status = ?, sent_at = CURRENT_TIMESTAMP, error_message = ?
                        WHERE letter_id = ? AND supplier_id = ?`,
                        [result.success ? 'sent' : 'failed', result.error || null, letterId, recipient.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({
                message: 'Letter of intent sent successfully',
                letterId: letterId,
                totalRecipients: recipients.length,
                successfulSends: successfulSends,
                failedSends: failedSends,
                emailResults: emailResults
            });

        } catch (error) {
            // Rollback transaction
            await new Promise((resolve, reject) => {
                db.run('ROLLBACK', (err) => {
                    if (err) console.error('Rollback error:', err);
                    resolve();
                });
            });
            throw error;
        }

    } catch (error) {
        console.error('Error sending letter of intent:', error);
        res.status(500).json({ error: 'Failed to send letter of intent' });
    }
};

// Get suppliers who received letter of intent for a tender
const getSuppliersWithLetterOfIntent = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const db = getDatabase();

        const query = `
            SELECT 
                lr.supplier_id,
                lr.supplier_email,
                lr.supplier_name,
                lr.email_status,
                lr.sent_at,
                s.status as supplier_status,
                sbp.business_name,
                sbp.contact_person_name
            FROM letter_recipients lr
            JOIN tender_letters tl ON lr.letter_id = tl.id
            JOIN suppliers s ON lr.supplier_id = s.id
            JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
            WHERE tl.tender_id = ? AND tl.letter_type = 'intent' AND lr.email_status = 'sent'
            ORDER BY lr.sent_at DESC
        `;

        db.all(query, [tenderId], (err, suppliers) => {
            if (err) {
                console.error('Error fetching suppliers with letter of intent:', err);
                return res.status(500).json({ error: 'Failed to fetch suppliers' });
            }

            res.json(suppliers);
        });
    } catch (error) {
        console.error('Error in getSuppliersWithLetterOfIntent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Send letter of award
const sendLetterOfAward = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { letterTitle, letterContent, awardDetails } = req.body;
        let { selectedSuppliers } = req.body;
        const userId = req.user.id;
        const db = getDatabase();

        console.log('Send Letter of Award request:', {
            tenderId,
            letterTitle,
            selectedSuppliers: typeof selectedSuppliers,
            selectedSuppliersValue: selectedSuppliers,
            hasFile: !!req.file
        });

        // Parse selectedSuppliers if it's a JSON string
        if (typeof selectedSuppliers === 'string') {
            try {
                selectedSuppliers = JSON.parse(selectedSuppliers);
            } catch (parseError) {
                console.error('Error parsing selectedSuppliers for Award:', parseError);
                selectedSuppliers = [];
            }
        }

        // Ensure selectedSuppliers is an array
        if (!Array.isArray(selectedSuppliers)) {
            console.error('selectedSuppliers is not an array:', selectedSuppliers);
            selectedSuppliers = [];
        }

        console.log('Processed selectedSuppliers for Award:', selectedSuppliers);

        // Check if letter file was uploaded
        const letterFile = req.file;
        if (!letterFile) {
            return res.status(400).json({ error: 'Letter file is required' });
        }

        if (!selectedSuppliers || selectedSuppliers.length === 0) {
            return res.status(400).json({ error: 'At least one supplier must be selected for award' });
        }

        // Begin transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Insert letter record
            const letterId = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO tender_letters 
                    (tender_id, letter_type, letter_title, letter_content, letter_file_path, letter_original_name, sent_to, sent_by)
                    VALUES (?, 'award', ?, ?, ?, ?, 'selected', ?)`,
                    [tenderId, letterTitle, letterContent, letterFile.filename, letterFile.originalname, userId],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });

            // Get selected suppliers details
            console.log('selectedSuppliers before join:', selectedSuppliers);
            
            if (!Array.isArray(selectedSuppliers) || selectedSuppliers.length === 0) {
                throw new Error('Invalid or empty selectedSuppliers array');
            }
            
            const supplierIds = selectedSuppliers.join(',');
            console.log('supplierIds for Award query:', supplierIds);
            
            const recipients = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT DISTINCT s.id, s.business_email, sbp.business_name, sbp.contact_person_name,
                     sb.id as bid_id, sb.total_cost
                     FROM suppliers s
                     JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                     JOIN supplier_bids sb ON s.id = sb.supplier_id
                     WHERE s.id IN (${supplierIds}) AND sb.tender_id = ? AND s.status = 'approved'`,
                    [tenderId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            // Send emails and create award records
            let successfulSends = 0;
            let failedSends = 0;

            for (const recipient of recipients) {
                // Insert recipient record
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO letter_recipients 
                        (letter_id, supplier_id, supplier_email, supplier_name, email_status)
                        VALUES (?, ?, ?, ?, 'pending')`,
                        [letterId, recipient.id, recipient.business_email, recipient.business_name],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Create supplier award record
                const awardAmount = awardDetails[recipient.id]?.amount || recipient.total_cost;
                const awardedItems = JSON.stringify(awardDetails[recipient.id]?.items || []);

                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO supplier_awards 
                        (tender_id, supplier_id, bid_id, award_letter_id, award_amount, awarded_items)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        [tenderId, recipient.id, recipient.bid_id, letterId, awardAmount, awardedItems],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Send email
                try {
                    await sendLetterOfAwardEmail(
                        recipient.business_email,
                        recipient.business_name,
                        recipient.contact_person_name,
                        letterTitle,
                        letterContent,
                        letterFile.path,
                        letterFile.originalname,
                        awardAmount
                    );

                    // Update recipient status to sent
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE letter_recipients 
                            SET email_status = 'sent', sent_at = CURRENT_TIMESTAMP
                            WHERE letter_id = ? AND supplier_id = ?`,
                            [letterId, recipient.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    successfulSends++;
                } catch (emailError) {
                    console.error(`Failed to send award letter to ${recipient.business_email}:`, emailError);
                    
                    // Update recipient status to failed
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE letter_recipients 
                            SET email_status = 'failed', error_message = ?
                            WHERE letter_id = ? AND supplier_id = ?`,
                            [emailError.message, letterId, recipient.id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });

                    failedSends++;
                }
            }

            // Update tender status to awarded
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE demand_tenders SET tender_status = ?, awarded_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['awarded', tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Update letter statistics
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE tender_letters 
                    SET total_recipients = ?, successful_sends = ?, failed_sends = ?
                    WHERE id = ?`,
                    [recipients.length, successfulSends, failedSends, letterId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({
                message: 'Letter of award sent successfully',
                letterId: letterId,
                totalRecipients: recipients.length,
                successfulSends: successfulSends,
                failedSends: failedSends
            });

        } catch (error) {
            // Rollback transaction
            await new Promise((resolve, reject) => {
                db.run('ROLLBACK', (err) => {
                    if (err) console.error('Rollback error:', err);
                    resolve();
                });
            });
            throw error;
        }

    } catch (error) {
        console.error('Error sending letter of award:', error);
        res.status(500).json({ error: 'Failed to send letter of award' });
    }
};

// Get all letters sent by purchase department
const getAllLetters = async (req, res) => {
    try {
        const db = getDatabase();
        
        const query = `
            SELECT 
                tl.id,
                tl.tender_id,
                tl.letter_type,
                tl.letter_title,
                tl.letter_file_path,
                tl.letter_original_name,
                tl.sent_to,
                tl.sent_at,
                tl.total_recipients,
                tl.successful_sends,
                tl.failed_sends,
                dt.tender_number,
                d.item_name as tender_title,
                u.name as sent_by_name
            FROM tender_letters tl
            JOIN demand_tenders dt ON tl.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN users u ON tl.sent_by = u.id
            ORDER BY tl.sent_at DESC
        `;

        db.all(query, [], (err, letters) => {
            if (err) {
                console.error('Error fetching letters:', err);
                return res.status(500).json({ error: 'Failed to fetch letters' });
            }

            res.json(letters);
        });
    } catch (error) {
        console.error('Error in getAllLetters:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get letter details with recipients
const getLetterDetails = async (req, res) => {
    try {
        const { letterId } = req.params;
        const db = getDatabase();

        // Get letter details
        const letter = await new Promise((resolve, reject) => {
            db.get(
                `SELECT tl.*, dt.tender_number, d.item_name as tender_title, u.name as sent_by_name
                 FROM tender_letters tl
                 JOIN demand_tenders dt ON tl.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN users u ON tl.sent_by = u.id
                 WHERE tl.id = ?`,
                [letterId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }

        // Get recipients
        const recipients = await new Promise((resolve, reject) => {
            db.all(
                `SELECT lr.*, s.status as supplier_status
                 FROM letter_recipients lr
                 LEFT JOIN suppliers s ON lr.supplier_id = s.id
                 WHERE lr.letter_id = ?
                 ORDER BY lr.sent_at DESC`,
                [letterId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({
            letter,
            recipients
        });
    } catch (error) {
        console.error('Error in getLetterDetails:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Download letter file
const downloadLetter = async (req, res) => {
    try {
        const { letterId } = req.params;
        const db = getDatabase();

        const letter = await new Promise((resolve, reject) => {
            db.get(
                'SELECT letter_file_path, letter_original_name FROM tender_letters WHERE id = ?',
                [letterId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }

        const filePath = path.join(__dirname, '../../tender-letters', letter.letter_file_path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Letter file not found on server' });
        }

        res.download(filePath, letter.letter_original_name);
    } catch (error) {
        console.error('Error downloading letter:', error);
        res.status(500).json({ error: 'Failed to download letter' });
    }
};

// Helper function to send letter of intent email
const sendLetterOfIntentEmail = async (email, companyName, contactPerson, letterTitle, letterContent, filePath, originalName, letterId, supplierId) => {
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; }
                .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; }
                .button { background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Letter of Intent - RIC E-Tender System</h1>
            </div>
            <div class="content">
                <p>Dear ${contactPerson || 'Sir/Madam'},</p>
                <p>We are pleased to inform you that your company <strong>${companyName}</strong> has been shortlisted for the following tender:</p>
                
                <h3>${letterTitle}</h3>
                
                ${letterContent ? `<div style="background-color: #f9fafb; padding: 20px; margin: 20px 0; border-left: 4px solid #2563eb;">
                    <p>${letterContent}</p>
                </div>` : ''}
                
                <p>Please find the detailed Letter of Intent attached to this email.</p>
                
                <p>This letter indicates our intention to potentially award you the contract based on your technical and financial evaluation. Please review the attached document carefully.</p>
                
                <p>For any queries, please contact our procurement department.</p>
                
                <p>Best regards,<br>
                <strong>Purchase Department</strong><br>
                RIC E-Tender System</p>
            </div>
            <div class="footer">
                <p>This is an automated email from RIC E-Tender System. Please do not reply to this email.</p>
            </div>
        </body>
        </html>
    `;

    const mailOptions = {
        from: {
            name: process.env.EMAIL_FROM_NAME || 'RIC E-Tender System',
            address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
        },
        to: email,
        subject: `Letter of Intent - ${letterTitle}`,
        html: htmlContent,
        attachments: [
            {
                filename: originalName,
                path: filePath
            }
        ]
    };

    return await emailService.transporter.sendMail(mailOptions);
};

// Helper function to send letter of award email
const sendLetterOfAwardEmail = async (email, companyName, contactPerson, letterTitle, letterContent, filePath, originalName, awardAmount) => {
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
                .content { padding: 30px; }
                .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; }
                .award-box { background-color: #ecfdf5; border: 2px solid #059669; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
                .amount { font-size: 24px; font-weight: bold; color: #059669; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎉 Congratulations! Contract Awarded 🎉</h1>
            </div>
            <div class="content">
                <p>Dear ${contactPerson || 'Sir/Madam'},</p>
                
                <div class="award-box">
                    <h2>CONTRACT AWARDED</h2>
                    <p><strong>${companyName}</strong> has been selected for:</p>
                    <h3>${letterTitle}</h3>
                    ${awardAmount ? `<p class="amount">Award Amount: Rs ${Number(awardAmount).toLocaleString()}</p>` : ''}
                </div>
                
                ${letterContent ? `<div style="background-color: #f9fafb; padding: 20px; margin: 20px 0; border-left: 4px solid #059669;">
                    <p>${letterContent}</p>
                </div>` : ''}
                
                <p>Please find the official Letter of Award attached to this email.</p>
                
                <p><strong>Next Steps:</strong></p>
                <ul>
                    <li>Review the attached Letter of Award carefully</li>
                    <li>Contact our procurement department to finalize contract details</li>
                    <li>Prepare for contract signing and project commencement</li>
                </ul>
                
                <p>We look forward to a successful partnership with your company.</p>
                
                <p>Best regards,<br>
                <strong>Purchase Department</strong><br>
                RIC E-Tender System</p>
            </div>
            <div class="footer">
                <p>This is an automated email from RIC E-Tender System. Please do not reply to this email.</p>
            </div>
        </body>
        </html>
    `;

    const mailOptions = {
        from: {
            name: process.env.EMAIL_FROM_NAME || 'RIC E-Tender System',
            address: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER
        },
        to: email,
        subject: `🎉 Contract Awarded - ${letterTitle}`,
        html: htmlContent,
        attachments: [
            {
                filename: originalName,
                path: filePath
            }
        ]
    };

    return await emailService.transporter.sendMail(mailOptions);
};

// Get approved suppliers for a specific tender (for Intent selection)
const getSuppliersForIntent = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const db = getDatabase();
        
        console.log(`Fetching approved suppliers for tender ${tenderId} for Intent selection...`);
        console.log('Database object:', db ? 'Available' : 'Not available');
        
        const query = `
            SELECT DISTINCT
                s.id,
                sbp.business_name as company_name,
                s.business_email as email,
                sbp.contact_person_name as contact_person,
                sbp.business_mobile_number as phone,
                te.status as evaluation_status
            FROM suppliers s
            LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
            JOIN supplier_bids sb ON s.id = sb.supplier_id
            JOIN technical_evaluations te ON sb.id = te.bid_id
            WHERE sb.tender_id = ?
            AND te.status = 'approved'
            AND s.status = 'approved'
            ORDER BY sbp.business_name ASC
        `;

        console.log('Query to execute:', query);
        console.log('Tender ID parameter:', tenderId);

        const suppliers = await new Promise((resolve, reject) => {
            db.all(query, [tenderId], (err, rows) => {
                if (err) {
                    console.error('Database error fetching suppliers for Intent:', err);
                    reject(err);
                } else {
                    console.log('Raw database result:', rows);
                    resolve(rows || []);
                }
            });
        });

        console.log(`Found ${suppliers.length} approved suppliers for Intent selection`);
        
        res.json(suppliers);
    } catch (error) {
        console.error('Error fetching suppliers for Intent:', error);
        res.status(500).json({ 
            error: 'Failed to fetch suppliers for Intent', 
            details: error.message 
        });
    }
};

module.exports = {
    getTendersReadyForLetterOfIntent,
    sendLetterOfIntent,
    getSuppliersWithLetterOfIntent,
    sendLetterOfAward,
    getAllLetters,
    getLetterDetails,
    downloadLetter,
    getSuppliersForIntent
};

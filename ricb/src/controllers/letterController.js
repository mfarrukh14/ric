const { getDatabase, dbAll, dbGet, dbRun } = require('../db');
const path = require('path');
const fs = require('fs');
const EmailService = require('../utils/emailService');


// Supplier ids arrive from the client (JSON or form fields): keep only positive integers
// and bind them as parameters instead of splicing them into SQL.
const toIdList = (ids) => [...new Set([].concat(ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
const placeholders = (list) => list.map(() => '?').join(', ') || 'NULL';

const emailService = new EmailService();

// Get tenders ready for letter of intent (after financial opening)
const getTendersReadyForLetterOfIntent = async (req, res) => {
    try {
        const db = getDatabase();
        
        
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
            GROUP BY dt.id, dt.tender_number, dt.demand_id, dt.tender_status,
                d.item_name, d.description, u.name,
                fo.opened_at, fo.opened_by, fo.status,
                tl_intent.id, tl_intent.sent_at
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
                simpleTenders.forEach(tender => {
                });
            }
        });

        db.all(query, [], (err, tenders) => {
            if (err) {
                console.error('Error fetching tenders ready for letter of intent:', err);
                return res.status(500).json({ error: 'Failed to fetch tenders' });
            }

            tenders.forEach(tender => {
            });

            res.json(tenders);
        });
    } catch (error) {
        console.error('Error in getTendersReadyForLetterOfIntent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/** Letters may only go out once the tender's financial bids have been opened. */
const financiallyOpened = async (tenderId) =>
    Boolean(await dbGet("SELECT id FROM financial_openings WHERE tender_id = ? AND status = 'opened'", [tenderId]));

// Send letter of intent
const sendLetterOfIntent = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { letterTitle, letterContent, sendTo } = req.body;
        let { selectedSuppliers } = req.body;
        const userId = req.user.id;

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

        if (!(await financiallyOpened(tenderId))) {
            return res.status(409).json({ error: 'Open the financial bids before sending letters' });
        }

        const letterFile = req.file;
        if (!letterFile) {
            return res.status(400).json({ error: 'Letter file is required' });
        }

        {
            // Insert letter record
            const letterId = await dbRun(`INSERT INTO tender_letters
            (tender_id, letter_type, letter_title, letter_content, letter_file_path, letter_original_name, sent_to, sent_by)
            VALUES (?, 'intent', ?, ?, ?, ?, ?, ?)`, [tenderId, letterTitle, letterContent, letterFile.filename, letterFile.originalname, sendTo, userId]).then(result => result.lastID);

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
                const supplierIds = toIdList(selectedSuppliers);
                recipientQuery = `
                    SELECT DISTINCT s.id, s.business_email, sbp.business_name, sbp.contact_person_name
                    FROM suppliers s
                    JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                    WHERE s.id IN (${placeholders(supplierIds)}) AND s.status = 'approved'
                `;
                queryParams = supplierIds;
            }

            const recipients = await dbAll(recipientQuery, queryParams);

            if (recipients.length === 0) {
                throw new Error('No eligible recipients found');
            }

            // Insert recipients and send emails
            let successfulSends = 0;
            let failedSends = 0;
            const emailPromises = [];

            for (const recipient of recipients) {
                // Insert recipient record
                await dbRun(`INSERT INTO letter_recipients 
                (letter_id, supplier_id, supplier_email, supplier_name, email_status)
                VALUES (?, ?, ?, ?, 'pending')`, [letterId, recipient.id, recipient.business_email, recipient.business_name]);

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
            await dbRun(`UPDATE tender_letters 
            SET total_recipients = ?, successful_sends = ?, failed_sends = ?
            WHERE id = ?`, [recipients.length, successfulSends, failedSends, letterId]);

            // Update recipient statuses based on email results
            for (let i = 0; i < emailResults.length; i++) {
                const result = emailResults[i];
                const recipient = recipients[i];
                
                await dbRun(`UPDATE letter_recipients 
                SET email_status = ?, sent_at = CURRENT_TIMESTAMP, error_message = ?
                WHERE letter_id = ? AND supplier_id = ?`, [result.success ? 'sent' : 'failed', result.error || null, letterId, recipient.id]);
            }

            res.json({
                message: 'Letter of intent sent successfully',
                letterId: letterId,
                totalRecipients: recipients.length,
                successfulSends: successfulSends,
                failedSends: failedSends,
                emailResults: emailResults
            });
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

        // Do not allow queuing/sending award letters multiple times
        const tenderRow = await dbGet('SELECT tender_status FROM demand_tenders WHERE id = ?', [tenderId]);

        if (tenderRow?.tender_status === 'awarded') {
            return res.status(409).json({
                error: 'Tender is already awarded; cannot send another Letter of Award.'
            });
        }

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

        if (!(await financiallyOpened(tenderId))) {
            return res.status(409).json({ error: 'Open the financial bids before sending letters' });
        }

        const letterFile = req.file;
        if (!letterFile) {
            return res.status(400).json({ error: 'Letter file is required' });
        }

        if (!selectedSuppliers || selectedSuppliers.length === 0) {
            return res.status(400).json({ error: 'At least one supplier must be selected for award' });
        }

        {
            // Insert letter record (PENDING: do not send emails until Finance workflow finishes)
            const letterId = await dbRun(`INSERT INTO tender_letters
            (tender_id, letter_type, letter_title, letter_content, letter_file_path, letter_original_name, sent_to, sent_by, sent_at)
            VALUES (?, 'award', ?, ?, ?, ?, 'selected', ?, NULL)`, [tenderId, letterTitle, letterContent, letterFile.filename, letterFile.originalname, userId]).then(result => result.lastID);

            // Get selected suppliers details
            
            if (!Array.isArray(selectedSuppliers) || selectedSuppliers.length === 0) {
                throw new Error('Invalid or empty selectedSuppliers array');
            }
            
            const supplierIds = toIdList(selectedSuppliers);
            
            const recipients = await dbAll(
                `SELECT DISTINCT s.id, s.business_email, sbp.business_name, sbp.contact_person_name,
                 sb.id as bid_id, sb.total_cost
                 FROM suppliers s
                 JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 JOIN supplier_bids sb ON s.id = sb.supplier_id
                 WHERE s.id IN (${placeholders(supplierIds)}) AND sb.tender_id = ? AND s.status = 'approved'`,
                [...supplierIds, tenderId]
            );

            // Create recipients + award records and send emails immediately
            let successfulSends = 0;
            let failedSends = 0;

            // Get letter file path for email attachments
            const letterFilePath = path.join(__dirname, '../../tender-letters', letterFile.filename);

            for (const recipient of recipients) {
                // Insert recipient record
                await dbRun(`INSERT INTO letter_recipients 
                (letter_id, supplier_id, supplier_email, supplier_name, email_status)
                VALUES (?, ?, ?, ?, 'pending')`, [letterId, recipient.id, recipient.business_email, recipient.business_name]);

                // Create supplier award record
                const awardAmount = awardDetails[recipient.id]?.amount || recipient.total_cost;
                const awardedItems = JSON.stringify(awardDetails[recipient.id]?.items || []);

                await dbRun(`INSERT INTO supplier_awards 
                (tender_id, supplier_id, bid_id, award_letter_id, award_amount, awarded_items)
                VALUES (?, ?, ?, ?, ?, ?)`, [tenderId, recipient.id, recipient.bid_id, letterId, awardAmount, awardedItems]);

                // Send email immediately
                try {
                    await sendLetterOfAwardEmail(
                        recipient.business_email,
                        recipient.business_name,
                        recipient.contact_person_name,
                        letterTitle,
                        letterContent,
                        letterFilePath,
                        letterFile.originalname,
                        awardAmount
                    );

                    // Update recipient status to sent
                    await dbRun(`UPDATE letter_recipients 
                     SET email_status = 'sent', sent_at = CURRENT_TIMESTAMP, error_message = NULL
                     WHERE letter_id = ? AND supplier_id = ?`, [letterId, recipient.id]);

                    successfulSends++;
                } catch (emailError) {
                    console.error(`Failed to send award email to ${recipient.business_email}:`, emailError);

                    // Update recipient status to failed
                    await dbRun(`UPDATE letter_recipients 
                     SET email_status = 'failed', error_message = ?
                     WHERE letter_id = ? AND supplier_id = ?`, [emailError.message, letterId, recipient.id]);

                    failedSends++;
                }
            }

            // Update tender status to awarded (direct award without Finance pending)
            await dbRun(
                'UPDATE demand_tenders SET tender_status = ?, awarded_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['awarded', tenderId]
            );
            
            // Update letter sent_at timestamp
            await dbRun(
                'UPDATE tender_letters SET sent_at = CURRENT_TIMESTAMP WHERE id = ?',
                [letterId]
            );

            // Update letter statistics
            await dbRun(`UPDATE tender_letters 
            SET total_recipients = ?, successful_sends = ?, failed_sends = ?
            WHERE id = ?`, [recipients.length, successfulSends, failedSends, letterId]);

            // Send contingent bill data to Finance module for each awarded supplier
            const financeIntegrationResults = [];
            for (const recipient of recipients) {
                const awardAmount = awardDetails[recipient.id]?.amount || recipient.total_cost;
                
                // Get tender details for Finance module
                const tenderDetails = await dbGet(`SELECT dt.tender_number, d.item_name, d.description 
                 FROM demand_tenders dt 
                 JOIN demands d ON dt.demand_id = d.id 
                 WHERE dt.id = ?`, [tenderId]);

                try {
                    // Send to Finance module
                    const financeResponse = await fetch('http://localhost:5000/api/contingentbill/contingent-bills/from-eproc', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            // IMPORTANT: must match Finance DTO (EprocContingentBillDto)
                            tenderId: tenderId,
                            supplierName: recipient.business_name,
                            tenderTitle: tenderDetails?.item_name || tenderDetails?.description,
                            letterOfAwardNumber: String(letterId),
                            totalAmount: awardAmount
                        })
                    });

                    if (financeResponse.ok) {
                        const financeData = await financeResponse.json();
                        financeIntegrationResults.push({
                            supplierId: recipient.id,
                            success: true,
                            billNumber: financeData.billNumber
                        });
                    } else {
                        const errorData = await financeResponse.text();
                        console.error(`Failed to create contingent bill in Finance for supplier ${recipient.id}:`, errorData);
                        financeIntegrationResults.push({
                            supplierId: recipient.id,
                            success: false,
                            error: errorData
                        });
                    }
                } catch (financeError) {
                    console.error(`Error calling Finance module for supplier ${recipient.id}:`, financeError.message);
                    financeIntegrationResults.push({
                        supplierId: recipient.id,
                        success: false,
                        error: financeError.message
                    });
                }
            }

            res.json({
                message: 'Letter of Award sent successfully to all selected suppliers.',
                letterId: letterId,
                totalRecipients: recipients.length,
                successfulSends: successfulSends,
                failedSends: failedSends,
                financeIntegration: financeIntegrationResults
            });
        }

    } catch (error) {
        console.error('Error sending letter of award:', error);
        res.status(500).json({ error: 'Failed to send letter of award' });
    }
};

// Finance callback: finalize sending Letter of Award after Asaan Cheque approval
const finalizeLetterOfAwardFromFinance = async (req, res) => {
    try {
        const { tenderId, letterOfAwardNumber } = req.body || {};

        const parsedTenderId = parseInt(String(tenderId), 10);
        const parsedLetterId = parseInt(String(letterOfAwardNumber), 10);

        if (!Number.isFinite(parsedTenderId) || !Number.isFinite(parsedLetterId)) {
            return res.status(400).json({ error: 'tenderId and letterOfAwardNumber are required' });
        }

        const letter = await dbGet(
            `SELECT * FROM tender_letters WHERE id = ? AND tender_id = ? AND letter_type = 'award'`,
            [parsedLetterId, parsedTenderId]
        );

        if (!letter) {
            return res.status(404).json({ error: 'Award letter not found' });
        }

        const pendingRecipients = await dbAll(
            `SELECT * FROM letter_recipients WHERE letter_id = ? AND email_status IN ('pending', 'failed')`,
            [parsedLetterId]
        );

        if (pendingRecipients.length === 0) {
            return res.json({
                message: 'No pending recipients; award letter already finalized',
                letterId: parsedLetterId,
                tenderId: parsedTenderId,
                sent: 0,
                failed: 0
            });
        }

        const letterFilePath = letter.letter_file_path
            ? path.join(__dirname, '../../tender-letters', letter.letter_file_path)
            : null;

        if (!letterFilePath || !fs.existsSync(letterFilePath)) {
            return res.status(400).json({ error: 'Stored letter file not found for this award letter' });
        }

        let successfulSends = 0;
        let failedSends = 0;

        for (const recipient of pendingRecipients) {
            // Fetch award amount for email context
            const awardRow = await dbGet(
                `SELECT award_amount FROM supplier_awards WHERE tender_id = ? AND supplier_id = ?`,
                [parsedTenderId, recipient.supplier_id]
            );
            const awardAmount = awardRow?.award_amount;

            try {
                await sendLetterOfAwardEmail(
                    recipient.supplier_email,
                    recipient.supplier_name,
                    null,
                    letter.letter_title,
                    letter.letter_content,
                    letterFilePath,
                    letter.letter_original_name,
                    awardAmount
                );

                await dbRun(`UPDATE letter_recipients 
                 SET email_status = 'sent', sent_at = CURRENT_TIMESTAMP, error_message = NULL
                 WHERE letter_id = ? AND supplier_id = ?`, [parsedLetterId, recipient.supplier_id]);

                successfulSends++;
            } catch (emailError) {
                console.error(`Finance-finalize: failed to send award letter to ${recipient.supplier_email}:`, emailError);

                await dbRun(`UPDATE letter_recipients 
                 SET email_status = 'failed', error_message = ?
                 WHERE letter_id = ? AND supplier_id = ?`, [emailError.message, parsedLetterId, recipient.supplier_id]);

                failedSends++;
            }
        }

        // Mark as actually sent now
        await dbRun(`UPDATE tender_letters
         SET sent_at = CURRENT_TIMESTAMP,
             successful_sends = successful_sends + ?,
             failed_sends = failed_sends + ?
         WHERE id = ?`, [successfulSends, failedSends, parsedLetterId]);

        // Finalize tender status
        await dbRun(
            'UPDATE demand_tenders SET tender_status = ?, awarded_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['awarded', parsedTenderId]
        );

        return res.json({
            message: 'Award letter finalized and sent',
            letterId: parsedLetterId,
            tenderId: parsedTenderId,
            sent: successfulSends,
            failed: failedSends
        });
    } catch (error) {
        console.error('Error in finalizeLetterOfAwardFromFinance:', error);
        res.status(500).json({ error: 'Failed to finalize letter of award' });
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

        // Get letter details
        const letter = await dbGet(
            `SELECT tl.*, dt.tender_number, d.item_name as tender_title, u.name as sent_by_name
             FROM tender_letters tl
             JOIN demand_tenders dt ON tl.tender_id = dt.id
             JOIN demands d ON dt.demand_id = d.id
             LEFT JOIN users u ON tl.sent_by = u.id
             WHERE tl.id = ?`,
            [letterId]
        );

        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }

        // Get recipients
        const recipients = await dbAll(`SELECT lr.*, s.status as supplier_status
         FROM letter_recipients lr
         LEFT JOIN suppliers s ON lr.supplier_id = s.id
         WHERE lr.letter_id = ?
         ORDER BY lr.sent_at DESC`, [letterId]);

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

        const letter = await dbGet(
            'SELECT letter_file_path, letter_original_name FROM tender_letters WHERE id = ?',
            [letterId]
        );

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

// Letter emails live in the email service; these keep the controller's call sites unchanged.
const sendLetterOfIntentEmail = (email, companyName, contactPerson, letterTitle, letterContent, filePath, originalName) =>
    emailService.sendLetterOfIntentEmail({ to: email, companyName, contactPerson, letterTitle, letterContent, filePath, fileName: originalName });

const sendLetterOfAwardEmail = (email, companyName, contactPerson, letterTitle, letterContent, filePath, originalName, awardAmount) =>
    emailService.sendLetterOfAwardEmail({ to: email, companyName, contactPerson, letterTitle, letterContent, filePath, fileName: originalName, awardAmount });

// Get approved suppliers for a specific tender (for Intent selection)
const getSuppliersForIntent = async (req, res) => {
    try {
        const { tenderId } = req.params;
        
        
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

        const suppliers = await dbAll(query, [tenderId]);

        
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
    finalizeLetterOfAwardFromFinance,
    getAllLetters,
    getLetterDetails,
    downloadLetter,
    getSuppliersForIntent
};

const { dbAll, dbGet, dbRun } = require('../db');
const path = require('path');
const fs = require('fs');
const { createUpload, MIME } = require('../middleware/uploads');


// Market survey evidence: quotations, catalogues, photos.
const uploadDocuments = createUpload({
    dir: 'uploads/market-survey',
    prefix: 'market-survey-doc',
    maxSize: 20 * 1024 * 1024,
    accept: [...MIME.pdf, ...MIME.word, ...MIME.image, ...MIME.spreadsheet],
    typeError: 'Only PDF, Word, Excel or image files are allowed.',
}).array('documents', 10);

// Get all active tenders for market survey
const getActiveTenders = async (req, res) => {
    try {
        const tenders = await dbAll(`
            SELECT 
                dt.id,
                dt.bidding_end_time,
                dt.tender_status as status,
                d.item_name,
                d.description,
                d.quantity,
                ms.status as survey_status,
                ms.sent_at as survey_sent_at,
                ms.completed_at as survey_completed_at
            FROM demand_tenders dt
            JOIN demands d ON dt.demand_id = d.id
            LEFT JOIN market_surveys ms ON dt.id = ms.tender_id
            WHERE dt.tender_status = 'active' 
            ORDER BY dt.created_at DESC
        `, []);

        res.json({
            success: true,
            data: tenders
        });
    } catch (error) {
        console.error('Error fetching active tenders for market survey:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch active tenders' 
        });
    }
};

// Send tender for market survey
const sendForMarketSurvey = (req, res) => {
    uploadDocuments(req, res, async (err) => {
        if (err) {
            console.error('File upload error:', err);
            return res.status(400).json({ 
                success: false, 
                message: err.message || 'File upload failed' 
            });
        }

        try {
            const { tenderId } = req.params;
            const { notes } = req.body;
            const userId = req.user.id;

            // Check if tender exists and is active
            const tender = await dbGet(`
                SELECT dt.*, d.item_name, d.description
                FROM demand_tenders dt
                JOIN demands d ON dt.demand_id = d.id
                WHERE dt.id = ? AND dt.tender_status = 'active'
            `, [tenderId]);

            if (!tender) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Active tender not found' 
                });
            }

            // Check if market survey already exists for this tender
            const existingSurvey = await dbGet('SELECT id FROM market_surveys WHERE tender_id = ?', [tenderId]);

            if (existingSurvey) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Market survey already exists for this tender' 
                });
            }

            // Create market survey record
            const surveyId = await dbRun(`
                INSERT INTO market_surveys (
                    tender_id, 
                    sent_by, 
                    status, 
                    notes
                ) VALUES (?, ?, 'pending', ?)
            `, [tenderId, userId, notes || '']).then(result => result.lastID);

            // Save uploaded documents
            if (req.files && req.files.length > 0) {
                const documentPromises = req.files.map(file => {
                    return dbRun(`
                        INSERT INTO market_survey_documents (
                            survey_id,
                            document_type,
                            filename,
                            original_filename,
                            file_path,
                            uploaded_by
                        ) VALUES (?, 'supporting', ?, ?, ?, ?)
                    `, [
                        surveyId,
                        file.filename,
                        file.originalname,
                        file.path,
                        userId
                    ]);
                });

                await Promise.all(documentPromises);
            }

            res.json({
                success: true,
                message: 'Tender sent for market survey successfully',
                data: {
                    surveyId,
                    tenderId,
                    documentsUploaded: req.files ? req.files.length : 0
                }
            });

        } catch (error) {
            console.error('Error sending tender for market survey:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to send tender for market survey' 
            });
        }
    });
};

// Get tenders for market survey committee
const getTendersForSurvey = async (req, res) => {
    try {
        const surveys = await dbAll(`
            SELECT 
                ms.id as survey_id,
                ms.tender_id,
                ms.status as survey_status,
                ms.sent_at,
                ms.completed_at,
                ms.notes,
                dt.bidding_end_time,
                d.item_name,
                d.description,
                d.quantity,
                u.name as sent_by_name
            FROM market_surveys ms
            JOIN demand_tenders dt ON ms.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            JOIN users u ON ms.sent_by = u.id
            WHERE ms.status IN ('pending', 'completed')
            ORDER BY ms.sent_at DESC
        `, []);

        // Get documents for each survey
        for (let survey of surveys) {
            const documents = await dbAll(`
                SELECT 
                    id,
                    document_type,
                    filename,
                    original_filename,
                    uploaded_at,
                    uploaded_by
                FROM market_survey_documents 
                WHERE survey_id = ?
                ORDER BY uploaded_at DESC
            `, [survey.survey_id]);
            survey.documents = documents;
        }

        res.json({
            success: true,
            data: surveys
        });
    } catch (error) {
        console.error('Error fetching tenders for market survey:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch tenders for market survey' 
        });
    }
};

// Submit market survey evaluation
const submitEvaluation = (req, res) => {
    uploadDocuments(req, res, async (err) => {
        if (err) {
            console.error('File upload error:', err);
            return res.status(400).json({ 
                success: false, 
                message: err.message || 'File upload failed' 
            });
        }

        try {
            const { surveyId } = req.params;
            const { evaluationNotes } = req.body;
            const userId = req.user.id;

            // Check if survey exists and is pending
            const survey = await dbGet(`
                SELECT ms.*, d.item_name
                FROM market_surveys ms
                JOIN demand_tenders dt ON ms.tender_id = dt.id
                JOIN demands d ON dt.demand_id = d.id
                WHERE ms.id = ? AND ms.status = 'pending'
            `, [surveyId]);

            if (!survey) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Pending market survey not found' 
                });
            }

            // Update survey as completed
            await dbRun(`
                UPDATE market_surveys 
                SET status = 'completed',
                    completed_at = CURRENT_TIMESTAMP,
                    completed_by = ?,
                    notes = ?
                WHERE id = ?
            `, [userId, evaluationNotes || survey.notes, surveyId]);

            // Save evaluation documents
            if (req.files && req.files.length > 0) {
                const documentPromises = req.files.map(file => {
                    return dbRun(`
                        INSERT INTO market_survey_documents (
                            survey_id,
                            document_type,
                            filename,
                            original_filename,
                            file_path,
                            uploaded_by
                        ) VALUES (?, 'evaluation', ?, ?, ?, ?)
                    `, [
                        surveyId,
                        file.filename,
                        file.originalname,
                        file.path,
                        userId
                    ]);
                });

                await Promise.all(documentPromises);
            }

            res.json({
                success: true,
                message: 'Market survey evaluation submitted successfully',
                data: {
                    surveyId,
                    tenderId: survey.tender_id,
                    documentsUploaded: req.files ? req.files.length : 0
                }
            });
        } catch (error) {
            console.error('Error submitting market survey evaluation:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to submit market survey evaluation' 
            });
        }
    });
};

// Get completed market surveys for Purchase Department
const getCompletedSurveys = async (req, res) => {
    try {
        const surveys = await dbAll(`
            SELECT 
                ms.id as survey_id,
                ms.tender_id,
                ms.status as survey_status,
                ms.sent_at,
                ms.completed_at,
                ms.notes,
                dt.bidding_end_time,
                d.item_name,
                d.description,
                d.quantity,
                u1.name as sent_by_name,
                u2.name as completed_by_name
            FROM market_surveys ms
            JOIN demand_tenders dt ON ms.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            JOIN users u1 ON ms.sent_by = u1.id
            LEFT JOIN users u2 ON ms.completed_by = u2.id
            WHERE ms.status = 'completed'
            ORDER BY ms.completed_at DESC
        `, []);

        // Get documents for each survey
        for (let survey of surveys) {
            const documents = await dbAll(`
                SELECT 
                    id,
                    document_type,
                    filename,
                    original_filename,
                    uploaded_at,
                    uploaded_by
                FROM market_survey_documents 
                WHERE survey_id = ?
                ORDER BY document_type, uploaded_at DESC
            `, [survey.survey_id]);
            survey.documents = documents;
        }

        res.json({
            success: true,
            data: surveys
        });
    } catch (error) {
        console.error('Error fetching completed market surveys:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch completed market surveys' 
        });
    }
};

const downloadDocument = async (req, res) => {
    try {
        const { documentId } = req.params;

        const document = await dbGet(`
            SELECT filename, original_filename, file_path
            FROM market_survey_documents 
            WHERE id = ?
        `, [documentId]);

        if (!document) {
            return res.status(404).json({ 
                success: false, 
                message: 'Document not found' 
            });
        }

        const filePath = path.resolve(document.file_path);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ 
                success: false, 
                message: 'File not found on server' 
            });
        }

        res.download(filePath, document.original_filename);
    } catch (error) {
        console.error('Error downloading market survey document:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to download document' 
        });
    }
};

module.exports = {
    getActiveTenders,
    sendForMarketSurvey,
    getTendersForSurvey,
    submitEvaluation,
    getCompletedSurveys,
    downloadDocument
};

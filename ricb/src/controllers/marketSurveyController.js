const { getDatabase } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for market survey documents upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/market-survey';
        try {
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
                console.log(`Created market survey directory: ${uploadDir}`);
            }
            cb(null, uploadDir);
        } catch (error) {
            console.error('Error creating market survey directory:', error);
            cb(error, null);
        }
    },
    filename: function (req, file, cb) {
        try {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const filename = 'market-survey-doc-' + uniqueSuffix + path.extname(file.originalname);
            cb(null, filename);
        } catch (error) {
            console.error('Error generating filename for market survey document:', error);
            cb(error, null);
        }
    }
});

const uploadDocuments = multer({
    storage: storage,
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB limit per file
    }
}).array('documents', 10); // Allow up to 10 files

// Get all active tenders for market survey
const getActiveTenders = async (req, res) => {
    try {
        const db = getDatabase();

        const tenders = await new Promise((resolve, reject) => {
            db.all(`
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
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

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
            const db = getDatabase();

            console.log('Sending tender for market survey:', tenderId);

            // Check if tender exists and is active
            const tender = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT dt.*, d.item_name, d.description
                    FROM demand_tenders dt
                    JOIN demands d ON dt.demand_id = d.id
                    WHERE dt.id = ? AND dt.tender_status = 'active'
                `, [tenderId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!tender) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Active tender not found' 
                });
            }

            // Check if market survey already exists for this tender
            const existingSurvey = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT id FROM market_surveys WHERE tender_id = ?',
                    [tenderId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (existingSurvey) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Market survey already exists for this tender' 
                });
            }

            // Create market survey record
            const surveyId = await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO market_surveys (
                        tender_id, 
                        sent_by, 
                        status, 
                        notes
                    ) VALUES (?, ?, 'pending', ?)
                `, [tenderId, userId, notes || ''], function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
            });

            // Save uploaded documents
            if (req.files && req.files.length > 0) {
                const documentPromises = req.files.map(file => {
                    return new Promise((resolve, reject) => {
                        db.run(`
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
                        ], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
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
        const db = getDatabase();

        const surveys = await new Promise((resolve, reject) => {
            db.all(`
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
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get documents for each survey
        for (let survey of surveys) {
            const documents = await new Promise((resolve, reject) => {
                db.all(`
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
                `, [survey.survey_id], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
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
            const db = getDatabase();

            console.log('Submitting market survey evaluation:', surveyId);

            // Check if survey exists and is pending
            const survey = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT ms.*, d.item_name
                    FROM market_surveys ms
                    JOIN demand_tenders dt ON ms.tender_id = dt.id
                    JOIN demands d ON dt.demand_id = d.id
                    WHERE ms.id = ? AND ms.status = 'pending'
                `, [surveyId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!survey) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Pending market survey not found' 
                });
            }

            // Update survey as completed
            await new Promise((resolve, reject) => {
                db.run(`
                    UPDATE market_surveys 
                    SET status = 'completed',
                        completed_at = CURRENT_TIMESTAMP,
                        completed_by = ?,
                        notes = ?
                    WHERE id = ?
                `, [userId, evaluationNotes || survey.notes, surveyId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Save evaluation documents
            if (req.files && req.files.length > 0) {
                const documentPromises = req.files.map(file => {
                    return new Promise((resolve, reject) => {
                        db.run(`
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
                        ], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
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
        const db = getDatabase();

        const surveys = await new Promise((resolve, reject) => {
            db.all(`
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
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get documents for each survey
        for (let survey of surveys) {
            const documents = await new Promise((resolve, reject) => {
                db.all(`
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
                `, [survey.survey_id], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
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
        const db = getDatabase();

        const document = await new Promise((resolve, reject) => {
            db.get(`
                SELECT filename, original_filename, file_path
                FROM market_survey_documents 
                WHERE id = ?
            `, [documentId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

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

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    getActiveTenders,
    sendForMarketSurvey,
    getTendersForSurvey,
    submitEvaluation,
    getCompletedSurveys,
    downloadDocument
} = require('../controllers/marketSurveyController');

// Purchase Department Routes
router.get('/active-tenders', authenticateToken, getActiveTenders);
router.get('/completed-surveys', authenticateToken, getCompletedSurveys);
router.post('/send/:tenderId', authenticateToken, sendForMarketSurvey);

// Market Survey Committee Routes
router.get('/surveys', authenticateToken, getTendersForSurvey);
router.post('/submit-evaluation/:surveyId', authenticateToken, submitEvaluation);

// Common Routes
router.get('/download/:documentId', authenticateToken, downloadDocument);

module.exports = router;

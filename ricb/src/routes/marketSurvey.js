const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const survey = require('../controllers/marketSurveyController');

const router = express.Router();

router.use(staffOnly);
// Purchase department
router.get('/active-tenders', allow('purchase'), survey.getActiveTenders);
router.get('/completed-surveys', allow('purchase'), survey.getCompletedSurveys);
router.post('/send/:tenderId', allow('purchase'), survey.sendForMarketSurvey);
// Market survey committee
router.get('/surveys', allow('marketSurvey'), survey.getTendersForSurvey);
router.post('/submit-evaluation/:surveyId', allow('marketSurvey'), survey.submitEvaluation);
router.get('/download/:documentId', allow('marketSurvey', 'purchase'), survey.downloadDocument);

module.exports = router;

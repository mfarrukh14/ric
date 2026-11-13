const express = require('express');
const { staffOnly } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const { createUpload, MIME } = require('../middleware/uploads');
const meetings = require('../controllers/preBidMeetingController');

const router = express.Router();

const minutesFile = createUpload({
    dir: 'meeting-minutes',
    prefix: 'meeting-minutes',
    accept: [...MIME.pdf, ...MIME.word],
    typeError: 'Only PDF, DOC, and DOCX files are allowed for meeting minutes.',
}).single('meetingMinutes');

router.use(staffOnly, allow('purchase'));
router.get('/', meetings.getPreBidMeetings);
router.post('/schedule/:tenderId', meetings.schedulePreBidMeeting);
router.post('/minutes/:meetingId', minutesFile, meetings.uploadMeetingMinutes);
router.get('/minutes/:meetingId/download', meetings.downloadMeetingMinutes);
router.put('/cancel/:meetingId', meetings.cancelPreBidMeeting);

module.exports = router;

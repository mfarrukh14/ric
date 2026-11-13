const express = require('express');
const { staffOnly, requireFinanceToken } = require('../middleware/auth');
const { allow } = require('../middleware/roles');
const { createUpload, MIME } = require('../middleware/uploads');
const letters = require('../controllers/letterController');

const router = express.Router();

const letterFile = createUpload({
    dir: 'tender-letters',
    prefix: 'letter',
    accept: [...MIME.pdf, ...MIME.word],
    typeError: 'Only PDF, DOC, and DOCX files are allowed for letters.',
}).single('letterFile');

// Finance callback: after final Asaan Cheque approval, pending award letters go out automatically.
router.post('/award/finalize-from-finance', requireFinanceToken, letters.finalizeLetterOfAwardFromFinance);

router.use(staffOnly, allow('purchase'));
router.get('/intent/ready-tenders', letters.getTendersReadyForLetterOfIntent);
router.get('/intent/suppliers/:tenderId', letters.getSuppliersForIntent);
router.get('/intent/recipients/:tenderId', letters.getSuppliersWithLetterOfIntent);
router.post('/intent/send/:tenderId', letterFile, letters.sendLetterOfIntent);
router.post('/award/send/:tenderId', letterFile, letters.sendLetterOfAward);
router.get('/', letters.getAllLetters);
router.get('/:letterId', letters.getLetterDetails);
router.get('/:letterId/download', letters.downloadLetter);

module.exports = router;

const env = require('./src/config/env');
const express = require('express');
const cors = require('cors');
const { connectDatabase, ensureDatabaseConnection, isDatabaseConnected, databaseClient } = require('./src/db');
const { uploadDir, uploadErrorHandler } = require('./src/middleware/uploads');
const auditCleanupService = require('./src/services/auditCleanupService');
const { markExpiredTendersForOpening } = require('./src/controllers/tenderController');

const routes = {
    '/api/auth': require('./src/routes/auth'),
    '/api/admin': require('./src/routes/admin'),
    '/api/demands': require('./src/routes/demands'),
    '/api/suppliers': require('./src/routes/suppliers'),
    '/api/supplier-awards': require('./src/routes/supplierAwards'),
    '/api/technical-evaluation': require('./src/routes/technicalEvaluation'),
    '/api/grievances': require('./src/routes/grievanceRoutes'),
    '/api/purchase-grievances': require('./src/routes/purchaseGrievances'),
    '/api/financial-opening': require('./src/routes/financialOpening'),
    '/api/financial-grievance': require('./src/routes/financialGrievance'),
    '/api/pre-bid-meetings': require('./src/routes/preBidMeeting'),
    '/api/letters': require('./src/routes/letters'),
    '/api/items': require('./src/routes/items'),
    '/api/2fa': require('./src/routes/twoFactor'),
    '/api/2fa-enforcement': require('./src/routes/twoFactorEnforcement'),
    '/api/supplier-2fa': require('./src/routes/supplierTwoFactor'),
    '/api/audit': require('./src/routes/audit'),
    '/api/technical-reports': require('./src/routes/technicalReports'),
    '/api/vetting': require('./src/routes/vetting'),
    '/api/demand-merge': require('./src/routes/demandMerge'),
    '/api/market-survey': require('./src/routes/marketSurvey'),
    '/api/purchase-orders': require('./src/routes/purchaseOrders'),
    '/api/hms-stock': require('./src/routes/hmsStock'),
};

const UPLOAD_DIRS = [
    'uploads/knockout-documents',
    'uploads/grievance-minutes',
    'uploads/market-survey',
    'tender-documents',
    'tender-letters',
    'meeting-minutes',
    'reports/technical',
    'financial-reports',
    'grievance-letters',
    'audit_logs',
];

const app = express();
app.disable('x-powered-by');

app.use(cors({
    origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Finance-Token'],
    exposedHeaders: ['Content-Disposition'],
}));

app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
});

// While the database is down, every request nudges a background reconnect.
// It never delays or fails the request itself.
app.use((req, res, next) => {
    ensureDatabaseConnection();
    next();
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

for (const [path, router] of Object.entries(routes)) app.use(path, router);

const health = (req, res) => res.json({ status: 'ok', database: databaseClient() ?? 'unavailable' });
app.get('/', health);
app.get('/api/health', health);

app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

app.use(uploadErrorHandler);

// Last resort: never leak stack traces, always answer JSON.
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, error);
    const status = error.status || error.statusCode || 500;
    res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message });
});

// Moves tenders whose bidding window has closed into "pending opening".
// Skips a tick while the database is down or the previous run is still going.
let expiryRunning = false;
setInterval(async () => {
    if (expiryRunning || !isDatabaseConnected()) return;
    expiryRunning = true;
    try {
        await markExpiredTendersForOpening();
    } catch (error) {
        console.error('Tender expiry processing failed:', error.message);
    } finally {
        expiryRunning = false;
    }
}, 60_000).unref();

UPLOAD_DIRS.forEach(uploadDir);
auditCleanupService.initialize(365);

// connectDatabase() never rejects: when the database is unreachable the server
// still starts and the middleware above keeps retrying in the background.
connectDatabase().then(() => {
    app.listen(env.PORT, env.HOST, () => console.log(`Server is running on http://${env.HOST}:${env.PORT}`));
});

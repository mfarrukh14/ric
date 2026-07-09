require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('./src/config/database');
const auditCleanupService = require('./src/services/auditCleanupService');

const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const demandRoutes = require('./src/routes/demands');
const supplierRoutes = require('./src/routes/suppliers');
const supplierAwardRoutes = require('./src/routes/supplierAwards');
const technicalEvaluationRoutes = require('./src/routes/technicalEvaluation');
const grievanceRoutes = require('./src/routes/grievanceRoutes');
const purchaseGrievanceRoutes = require('./src/routes/purchaseGrievances');
const financialOpeningRoutes = require('./src/routes/financialOpening');
const financialGrievanceRoutes = require('./src/routes/financialGrievance');
const preBidMeetingRoutes = require('./src/routes/preBidMeeting');
const letterRoutes = require('./src/routes/letters');
const itemRoutes = require('./src/routes/items');
const twoFactorRoutes = require('./src/routes/twoFactor');
const twoFactorEnforcementRoutes = require('./src/routes/twoFactorEnforcement');
const supplierTwoFactorRoutes = require('./src/routes/supplierTwoFactor');
const itemCategorizationRoutes = require('./src/routes/itemCategorization');
const auditRoutes = require('./src/routes/audit');
const technicalReportsRoutes = require('./src/routes/technicalReports');
const testEmailRoutes = require('./src/routes/testEmail');
const debugRoutes = require('./src/routes/debugRoutes');
const vettingRoutes = require('./src/routes/vetting');
const demandMergeRoutes = require('./src/routes/demandMerge');
const marketSurveyRoutes = require('./src/routes/marketSurvey');
const purchaseOrderRoutes = require('./src/routes/purchaseOrders');

const app = express();
const PORT = 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Allow all origins, methods, and headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Allow everyone
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/demands', demandRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/supplier-awards', supplierAwardRoutes);
app.use('/api/technical-evaluation', technicalEvaluationRoutes);
app.use('/api/grievances', grievanceRoutes);
app.use('/api/purchase-grievances', purchaseGrievanceRoutes);
app.use('/api/financial-opening', financialOpeningRoutes);
app.use('/api/financial-grievance', financialGrievanceRoutes);
app.use('/api/pre-bid-meetings', preBidMeetingRoutes);
app.use('/api/letters', letterRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/2fa-enforcement', twoFactorEnforcementRoutes);
app.use('/api/supplier-2fa', supplierTwoFactorRoutes);
app.use('/api/item-categorization', itemCategorizationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/technical-reports', technicalReportsRoutes);
app.use('/api/test-email', testEmailRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/vetting', vettingRoutes);
app.use('/api/demand-merge', demandMergeRoutes);
app.use('/api/market-survey', marketSurveyRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Tender expiry processing
const { markExpiredTendersForOpening } = require('./src/controllers/tenderController');
setInterval(async () => {
  try {
    console.log('Checking for expired tenders...');
    await markExpiredTendersForOpening();
  } catch (error) {
    console.error('Error in automatic tender processing:', error);
  }
}, 60000);
console.log('Automatic tender expiry processing started (checks every minute)');

// Connect DB and start server
connectDatabase()
  .then(() => {
    // Ensure required upload directories exist
    const fs = require('fs');
    const path = require('path');
    
    const uploadDirs = [
      'uploads',
      'uploads/knockout-documents',
      'uploads/grievance-minutes',
      'uploads/market-survey',
      'tender-documents',
      'meeting-minutes',
      'reports',
      'reports/technical',
      'grievance-letters',
      'audit_logs'
    ];
    
    uploadDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
    
    // Initialize audit cleanup service with 365 days retention
    auditCleanupService.initialize(365);
    
    app.listen(PORT, HOST, () => {
      console.log(`Server is running on http://${HOST}:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to the database:', err);
    process.exit(1);
  });

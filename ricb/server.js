require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('./src/config/database');
const auditCleanupService = require('./src/services/auditCleanupService');

const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const demandRoutes = require('./src/routes/demands');
const supplierRoutes = require('./src/routes/suppliers');
const technicalEvaluationRoutes = require('./src/routes/technicalEvaluation');
const grievanceRoutes = require('./src/routes/grievanceRoutes');
const financialOpeningRoutes = require('./src/routes/financialOpening');
const itemRoutes = require('./src/routes/items');
const twoFactorRoutes = require('./src/routes/twoFactor');
const twoFactorEnforcementRoutes = require('./src/routes/twoFactorEnforcement');
const itemCategorizationRoutes = require('./src/routes/itemCategorization');
const auditRoutes = require('./src/routes/audit');

const app = express();
const PORT = 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/demands', demandRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/technical-evaluation', technicalEvaluationRoutes);
app.use('/api/grievances', grievanceRoutes);
app.use('/api/financial-opening', financialOpeningRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/2fa-enforcement', twoFactorEnforcementRoutes);
app.use('/api/item-categorization', itemCategorizationRoutes);
app.use('/api/audit', auditRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Tender expiry processing
const { markExpiredTendersForEvaluation } = require('./src/controllers/tenderController');
setInterval(async () => {
  try {
    console.log('Checking for expired tenders...');
    await markExpiredTendersForEvaluation();
  } catch (error) {
    console.error('Error in automatic tender processing:', error);
  }
}, 60000);
console.log('Automatic tender expiry processing started (checks every minute)');

// Connect DB and start server
connectDatabase()
  .then(() => {
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

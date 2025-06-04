require('dotenv').config();
const express = require('express');
const cors = require('cors');
require('./src/config/database'); // Initialize database
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const demandRoutes = require('./src/routes/demands');
const supplierRoutes = require('./src/routes/suppliers');
const technicalEvaluationRoutes = require('./src/routes/technicalEvaluation');
const grievanceRoutes = require('./src/routes/grievanceRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/demands', demandRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/technical-evaluation', technicalEvaluationRoutes);
app.use('/api/grievances', grievanceRoutes);

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Server is running' });
});

// Import tender processing function
const { markExpiredTendersForEvaluation } = require('./src/controllers/tenderController');

// Set up automatic processing of expired tenders every minute
setInterval(async () => {
    try {
        console.log('Checking for expired tenders...');
        await markExpiredTendersForEvaluation();
    } catch (error) {
        console.error('Error in automatic tender processing:', error);
    }
}, 60000); // Check every minute

console.log('Automatic tender expiry processing started (checks every minute)');

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
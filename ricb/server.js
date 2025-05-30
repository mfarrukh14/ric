const express = require('express');
const cors = require('cors');
require('./src/config/database'); // Initialize database
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const demandRoutes = require('./src/routes/demands');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/demands', demandRoutes);

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Server is running' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
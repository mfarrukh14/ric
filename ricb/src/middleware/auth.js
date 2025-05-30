const jwt = require('jsonwebtoken');
const { getDatabase } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Fetch complete user information including department
        const db = getDatabase();
        const user = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.*, d.name as department_name, c.name as committee_name
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 LEFT JOIN committees c ON u.committee_id = c.id
                 WHERE u.id = ?`,
                [decoded.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            throw new Error('User not found');
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Please authenticate' });
    }
};

module.exports = auth;

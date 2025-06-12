const jwt = require('jsonwebtoken');
const { getDatabase } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            console.log('❌ No token provided for:', req.path);
            throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('🔍 Auth middleware - User ID:', decoded.id, 'Path:', req.path);
        
        const db = getDatabase();
        
        // Check if this is a supplier token
        if (decoded.type === 'supplier') {
            // Fetch supplier information
            const supplier = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT * FROM suppliers WHERE id = ?',
                    [decoded.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!supplier) {
                throw new Error('Supplier not found');
            }

            // Set supplier as user with role 'supplier'
            req.user = {
                id: supplier.id,
                role: 'supplier',
                email: supplier.company_email,
                company_name: supplier.company_name,
                company_email: supplier.company_email,
                status: supplier.status
            };
        } else {
            // Fetch regular user information including department
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
            });            if (!user) {
                throw new Error('User not found');
            }

            console.log('✅ User authenticated:', {
                id: user.id,
                name: user.name,
                role: user.role,
                department_name: user.department_name
            });

            req.user = user;
        }
        
        next();
    } catch (error) {
        console.log('❌ Auth failed:', error.message);
        res.status(401).json({ error: 'Please authenticate' });
    }
};

module.exports = auth;
module.exports.authenticateToken = auth;

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
        console.log('🔍 Auth middleware - Decoded token:', decoded, 'Path:', req.path);
        
        const db = getDatabase();
        
        // Check if this is a supplier token (new format)
        if (decoded.supplierId) {
            // Fetch supplier information
            const supplier = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT * FROM suppliers WHERE id = ?',
                    [decoded.supplierId],
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
                supplierId: supplier.id,
                role: 'supplier',
                username: supplier.username,
                businessEmail: supplier.business_email,
                emailVerified: supplier.email_verified === 1,
                registrationStep: supplier.registration_step,
                status: supplier.status
            };
        } else if (decoded.type === 'supplier') {
            // Legacy supplier token format
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

            req.user = {
                id: supplier.id,
                supplierId: supplier.id,
                role: 'supplier',
                username: supplier.username || 'legacy',
                businessEmail: supplier.business_email || supplier.company_email,
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
            });

            if (!user) {
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

const authenticateSupplierToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            console.log('❌ No token provided for supplier:', req.path);
            throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('🔍 Supplier Auth middleware - Decoded token:', decoded, 'Path:', req.path);
        
        const db = getDatabase();
        
        let supplier = null;
        
        // Check if this is a supplier token (new format)
        if (decoded.supplierId) {
            supplier = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT * FROM suppliers WHERE id = ?',
                    [decoded.supplierId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
        } else if (decoded.type === 'supplier') {
            // Legacy supplier token format
            supplier = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT * FROM suppliers WHERE id = ?',
                    [decoded.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
        } else {
            throw new Error('Invalid supplier token');
        }

        if (!supplier) {
            throw new Error('Supplier not found');
        }

        // Set supplier object
        req.supplier = {
            id: supplier.id,
            username: supplier.username,
            business_email: supplier.business_email,
            status: supplier.status,
            two_factor_enabled: supplier.two_factor_enabled,
            two_factor_secret: supplier.two_factor_secret,
            backup_codes: supplier.backup_codes
        };

        console.log('✅ Supplier authenticated:', {
            id: supplier.id,
            username: supplier.username,
            business_email: supplier.business_email
        });
        
        next();
    } catch (error) {
        console.log('❌ Supplier Auth failed:', error.message);
        res.status(401).json({ error: 'Please authenticate as supplier' });
    }
};

module.exports = auth;
module.exports.authenticateToken = auth;
module.exports.authenticateSupplierToken = authenticateSupplierToken;

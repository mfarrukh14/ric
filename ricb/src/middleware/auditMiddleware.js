const auditLogger = require('../utils/auditLogger');

// Enhanced authentication middleware with audit logging
const auditAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            // Log failed authentication attempt
            const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'];
            await auditLogger.writeAuditEntry(
                'Unknown', 
                'unknown', 
                'Unknown User', 
                'AUTHENTICATION_FAILED - No token provided',
                `Path: ${req.path} | Method: ${req.method}`,
                ipAddress,
                req.headers['user-agent']
            );
            return res.status(401).json({ error: 'No token provided' });
        }

        const jwt = require('jsonwebtoken');
        const { getDatabase } = require('../config/database');
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
        
        const decoded = jwt.verify(token, JWT_SECRET);
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
                await auditLogger.logAuth(
                    decoded.supplierId,
                    'supplier',
                    'Unknown Supplier',
                    'AUTHENTICATION_FAILED - Supplier not found',
                    `Path: ${req.path}`,
                    req
                );
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

            // Log successful supplier authentication only for sensitive actions
            if (req.method !== 'GET' || req.path.includes('sensitive')) {
                await auditLogger.logAuth(
                    supplier.id,
                    'supplier',
                    supplier.username || `Supplier-${supplier.id}`,
                    'SUPPLIER_AUTHENTICATED',
                    `Path: ${req.path} | Method: ${req.method}`,
                    req
                );
            }

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
                await auditLogger.logAuth(
                    decoded.id,
                    'supplier',
                    'Unknown Supplier',
                    'AUTHENTICATION_FAILED - Legacy supplier not found',
                    `Path: ${req.path}`,
                    req
                );
                throw new Error('Supplier not found');
            }

            req.user = {
                id: supplier.id,
                supplierId: supplier.id,
                role: 'supplier',
                username: supplier.username || 'legacy',
                businessEmail: supplier.business_email || supplier.company_email,
                emailVerified: supplier.email_verified === 1,
                registrationStep: supplier.registration_step,
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
                await auditLogger.logAuth(
                    decoded.id,
                    decoded.role || 'unknown',
                    decoded.name || 'Unknown User',
                    'AUTHENTICATION_FAILED - User not found',
                    `Path: ${req.path}`,
                    req
                );
                throw new Error('User not found');
            }

            req.user = user;

            // Log user authentication for non-GET requests or sensitive paths
            if (req.method !== 'GET' || req.path.includes('admin') || req.path.includes('password') || req.path.includes('2fa')) {
                await auditLogger.logAuth(
                    user.id,
                    user.role,
                    user.name,
                    'USER_AUTHENTICATED',
                    `Path: ${req.path} | Method: ${req.method} | Department: ${user.department_name || 'None'} | Committee: ${user.committee_name || 'None'}`,
                    req
                );
            }
        }
        
        next();
    } catch (error) {
        const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'];
        await auditLogger.writeAuditEntry(
            'Unknown',
            'unknown',
            'Unknown User',
            'AUTHENTICATION_ERROR',
            `Error: ${error.message} | Path: ${req.path} | Method: ${req.method}`,
            ipAddress,
            req.headers['user-agent']
        );
        res.status(401).json({ error: 'Please authenticate' });
    }
};

// Middleware to log API access for audit trail
const auditApiAccess = (action) => {
    return async (req, res, next) => {
        // Store original res.json and res.send methods
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        
        // Override res.json to capture response
        res.json = function(body) {
            // Log the action after successful response
            if (res.statusCode < 400 && req.user) {
                const details = req.params.id ? 
                    `Resource ID: ${req.params.id} | Status: ${res.statusCode}` :
                    `Status: ${res.statusCode}`;
                
                auditLogger.logDataAccess(
                    req.user.id,
                    req.user.role,
                    req.user.name || req.user.username,
                    action,
                    req.route?.path || req.path,
                    req.params.id || 'N/A',
                    details,
                    req
                ).catch(err => console.error('Audit logging failed:', err));
            }
            
            return originalJson(body);
        };
        
        // Override res.send to capture response
        res.send = function(body) {
            // Log the action after successful response
            if (res.statusCode < 400 && req.user) {
                const details = req.params.id ? 
                    `Resource ID: ${req.params.id} | Status: ${res.statusCode}` :
                    `Status: ${res.statusCode}`;
                
                auditLogger.logDataAccess(
                    req.user.id,
                    req.user.role,
                    req.user.name || req.user.username,
                    action,
                    req.route?.path || req.path,
                    req.params.id || 'N/A',
                    details,
                    req
                ).catch(err => console.error('Audit logging failed:', err));
            }
            
            return originalSend(body);
        };
        
        next();
    };
};

module.exports = { auditAuth, auditApiAccess };

const { getDatabase } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auditLogger = require('../utils/auditLogger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

exports.login = async (req, res) => {
    const { username, password } = req.body;
    const db = getDatabase();

    if (!username || !password) {
        // Log failed login attempt
        await auditLogger.logAuth(
            'Unknown',
            'unknown',
            username || 'Unknown',
            'LOGIN_FAILED - Missing credentials',
            'Username or password not provided',
            req
        );
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {        const user = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.id, u.username, u.name, u.role, u.department_id, u.committee_id, u.password, u.eligible_for_demand_creation,
                        u.two_factor_enabled, u.is_hod, d.name as department_name, c.name as committee_name
                 FROM users u 
                 LEFT JOIN departments d ON u.department_id = d.id
                 LEFT JOIN committees c ON u.committee_id = c.id
                 WHERE u.username = ?`,
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            // Log failed login attempt - user not found
            await auditLogger.logAuth(
                'Unknown',
                'unknown',
                username,
                'LOGIN_FAILED - User not found',
                'Invalid username provided',
                req
            );
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            // Log failed login attempt - wrong password
            await auditLogger.logAuth(
                user.id,
                user.role,
                user.name,
                'LOGIN_FAILED - Invalid password',
                'Incorrect password provided',
                req
            );
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if 2FA is enabled
        if (user.two_factor_enabled) {
            // Log 2FA required
            await auditLogger.log2FA(
                user.id,
                user.role,
                user.name,
                '2FA_REQUIRED',
                'User login requires 2FA verification',
                req
            );
            
            // Return response indicating 2FA is required
            return res.json({
                requires2FA: true,
                userId: user.id,
                message: 'Please provide your 2FA code to complete login'
            });
        }

        // Log successful login
        await auditLogger.logAuth(
            user.id,
            user.role,
            user.name,
            'LOGIN_SUCCESS',
            `Department: ${user.department_name || 'None'} | Committee: ${user.committee_name || 'None'}`,
            req
        );

        // Generate token for users without 2FA
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                name: user.name,
                department_id: user.department_id,
                committee_id: user.committee_id,
                department_name: user.department_name,
                committee_name: user.committee_name
            }, 
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                department_id: user.department_id,
                committee_id: user.committee_id,
                departmentName: user.department_name,
                committeeName: user.committee_name,
                eligibleForDemandCreation: !!user.eligible_for_demand_creation,
                twoFactorEnabled: !!user.two_factor_enabled,
                isHod: !!user.is_hod
            }
        });
    } catch (err) {
        // Log login error
        await auditLogger.logAuth(
            'Unknown',
            'unknown',
            username || 'Unknown',
            'LOGIN_ERROR',
            `Error: ${err.message}`,
            req
        );
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error during login' });
    }
};

// Complete login after 2FA verification
exports.complete2FALogin = async (req, res) => {
    const { userId, token, isBackupCode } = req.body;
    const db = getDatabase();

    if (!userId || !token) {
        await auditLogger.log2FA(
            userId || 'Unknown',
            'unknown',
            'Unknown',
            '2FA_COMPLETION_FAILED - Missing parameters',
            'User ID or token not provided',
            req
        );
        return res.status(400).json({ error: 'User ID and token are required' });
    }

    try {
        // First verify the 2FA token
        const twoFactorController = require('./twoFactorController');
        
        // Create a temporary req object for the 2FA verification
        const tempReq = { body: { userId, token, isBackupCode } };
        let verificationResult = null;
        
        const tempRes = {
            json: (data) => { verificationResult = data; },
            status: (code) => ({ json: (data) => { verificationResult = { ...data, statusCode: code }; } })
        };

        await twoFactorController.verify2FA(tempReq, tempRes);

        if (!verificationResult || !verificationResult.verified) {
            await auditLogger.log2FA(
                userId,
                'unknown',
                'Unknown',
                '2FA_VERIFICATION_FAILED',
                `Error: ${verificationResult?.error || 'Invalid verification code'}`,
                req
            );
            return res.status(400).json({ 
                error: verificationResult?.error || 'Invalid verification code' 
            });
        }

        // Get user details for token generation
        const user = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.id, u.username, u.name, u.role, u.department_id, u.committee_id, 
                        u.eligible_for_demand_creation, u.two_factor_enabled, u.is_hod,
                        d.name as department_name, c.name as committee_name
                 FROM users u 
                 LEFT JOIN departments d ON u.department_id = d.id
                 LEFT JOIN committees c ON u.committee_id = c.id
                 WHERE u.id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            await auditLogger.log2FA(
                userId,
                'unknown',
                'Unknown',
                '2FA_COMPLETION_FAILED - User not found',
                'User not found after 2FA verification',
                req
            );
            return res.status(404).json({ error: 'User not found' });
        }

        // Log successful 2FA completion
        await auditLogger.log2FA(
            user.id,
            user.role,
            user.name,
            '2FA_LOGIN_SUCCESS',
            `2FA verification completed successfully | Backup Code: ${isBackupCode ? 'Yes' : 'No'}`,
            req
        );

        // Generate JWT token
        const authToken = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                name: user.name,
                department_id: user.department_id,
                committee_id: user.committee_id,
                department_name: user.department_name,
                committee_name: user.committee_name
            }, 
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token: authToken,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                department_id: user.department_id,
                committee_id: user.committee_id,
                departmentName: user.department_name,
                committeeName: user.committee_name,
                eligibleForDemandCreation: !!user.eligible_for_demand_creation,
                twoFactorEnabled: !!user.two_factor_enabled,
                isHod: !!user.is_hod
            }
        });

    } catch (err) {
        await auditLogger.log2FA(
            userId,
            'unknown',
            'Unknown',
            '2FA_COMPLETION_ERROR',
            `Error: ${err.message}`,
            req
        );
        console.error('2FA login completion error:', err);
        res.status(500).json({ error: 'Error completing 2FA login' });
    }
};

// Get current user profile
exports.getProfile = async (req, res) => {
    const db = getDatabase();
    const userId = req.user.id;

    try {
        const user = await new Promise((resolve, reject) => {
            db.get(
                `SELECT u.id, u.username, u.name, u.role, u.department_id, u.committee_id, 
                        u.eligible_for_demand_creation, u.two_factor_enabled, u.is_hod,
                        d.name as department_name, c.name as committee_name
                 FROM users u 
                 LEFT JOIN departments d ON u.department_id = d.id
                 LEFT JOIN committees c ON u.committee_id = c.id
                 WHERE u.id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            department_id: user.department_id,
            committee_id: user.committee_id,
            departmentName: user.department_name,
            committeeName: user.committee_name,
            eligibleForDemandCreation: !!user.eligible_for_demand_creation,
            two_factor_enabled: !!user.two_factor_enabled,
            isHod: !!user.is_hod
        });

    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ error: 'Error fetching profile' });
    }
};

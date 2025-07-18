const { getDatabase } = require('../config/database');

// Get system-wide 2FA enforcement status
const getTwoFactorEnforcement = async (req, res) => {
    try {
        const db = getDatabase();
        // Get superadmin's 2FA status
        db.get(
            "SELECT two_factor_enabled FROM users WHERE role = 'superadmin' LIMIT 1",
            (err, row) => {
                if (err) {
                    console.error('Error fetching 2FA enforcement status:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                const enforced = row ? (row.two_factor_enabled === 1) : false;
                res.json({ 
                    enforced: enforced,
                    message: enforced ? '2FA is required for all users' : '2FA is optional for users'
                });
            }
        );
    } catch (error) {
        console.error('Error in getTwoFactorEnforcement:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Check if current user needs mandatory 2FA setup
const checkTwoFactorCompliance = async (req, res) => {
    try {
        const db = getDatabase();
        const userId = req.user.id;
        
        // First check if 2FA is enforced system-wide
        db.get(
            "SELECT two_factor_enabled FROM users WHERE role = 'superadmin' LIMIT 1",
            (err, superadminRow) => {
                if (err) {
                    console.error('Error checking superadmin 2FA:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                const systemEnforced = superadminRow ? (superadminRow.two_factor_enabled === 1) : false;
                
                if (!systemEnforced) {
                    // 2FA not enforced system-wide
                    return res.json({ 
                        enforced: false,
                        compliant: true,
                        requiresSetup: false,
                        message: '2FA is not required'
                    });
                }
                
                // Check current user's 2FA status
                db.get(
                    "SELECT two_factor_enabled FROM users WHERE id = ?",
                    [userId],
                    (err, userRow) => {
                        if (err) {
                            console.error('Error checking user 2FA:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        const userHas2FA = userRow ? (userRow.two_factor_enabled === 1) : false;
                        
                        res.json({
                            enforced: true,
                            compliant: userHas2FA,
                            requiresSetup: !userHas2FA,
                            message: userHas2FA ? 
                                'User is compliant with 2FA requirement' : 
                                'User must set up 2FA to continue'
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error in checkTwoFactorCompliance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get list of users without 2FA when enforcement is enabled
const getNonCompliantUsers = async (req, res) => {
    try {
        const db = getDatabase();
        // Only superadmin can view this
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ error: 'Access denied. Superadmin only.' });
        }
        
        // Check if enforcement is enabled
        db.get(
            "SELECT two_factor_enabled FROM users WHERE role = 'superadmin' LIMIT 1",
            (err, superadminRow) => {
                if (err) {
                    console.error('Error checking superadmin 2FA:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                const systemEnforced = superadminRow ? (superadminRow.two_factor_enabled === 1) : false;
                
                if (!systemEnforced) {
                    return res.json({ 
                        enforced: false,
                        nonCompliantUsers: [],
                        message: '2FA enforcement is disabled'
                    });
                }
                
                // Get users without 2FA
                db.all(
                    `SELECT id, name, username, email, role, departmentName, committeeName, 
                     two_factor_enabled, created_at, last_login 
                     FROM users 
                     WHERE (two_factor_enabled = 0 OR two_factor_enabled IS NULL) 
                     AND role != 'superadmin'
                     ORDER BY created_at DESC`,
                    (err, rows) => {
                        if (err) {
                            console.error('Error fetching non-compliant users:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        res.json({
                            enforced: true,
                            nonCompliantUsers: rows || [],
                            totalCount: rows ? rows.length : 0,
                            message: `${rows ? rows.length : 0} users require 2FA setup`
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error in getNonCompliantUsers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getTwoFactorEnforcement,
    checkTwoFactorCompliance,
    getNonCompliantUsers
};

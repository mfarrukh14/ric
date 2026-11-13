// System-wide 2FA enforcement: switched on when the superadmin enables 2FA on their own account.
const { dbAll, dbGet } = require('../db');

const isEnforced = async () => {
    const row = await dbGet("SELECT two_factor_enabled FROM users WHERE role = 'superadmin' LIMIT 1");
    return row?.two_factor_enabled === 1;
};

const getTwoFactorEnforcement = async (req, res) => {
    try {
        const enforced = await isEnforced();
        res.json({ enforced, message: enforced ? '2FA is required for all users' : '2FA is optional for users' });
    } catch (error) {
        console.error('Error fetching 2FA enforcement status:', error);
        res.status(500).json({ error: 'Database error' });
    }
};

// Whether the signed-in user still has to set up 2FA.
const checkTwoFactorCompliance = async (req, res) => {
    try {
        if (!(await isEnforced())) {
            return res.json({ enforced: false, compliant: true, requiresSetup: false, message: '2FA is not required' });
        }
        const user = await dbGet('SELECT two_factor_enabled FROM users WHERE id = ?', [req.user.id]);
        const compliant = user?.two_factor_enabled === 1;
        res.json({
            enforced: true,
            compliant,
            requiresSetup: !compliant,
            message: compliant ? 'User is compliant with 2FA requirement' : 'User must set up 2FA to continue',
        });
    } catch (error) {
        console.error('Error checking 2FA compliance:', error);
        res.status(500).json({ error: 'Database error' });
    }
};

// Active staff without 2FA, while enforcement is on.
const getNonCompliantUsers = async (req, res) => {
    try {
        if (!(await isEnforced())) {
            return res.json({ enforced: false, nonCompliantUsers: [], message: '2FA enforcement is disabled' });
        }
        const users = await dbAll(
            `SELECT u.id, u.name, u.username, u.role, u.created_at,
                    d.name AS departmentName, c.name AS committeeName
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             LEFT JOIN committees c ON u.committee_id = c.id
             WHERE (u.two_factor_enabled = 0 OR u.two_factor_enabled IS NULL)
               AND u.role != 'superadmin' AND u.deactivated_at IS NULL
             ORDER BY u.name`,
        );
        res.json({
            enforced: true,
            nonCompliantUsers: users,
            totalCount: users.length,
            message: `${users.length} users require 2FA setup`,
        });
    } catch (error) {
        console.error('Error fetching non-compliant users:', error);
        res.status(500).json({ error: 'Database error' });
    }
};

module.exports = {
    getTwoFactorEnforcement,
    checkTwoFactorCompliance,
    getNonCompliantUsers,
};

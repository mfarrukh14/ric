const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet } = require('../db');
const { JWT_SECRET } = require('../config/env');
const auditLogger = require('../utils/auditLogger');
const { verifySecondFactor } = require('./twoFactorController');

const SESSION_TTL = '24h';
const CHALLENGE_TTL = '5m';

// Compared against when the username is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/**
 * Active accounts only: a removed (deactivated) user signs in like an unknown username.
 * @param {'id'|'username'} column
 */
const findUser = (column, value) =>
    dbGet(
        `SELECT u.*, d.name AS department_name, c.name AS committee_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN committees c ON u.committee_id = c.id
         WHERE u.${column} = ? AND u.deactivated_at IS NULL`,
        [value],
    );

/** The user object the frontend keeps in its session. */
const publicUser = (user) => ({
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
    isHod: !!user.is_hod,
});

const issueSession = (user) => ({
    token: jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name,
            department_id: user.department_id,
            committee_id: user.committee_id,
            department_name: user.department_name,
            committee_name: user.committee_name,
        },
        JWT_SECRET,
        { expiresIn: SESSION_TTL }
    ),
    user: publicUser(user),
});

const audit = (user, action, details, req) => auditLogger.record(req, action, details, user);

exports.login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        await audit({ name: username }, 'LOGIN_FAILED - Missing credentials', 'Username or password not provided', req);
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const user = await findUser('username', username);
        const valid = (await bcrypt.compare(password, user?.password || DUMMY_HASH)) && Boolean(user);
        if (!valid) {
            await audit(user || { name: username }, user ? 'LOGIN_FAILED - Invalid password' : 'LOGIN_FAILED - User not found', 'Invalid credentials', req);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Finance-only accounts sign in to the Finance module instead; the browser
        // forwards the credentials it already has.
        if (Number(user.is_finance_user) === 1) {
            await audit(user, 'FINANCE_USER_REDIRECT', 'Sent to the Finance module', req);
            return res.json({ isFinanceUser: true });
        }

        if (user.two_factor_enabled) {
            await audit(user, '2FA_REQUIRED', 'Waiting for second factor', req);
            // The challenge proves the password step succeeded.
            const challenge = jwt.sign({ purpose: '2fa', id: user.id }, JWT_SECRET, { expiresIn: CHALLENGE_TTL });
            return res.json({ requires2FA: true, challenge });
        }

        await audit(user, 'LOGIN_SUCCESS', `Department: ${user.department_name || 'None'} | Committee: ${user.committee_name || 'None'}`, req);
        res.json(issueSession(user));
    } catch (err) {
        await audit({ name: username }, 'LOGIN_ERROR', `Error: ${err.message}`, req);
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error during login' });
    }
};

exports.complete2FALogin = async (req, res) => {
    const { challenge, token, isBackupCode } = req.body;

    let userId;
    try {
        const claims = jwt.verify(String(challenge || ''), JWT_SECRET);
        if (claims.purpose !== '2fa') throw new Error('wrong purpose');
        userId = claims.id;
    } catch {
        return res.status(401).json({ error: 'Your sign-in attempt expired. Please enter your password again.' });
    }

    if (!token) return res.status(400).json({ error: 'Verification code is required' });

    try {
        const verified = await verifySecondFactor(userId, token, isBackupCode);
        if (!verified) {
            await audit({ id: userId }, '2FA_VERIFICATION_FAILED', 'Invalid verification code', req);
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        const user = await findUser('id', userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await audit(user, '2FA_LOGIN_SUCCESS', `Backup Code: ${isBackupCode ? 'Yes' : 'No'}`, req);
        res.json(issueSession(user));
    } catch (err) {
        console.error('2FA login completion error:', err);
        res.status(500).json({ error: 'Error completing 2FA login' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await findUser('id', req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ ...publicUser(user), two_factor_enabled: !!user.two_factor_enabled });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ error: 'Error fetching profile' });
    }
};

// Superadmin maintenance: departments, committees, staff accounts and settings.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const auditLogger = require('../utils/auditLogger');
const { seal, unseal } = require('../utils/credentialVault');
const { dbAll, dbGet, dbRun, isUniqueViolation } = require('../db');

const GRIEVANCE_HOURS = { min: 1 / 60, max: 720 };

// ── Departments and committees ────────────────────────────────────────────

/** create/list/delete handlers for a simple named lookup (departments, committees). */
function namedList(table, label, userColumn) {
    const create = async (req, res) => {
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: `${label} name is required` });
        try {
            const { lastID } = await dbRun(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
            await auditLogger.record(req, `${label.toUpperCase()}_CREATED`, name);
            res.status(201).json({ id: lastID, name });
        } catch (err) {
            if (isUniqueViolation(err)) return res.status(400).json({ error: `${label} already exists` });
            console.error(`Error creating ${label.toLowerCase()}:`, err);
            res.status(500).json({ error: `Error creating ${label.toLowerCase()}` });
        }
    };

    const list = async (req, res) => {
        try {
            res.json(await dbAll(`SELECT * FROM ${table} ORDER BY name`));
        } catch (err) {
            console.error(`Error listing ${table}:`, err);
            res.status(500).json({ error: `Error fetching ${table}` });
        }
    };

    const remove = async (req, res) => {
        try {
            const row = await dbGet(`SELECT name FROM ${table} WHERE id = ?`, [req.params.id]);
            if (!row) return res.status(404).json({ error: `${label} not found` });
            const { count } = await dbGet(`SELECT COUNT(*) AS count FROM users WHERE ${userColumn} = ?`, [req.params.id]);
            if (count > 0) return res.status(400).json({ error: `${label} still has ${count} user(s). Move or delete them first.` });
            await dbRun(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
            await auditLogger.record(req, `${label.toUpperCase()}_DELETED`, row.name);
            res.json({ message: `${label} deleted` });
        } catch (err) {
            console.error(`Error deleting ${label.toLowerCase()}:`, err);
            res.status(500).json({ error: `Error deleting ${label.toLowerCase()}` });
        }
    };

    return { create, list, remove };
}

const departments = namedList('departments', 'Department', 'department_id');
const committees = namedList('committees', 'Committee', 'committee_id');

// ── Staff accounts ─────────────────────────────────────────────────────────

// Sign-in checks the bcrypt hash; the sealed copy lets the superadmin view it later.
const generatePassword = () => crypto.randomBytes(9).toString('base64url');

/** Username from the person's name: second word if there is one, e.g. "khan42.ric". */
async function generateUsername(name) {
    const words = name.trim().split(/\s+/);
    const base = (words[1] || words[0]).toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const username = `${base}${crypto.randomInt(10, attempt < 20 ? 100 : 10000)}.ric`;
        // Deactivated accounts keep their usernames, so this checks every row.
        if (!(await dbGet('SELECT id FROM users WHERE username = ?', [username]))) return username;
    }
    throw new Error('Could not generate a unique username');
}

/** An active, non-superadmin staff account. */
const findStaff = (id) =>
    dbGet("SELECT id, name, username, department_id FROM users WHERE id = ? AND role != 'superadmin' AND deactivated_at IS NULL", [id]);

const findOtherHod = (departmentId, exceptUserId = 0) =>
    dbGet('SELECT id, name FROM users WHERE department_id = ? AND is_hod = 1 AND id != ?', [departmentId, exceptUserId]);

const createUser = async (req, res) => {
    const { name, designation, departmentId, committeeId, eligibleForDemandCreation, isHod, isFinanceUser } = req.body;
    if (!name?.trim() || !designation?.trim() || (!departmentId && !committeeId)) {
        return res.status(400).json({ error: 'Name, designation, and either department or committee are required' });
    }
    if (isHod && !departmentId) return res.status(400).json({ error: 'Only department members can be HOD' });

    try {
        if (isHod) {
            const hod = await findOtherHod(departmentId);
            if (hod) return res.status(400).json({ error: `This department already has an HOD: ${hod.name}` });
        }
        const username = await generateUsername(name);
        const password = generatePassword();
        await dbRun(
            `INSERT INTO users (name, username, password, password_sealed, designation, department_id, committee_id, role, eligible_for_demand_creation, is_hod, is_finance_user)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)`,
            [name.trim(), username, await bcrypt.hash(password, 10), seal(password), designation.trim(), departmentId || null, committeeId || null,
                eligibleForDemandCreation ? 1 : 0, isHod ? 1 : 0, isFinanceUser ? 1 : 0],
        );
        await auditLogger.record(req, 'USER_CREATED', `${name} | ${username} | Department: ${departmentId || '-'} | Committee: ${committeeId || '-'} | HOD: ${isHod ? 'yes' : 'no'}`);
        res.status(201).json({ message: 'User created', credentials: { username, password } });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Error creating user' });
    }
};

const listUsers = async (req, res) => {
    try {
        const users = await dbAll(
            `SELECT u.id, u.name, u.username, u.designation, u.department_id, u.committee_id, u.role, u.created_at,
                    u.is_hod, u.is_finance_user, u.eligible_for_demand_creation AS eligibleForDemandCreation,
                    d.name AS department_name, c.name AS committee_name
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             LEFT JOIN committees c ON u.committee_id = c.id
             WHERE u.role != 'superadmin' AND u.deactivated_at IS NULL
             ORDER BY u.name`,
        );
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Error fetching users' });
    }
};

/**
 * Removes a staff account by deactivating it. Demands, evaluations, openings and letters
 * keep pointing at the user (some legacy foreign keys would even cascade-delete a user's
 * demands), so the row stays: sign-in and existing sessions stop working, and the account
 * leaves its department/committee so it no longer counts as a member, HOD or vetter.
 */
const deleteUser = async (req, res) => {
    try {
        const user = await dbGet(
            `SELECT u.name, u.username, d.name AS department, c.name AS committee
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             LEFT JOIN committees c ON u.committee_id = c.id
             WHERE u.id = ? AND u.role != 'superadmin' AND u.deactivated_at IS NULL`,
            [req.params.id],
        );
        if (!user) return res.status(404).json({ error: 'User not found' });
        await dbRun(
            `UPDATE users SET deactivated_at = CURRENT_TIMESTAMP, department_id = NULL, committee_id = NULL,
             is_hod = 0, eligible_for_demand_creation = 0
             WHERE id = ?`,
            [req.params.id],
        );
        await auditLogger.record(req, 'USER_REMOVED', `${user.name} | ${user.username} | ${user.department || user.committee || '-'}`);
        res.json({ message: 'User removed' });
    } catch (err) {
        console.error('Error removing user:', err);
        res.status(500).json({ error: 'Error removing user' });
    }
};

/** The account's current password, for the superadmin's member list. Every view is audited. */
const revealUserPassword = async (req, res) => {
    try {
        const user = await dbGet("SELECT * FROM users WHERE id = ? AND role != 'superadmin' AND deactivated_at IS NULL", [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        let password = unseal(user.password_sealed);
        // Accounts from before encryption may still have the old plain-text copy; use it only if it still matches.
        if (!password && user.plain_password && (await bcrypt.compare(user.plain_password, user.password))) {
            password = user.plain_password;
        }
        if (password) await auditLogger.record(req, 'USER_PASSWORD_VIEWED', `${user.name} | ${user.username}`);
        res.json({ password: password || null });
    } catch (err) {
        console.error('Error reading password:', err);
        res.status(500).json({ error: 'Error reading password' });
    }
};

const resetUserPassword = async (req, res) => {
    try {
        const user = await dbGet("SELECT * FROM users WHERE id = ? AND role != 'superadmin' AND deactivated_at IS NULL", [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const password = generatePassword();
        // Older databases still have a plain_password column; clear it rather than leave a stale copy.
        const clearLegacy = 'plain_password' in user ? ', plain_password = NULL' : '';
        await dbRun(`UPDATE users SET password = ?, password_sealed = ?${clearLegacy} WHERE id = ?`, [await bcrypt.hash(password, 10), seal(password), user.id]);
        await auditLogger.record(req, 'USER_PASSWORD_RESET', `${user.name} | ${user.username}`);
        res.json({ message: 'Password reset', credentials: { username: user.username, password } });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Error resetting password' });
    }
};

const updateHodStatus = async (req, res) => {
    const { userId, isHod } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    try {
        const user = await findStaff(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (isHod) {
            if (!user.department_id) return res.status(400).json({ error: 'Only department members can be HOD' });
            const hod = await findOtherHod(user.department_id, userId);
            if (hod) return res.status(400).json({ error: `This department already has an HOD: ${hod.name}` });
        }
        await dbRun('UPDATE users SET is_hod = ? WHERE id = ?', [isHod ? 1 : 0, userId]);
        await auditLogger.record(req, 'HOD_STATUS_UPDATED', `${user.name} | HOD: ${isHod ? 'yes' : 'no'}`);
        res.json({ message: 'HOD status updated' });
    } catch (err) {
        console.error('Error updating HOD status:', err);
        res.status(500).json({ error: 'Error updating HOD status' });
    }
};

// is_finance_user is the inverse flag: 1 means the account only uses the Finance module.
const updateEprocStatus = async (req, res) => {
    const { userId, isEprocUser } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    try {
        const user = await findStaff(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await dbRun('UPDATE users SET is_finance_user = ? WHERE id = ?', [isEprocUser ? 0 : 1, userId]);
        await auditLogger.record(req, 'EPROC_STATUS_UPDATED', `${user.name} | eProcurement: ${isEprocUser ? 'yes' : 'no (Finance only)'}`);
        res.json({ message: 'eProcurement access updated' });
    } catch (err) {
        console.error('Error updating eProcurement status:', err);
        res.status(500).json({ error: 'Error updating eProcurement status' });
    }
};

// ── System settings ────────────────────────────────────────────────────────

const validGrievanceHours = (value) => {
    const hours = Number(value);
    return Number.isFinite(hours) && hours >= GRIEVANCE_HOURS.min && hours <= GRIEVANCE_HOURS.max;
};
const GRIEVANCE_RANGE_MESSAGE = 'Grievance deadline must be between 1 minute and 720 hours';

const getSystemConfigurations = async (req, res) => {
    try {
        res.json(await dbAll('SELECT * FROM system_configurations ORDER BY config_key'));
    } catch (err) {
        console.error('Error fetching system configurations:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function setConfig(req, key, value) {
    const old = await dbGet('SELECT config_value FROM system_configurations WHERE config_key = ?', [key]);
    if (!old) return false;
    await dbRun('UPDATE system_configurations SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?', [String(value), key]);
    await auditLogger.record(req, 'SYSTEM_CONFIG_UPDATED', `${key}: ${old.config_value} -> ${value}`);
    return true;
}

const updateSystemConfiguration = async (req, res) => {
    const { configKey, configValue } = req.body;
    if (!configKey || configValue === undefined) return res.status(400).json({ message: 'Configuration key and value are required' });
    if (configKey === 'grievance_deadline_hours' && !validGrievanceHours(configValue)) {
        return res.status(400).json({ message: GRIEVANCE_RANGE_MESSAGE });
    }
    try {
        if (!(await setConfig(req, configKey, configValue))) return res.status(404).json({ message: 'Configuration not found' });
        res.json({ message: 'Configuration updated', configKey, configValue });
    } catch (err) {
        console.error('Error updating system configuration:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getGrievanceDeadlines = async (req, res) => {
    try {
        const deadlines = await dbAll(
            `SELECT gd.*, dt.bidding_end_time, d.item_name, d.description
             FROM grievance_deadlines gd
             JOIN demand_tenders dt ON gd.tender_id = dt.id
             JOIN demands d ON dt.demand_id = d.id
             WHERE gd.is_active = 1
             ORDER BY gd.deadline_end ASC`,
        );
        const now = Date.now();
        res.json(deadlines.map((deadline) => {
            const remaining = new Date(deadline.deadline_end).getTime() - now;
            return {
                ...deadline,
                timeRemainingMs: Math.max(0, remaining),
                timeRemainingHours: Math.max(0, Math.ceil(remaining / 3_600_000)),
                hasExpired: remaining <= 0,
            };
        }));
    } catch (err) {
        console.error('Error fetching grievance deadlines:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getGrievanceDeadlineConfig = async (req, res) => {
    try {
        const config = await dbGet("SELECT config_value FROM system_configurations WHERE config_key = 'grievance_deadline_hours'");
        res.json({ grievance_deadline_hours: config ? Number(config.config_value) : 72 });
    } catch (err) {
        console.error('Error fetching grievance deadline config:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/** Changes the grievance window and moves the end of every open grievance window to match. */
const updateGrievanceDeadlineConfig = async (req, res) => {
    const hours = Number(req.body.grievance_deadline_hours);
    if (!validGrievanceHours(hours)) return res.status(400).json({ message: GRIEVANCE_RANGE_MESSAGE });
    try {
        await setConfig(req, 'grievance_deadline_hours', hours);
        const active = await dbAll('SELECT id, deadline_start FROM grievance_deadlines WHERE is_active = 1');
        for (const deadline of active) {
            const end = new Date(new Date(deadline.deadline_start).getTime() + hours * 3_600_000);
            await dbRun('UPDATE grievance_deadlines SET deadline_end = ? WHERE id = ?', [end, deadline.id]);
        }
        res.json({
            message: active.length ? `Grievance deadline updated; ${active.length} open window(s) adjusted` : 'Grievance deadline updated',
            grievance_deadline_hours: hours,
            updated_active_deadlines: active.length,
        });
    } catch (err) {
        console.error('Error updating grievance deadline config:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    createDepartment: departments.create,
    listDepartments: departments.list,
    deleteDepartment: departments.remove,
    createCommittee: committees.create,
    listCommittees: committees.list,
    deleteCommittee: committees.remove,
    createUser,
    listUsers,
    deleteUser,
    revealUserPassword,
    resetUserPassword,
    updateHodStatus,
    updateEprocStatus,
    getSystemConfigurations,
    updateSystemConfiguration,
    getGrievanceDeadlines,
    getGrievanceDeadlineConfig,
    updateGrievanceDeadlineConfig,
};

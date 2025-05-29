const { getDatabase, generateCredentials } = require('../config/database');
const bcrypt = require('bcryptjs');

// Department Controllers
exports.createDepartment = (req, res) => {
    const { name } = req.body;
    const db = getDatabase();

    if (!name) return res.status(400).json({ error: 'Department name is required' });

    db.run('INSERT INTO departments (name) VALUES (?)', [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Department already exists' });
            }
            return res.status(500).json({ error: 'Error creating department' });
        }
        res.status(201).json({ id: this.lastID, name });
    });
};

exports.listDepartments = (req, res) => {
    const db = getDatabase();
    db.all('SELECT * FROM departments ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error fetching departments' });
        res.json(rows);
    });
};

exports.deleteDepartment = (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    db.run('DELETE FROM departments WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: 'Error deleting department' });
        if (this.changes === 0) return res.status(404).json({ error: 'Department not found' });
        res.json({ message: 'Department deleted successfully' });
    });
};

// Committee Controllers
exports.createCommittee = (req, res) => {
    const { name } = req.body;
    const db = getDatabase();

    if (!name) return res.status(400).json({ error: 'Committee name is required' });

    db.run('INSERT INTO committees (name) VALUES (?)', [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Committee already exists' });
            }
            return res.status(500).json({ error: 'Error creating committee' });
        }
        res.status(201).json({ id: this.lastID, name });
    });
};

exports.listCommittees = (req, res) => {
    const db = getDatabase();
    db.all('SELECT * FROM committees ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error fetching committees' });
        res.json(rows);
    });
};

exports.deleteCommittee = (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    db.run('DELETE FROM committees WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: 'Error deleting committee' });
        if (this.changes === 0) return res.status(404).json({ error: 'Committee not found' });
        res.json({ message: 'Committee deleted successfully' });
    });
};

// User Controllers
exports.createUser = async (req, res) => {
    const { name, designation, departmentId, committeeId, eligibleForDemandCreation } = req.body;
    const db = getDatabase();
    
    if (!name || !designation || (!departmentId && !committeeId)) {
        return res.status(400).json({ error: 'Name, designation, and either department or committee are required' });
    }

    try {
        // Generate credentials
        const { username, password } = generateCredentials();
        const hashedPassword = await bcrypt.hash(password, 10);
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (name, username, password, plain_password, designation, department_id, committee_id, role, eligible_for_demand_creation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [name, username, hashedPassword, password, designation, departmentId || null, committeeId || null, 'user', eligibleForDemandCreation ? 1 : 0],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.status(201).json({
            message: 'User created successfully',
            credentials: {
                username,
                password // Send the plain password only once
            }
        });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Error creating user' });
    }
};

exports.listUsers = async (req, res) => {
    try {
        const db = getDatabase();
        const query = `
            SELECT u.id, u.name, u.username, u.plain_password as password, u.designation, 
                   u.department_id, u.committee_id, u.role, u.created_at,
                   d.name as department_name, c.name as committee_name, u.eligible_for_demand_creation as eligibleForDemandCreation 
            FROM users u 
            LEFT JOIN departments d ON u.department_id = d.id 
            LEFT JOIN committees c ON u.committee_id = c.id 
            WHERE u.role != 'superadmin'
            ORDER BY u.name`;

        const rows = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) {
                    console.error('Error in SQL query:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        res.json(rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Error fetching users' });
    }
};

exports.deleteUser = (req, res) => {
    const { id } = req.params;
    const db = getDatabase();
    db.run('DELETE FROM users WHERE id = ? AND role != "superadmin"', [id], function(err) {
        if (err) return res.status(500).json({ error: 'Error deleting user' });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found or cannot delete superadmin' });
        res.json({ message: 'User deleted successfully' });
    });
};

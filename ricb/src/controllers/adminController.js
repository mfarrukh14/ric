const { getDatabase, generateCredentials, generateUserBasedCredentials } = require('../config/database');
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
        // Generate credentials based on user's name
        const { username, password } = await generateUserBasedCredentials(name);
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

// Admin Controllers

// Get system configurations
exports.getSystemConfigurations = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is superadmin
    if (user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can view system configurations' });
    }

    try {
        const configurations = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM system_configurations ORDER BY config_key',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(configurations);
    } catch (error) {
        console.error('Error fetching system configurations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update system configuration
exports.updateSystemConfiguration = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { configKey, configValue } = req.body;

    // Check if user is superadmin
    if (user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can update system configurations' });
    }

    if (!configKey || configValue === undefined) {
        return res.status(400).json({ message: 'Configuration key and value are required' });
    }

    // Validate grievance deadline hours if that's what's being updated
    if (configKey === 'grievance_deadline_hours') {
        const hours = parseInt(configValue);
        if (isNaN(hours) || hours < 1 || hours > 720) { // 1 hour to 30 days (720 hours)
            return res.status(400).json({ 
                message: 'Grievance deadline must be between 1 hour and 720 hours (30 days)' 
            });
        }
    }

    try {
        // Update configuration
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE system_configurations 
                 SET config_value = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE config_key = ?`,
                [configValue, configKey],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Configuration not found'));
                    else resolve();
                }
            );
        });

        // Log the configuration change
        console.log(`⚙️ System configuration updated by ${user.name}: ${configKey} = ${configValue}`);

        res.json({ 
            message: 'Configuration updated successfully',
            configKey,
            configValue
        });
    } catch (error) {
        console.error('Error updating system configuration:', error);
        if (error.message === 'Configuration not found') {
            res.status(404).json({ message: 'Configuration not found' });
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

// Get active grievance deadlines
exports.getGrievanceDeadlines = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is superadmin
    if (user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can view grievance deadlines' });
    }

    try {
        const deadlines = await new Promise((resolve, reject) => {
            db.all(
                `SELECT gd.*, dt.bidding_end_time, d.item_name, d.description
                 FROM grievance_deadlines gd
                 JOIN demand_tenders dt ON gd.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE gd.is_active = 1
                 ORDER BY gd.deadline_end ASC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Add time remaining for each deadline
        const now = new Date();
        const enhancedDeadlines = deadlines.map(deadline => {
            const deadlineEnd = new Date(deadline.deadline_end);
            const timeRemaining = deadlineEnd.getTime() - now.getTime();
            
            return {
                ...deadline,
                timeRemainingMs: Math.max(0, timeRemaining),
                timeRemainingHours: Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60))),
                hasExpired: timeRemaining <= 0
            };
        });

        res.json(enhancedDeadlines);
    } catch (error) {
        console.error('Error fetching grievance deadlines:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get grievance deadline configuration
const getGrievanceDeadlineConfig = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    if (user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can view grievance deadline configuration' });
    }

    try {
        const config = await new Promise((resolve, reject) => {
            db.get(
                "SELECT config_value FROM system_configurations WHERE config_key = 'grievance_deadline_hours'",
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const grievanceDeadlineHours = config ? parseInt(config.config_value) : 72;

        res.json({
            grievance_deadline_hours: grievanceDeadlineHours
        });
    } catch (error) {
        console.error('Error fetching grievance deadline config:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update grievance deadline configuration
const updateGrievanceDeadlineConfig = async (req, res) => {
    const db = getDatabase();
    const user = req.user;
    const { grievance_deadline_hours } = req.body;

    if (user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmin can update grievance deadline configuration' });
    }

    // Convert to minutes for more granular validation
    const grievanceDeadlineMinutes = parseFloat(grievance_deadline_hours) * 60;
    
    // Allow 1 minute minimum to 72 hours (4320 minutes) maximum
    if (!grievance_deadline_hours || grievanceDeadlineMinutes < 1 || grievanceDeadlineMinutes > 4320) {
        return res.status(400).json({ 
            message: 'Grievance deadline must be between 1 minute (0.0167 hours) and 72 hours (4320 minutes)' 
        });
    }

    try {
        // Update the configuration
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO system_configurations 
                 (config_key, config_value, description, updated_at) 
                 VALUES ('grievance_deadline_hours', ?, 'Number of hours suppliers have to submit grievance applications after technical evaluation', CURRENT_TIMESTAMP)`,
                [grievance_deadline_hours.toString()],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Update existing active grievance deadlines
        const updatedDeadlines = await new Promise((resolve, reject) => {
            // First, get all active deadlines
            db.all(
                'SELECT id, deadline_start FROM grievance_deadlines WHERE is_active = 1',
                [],
                (err, activeDeadlines) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (activeDeadlines.length === 0) {
                        resolve([]);
                        return;
                    }

                    // Update each active deadline with new end time
                    const updatePromises = activeDeadlines.map(deadline => {
                        return new Promise((resolveUpdate, rejectUpdate) => {
                            const startTime = new Date(deadline.deadline_start);
                            const newEndTime = new Date(startTime.getTime() + (grievance_deadline_hours * 60 * 60 * 1000));
                            
                            db.run(
                                'UPDATE grievance_deadlines SET deadline_end = ? WHERE id = ?',
                                [newEndTime.toISOString(), deadline.id],
                                (updateErr) => {
                                    if (updateErr) rejectUpdate(updateErr);
                                    else resolveUpdate({ id: deadline.id, newEndTime });
                                }
                            );
                        });
                    });

                    Promise.all(updatePromises)
                        .then(results => resolve(results))
                        .catch(err => reject(err));
                }
            );
        });

        console.log(`⚙️ Grievance deadline configuration updated by ${user.name}: ${grievance_deadline_hours} hours`);
        if (updatedDeadlines.length > 0) {
            console.log(`📅 Updated ${updatedDeadlines.length} existing active deadline(s) with new timeframe`);
        }

        res.json({ 
            message: `Grievance deadline configuration updated successfully${updatedDeadlines.length > 0 ? ` and ${updatedDeadlines.length} active deadline(s) were updated` : ''}`,
            grievance_deadline_hours: grievance_deadline_hours,
            updated_active_deadlines: updatedDeadlines.length
        });
    } catch (error) {
        console.error('Error updating grievance deadline config:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    createDepartment: exports.createDepartment,
    listDepartments: exports.listDepartments,
    deleteDepartment: exports.deleteDepartment,
    createCommittee: exports.createCommittee,
    listCommittees: exports.listCommittees,
    deleteCommittee: exports.deleteCommittee,
    createUser: exports.createUser,
    listUsers: exports.listUsers,
    deleteUser: exports.deleteUser,
    getSystemConfigurations: exports.getSystemConfigurations,
    updateSystemConfiguration: exports.updateSystemConfiguration,
    getGrievanceDeadlines: exports.getGrievanceDeadlines,
    getGrievanceDeadlineConfig,
    updateGrievanceDeadlineConfig
};

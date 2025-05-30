const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, '../../database.sqlite');

let db = null;

const connectDatabase = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error connecting to database:', err);
                reject(err);
            } else {
                console.log('Connected to SQLite database');
                initializeDatabase().then(() => resolve(db)).catch(reject);
            }
        });
    });
};

const getDatabase = () => {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
};

const generateCredentials = () => {
    // Generate random username (6 characters)
    const username = crypto.randomBytes(3).toString('hex');
    // Generate random password (8 characters)
    const password = crypto.randomBytes(4).toString('hex');
    return { username, password };
};

const initializeDatabase = async () => {
    try {
        // Create departments table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create committees table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS committees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });        // Create users table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,                    name TEXT NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    plain_password TEXT,
                    designation TEXT,
                    department_id INTEGER,
                    committee_id INTEGER,
                    role TEXT NOT NULL,
                    eligible_for_demand_creation INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE CASCADE,
                FOREIGN KEY (committee_id) REFERENCES committees (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });        // Create demands table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS demands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                estimated_cost DECIMAL(10,2) NOT NULL,
                description TEXT NOT NULL,
                urgency TEXT NOT NULL DEFAULT 'normal',
                required_by DATE NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                store_response TEXT,
                store_response_at DATETIME,
                store_response_by INTEGER,
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (store_response_by) REFERENCES users (id) ON DELETE SET NULL
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create suppliers table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT NOT NULL,
                company_email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                company_statement TEXT NOT NULL,
                company_mission TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
                professional_tax_cert TEXT, -- file path
                ntn_document TEXT, -- file path
                drug_sale_license TEXT, -- file path
                pec_document TEXT, -- file path
                gst_document TEXT, -- file path
                rejection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                approved_at DATETIME,
                rejected_at DATETIME
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier evaluations table (tracks individual committee member evaluations)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                evaluator_id INTEGER NOT NULL,
                status TEXT NOT NULL, -- approved, rejected
                comments TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
                FOREIGN KEY (evaluator_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(supplier_id, evaluator_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Check if superadmin exists
        const row = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE role = 'superadmin'", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });        if (!row) {
            const hashedPassword = await bcrypt.hash('superadmin123', 10);
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
                    ['Super Admin', 'superadmin', hashedPassword, 'superadmin'],
                    (err) => {
                        if (err) reject(err);
                        else {
                            console.log('Superadmin user created successfully');
                            resolve();
                        }
                    }
                );
            });
        }

        // Check if Evaluation Committee exists
        const committeeRow = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM committees WHERE name = 'Evaluation Committee'", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!committeeRow) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO committees (name) VALUES (?)',
                    ['Evaluation Committee'],
                    (err) => {
                        if (err) reject(err);
                        else {
                            console.log('Evaluation Committee created successfully');
                            resolve();
                        }
                    }
                );
            });
        }
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    }
};

// Initialize the database connection
connectDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

module.exports = {
    getDatabase,
    generateCredentials
};

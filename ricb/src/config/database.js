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
        });

        // Create users table
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
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE CASCADE,
                FOREIGN KEY (committee_id) REFERENCES committees (id) ON DELETE CASCADE
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
        });

        if (!row) {
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

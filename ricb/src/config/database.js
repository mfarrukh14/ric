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
                status TEXT NOT NULL DEFAULT 'pending', -- pending, available, not_available, vetting, vetting_approved, purchase_review, approved, rejected, bidding_open, bidding_closed, awarded
                store_response TEXT,
                store_response_at DATETIME,
                store_response_by INTEGER,
                vetting_status TEXT DEFAULT 'pending', -- pending, approved, rejected
                vetting_rejection_reason TEXT,                purchase_status TEXT DEFAULT 'pending', -- pending, approved, rejected
                purchase_rejection_reason TEXT,
                purchase_response TEXT,
                purchase_response_by INTEGER,
                purchase_response_date DATETIME,
                bidding_expiry_time DATETIME, -- When bidding closes
                awarded_supplier_id INTEGER, -- ID of winning supplier
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (store_response_by) REFERENCES users (id) ON DELETE SET NULL,
                FOREIGN KEY (awarded_supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL
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
        });        // Create demand_items table (for multiple items per demand)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS demand_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                demand_id INTEGER NOT NULL,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                estimated_cost DECIMAL(10,2) NOT NULL,
                remarks TEXT,
                unit TEXT DEFAULT 'pieces',
                store_available_quantity INTEGER DEFAULT 0,
                store_status TEXT DEFAULT 'pending', -- pending, available, partial, not_available
                store_response_at DATETIME,
                store_response_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
                FOREIGN KEY (store_response_by) REFERENCES users (id) ON DELETE SET NULL
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });        // Create supplier evaluations table (tracks individual committee member evaluations)
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
        });        // Create demand evaluations table (tracks vetting committee and purchase department evaluations)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS demand_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                demand_id INTEGER NOT NULL,
                evaluator_id INTEGER NOT NULL,
                committee_type TEXT NOT NULL, -- 'vetting' or 'purchase'
                status TEXT NOT NULL, -- approved, rejected
                comments TEXT,
                updated_demand_data TEXT, -- JSON string of updated demand fields
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
                FOREIGN KEY (evaluator_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(demand_id, evaluator_id, committee_type)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });        // Create demand tenders table (for approved demands with bidding expiry)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS demand_tenders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                demand_id INTEGER NOT NULL,
                bidding_start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                bidding_end_time DATETIME NOT NULL,
                minimum_suppliers INTEGER DEFAULT 3,
                tender_status TEXT DEFAULT 'active', -- active, expired, awarded, cancelled
                awarded_supplier_id INTEGER,
                awarded_bid_amount DECIMAL(10,2),
                awarded_at DATETIME,
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
                FOREIGN KEY (awarded_supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(demand_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });        // Create supplier bids table (confidential bids from suppliers)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_bids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                supplier_id INTEGER NOT NULL,
                bid_amount DECIMAL(10,2),
                proposed_quantity INTEGER NOT NULL,
                delivery_days INTEGER NOT NULL,
                total_cost DECIMAL(10,2),
                bid_comments TEXT,
                bid_status TEXT DEFAULT 'submitted', -- submitted, won, lost
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders (id) ON DELETE CASCADE,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
                UNIQUE(tender_id, supplier_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });// Create supply orders table (awarded contracts)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supply_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_number TEXT UNIQUE NOT NULL,
                demand_id INTEGER NOT NULL,
                supplier_id INTEGER NOT NULL,
                tender_id INTEGER NOT NULL,
                bid_id INTEGER NOT NULL,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                delivery_date DATE NOT NULL,
                order_status TEXT DEFAULT 'pending', -- pending, delivered, cancelled
                pdf_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders (id) ON DELETE CASCADE,
                FOREIGN KEY (bid_id) REFERENCES supplier_bids (id) ON DELETE CASCADE
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
        }        // Check if Evaluation Committee exists
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

        // Check if Vetting Committee exists
        const vettingCommitteeRow = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM committees WHERE name = 'Vetting Committee'", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!vettingCommitteeRow) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO committees (name) VALUES (?)',
                    ['Vetting Committee'],
                    (err) => {
                        if (err) reject(err);
                        else {
                            console.log('Vetting Committee created successfully');
                            resolve();
                        }
                    }
                );
            });
        }

        // Check if Purchase Department exists
        const purchaseDeptRow = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM departments WHERE name = 'Purchase'", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!purchaseDeptRow) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO departments (name) VALUES (?)',
                    ['Purchase'],
                    (err) => {
                        if (err) reject(err);
                        else {
                            console.log('Purchase Department created successfully');
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

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

const generateUserBasedCredentials = async (name) => {
    const db = getDatabase();
    
    // Split name into words and get the second word if available, otherwise use the first word
    const words = name.trim().split(/\s+/);
    const nameToUse = words.length > 1 ? words[1] : words[0];
    
    // Clean the name: remove spaces, special characters, and convert to lowercase
    const cleanName = nameToUse.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Generate a random 2-digit number
    const randomNumber = Math.floor(Math.random() * 90) + 10; // 10-99
    
    // Create base username
    const baseUsername = `${cleanName}${randomNumber}.ric`;
    
    // Check if username already exists and generate a unique one
    let username = baseUsername;
    let counter = 1;
    
    while (await checkUsernameExists(username)) {
        username = `${cleanName}${randomNumber + counter}.ric`;
        counter++;
        
        // If we've tried too many combinations, use a random approach
        if (counter > 100) {
            const randomSuffix = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
            username = `${cleanName}${randomSuffix}.ric`;
            
            // Final check - if still exists, use timestamp
            if (await checkUsernameExists(username)) {
                username = `${cleanName}${Date.now().toString().slice(-4)}.ric`;
            }
            break;
        }
    }
    
    // Generate random password (8 characters)
    const password = crypto.randomBytes(4).toString('hex');
    
    return { username, password };
};

const checkUsernameExists = async (username) => {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT username FROM users WHERE username = ?',
            [username],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!row); // Convert to boolean
                }
            }
        );
    });
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
                status TEXT NOT NULL DEFAULT 'pending', -- pending, available, not_available, purchase_pending, purchase_approved, purchase_rejected, approved, rejected, bidding_open, bidding_closed, awarded
                store_response TEXT,
                store_response_at DATETIME,
                store_response_by INTEGER,
                purchase_status TEXT DEFAULT 'pending', -- pending, approved, rejected
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
                username TEXT UNIQUE NOT NULL,
                business_email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                email_verified INTEGER DEFAULT 0,
                registration_step INTEGER DEFAULT 0, -- 0: pending initial OTP, 1-6: registration steps
                status TEXT NOT NULL DEFAULT 'draft', -- draft, pending, approved, rejected
                rejection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                approved_at DATETIME,
                rejected_at DATETIME
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_business_profile table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_business_profile (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER UNIQUE NOT NULL,
                business_entity_type TEXT,
                business_category TEXT,
                business_industry TEXT,
                description TEXT,
                iban_number TEXT,
                business_name TEXT,
                contact_person_name TEXT,
                origin_classification TEXT, -- local, international
                origin_country TEXT,
                date_of_incorporation DATE,
                website_url TEXT,
                business_mobile_number TEXT,
                business_fax_number TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_registration_bodies table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_registration_bodies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                registration_body TEXT NOT NULL,
                registration_number TEXT NOT NULL,
                registration_date DATE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_documents table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                document_type TEXT NOT NULL, -- professional_tax_cert, ntn_document, drug_sale_license, pec_document, gst_document
                file_path TEXT NOT NULL,
                original_name TEXT NOT NULL,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_addresses table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                address_type TEXT NOT NULL, -- head_office, branch, warehouse, etc.
                address_line_1 TEXT NOT NULL,
                address_line_2 TEXT,
                city TEXT NOT NULL,
                state_province TEXT NOT NULL,
                postal_code TEXT NOT NULL,
                country TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_ppra_registrations table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_ppra_registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                ppra_type TEXT NOT NULL,
                registration_number TEXT NOT NULL,
                registration_date DATE NOT NULL,
                expiry_date DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_past_experience table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_past_experience (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                project_title TEXT NOT NULL,
                client_name TEXT NOT NULL,
                work_type TEXT NOT NULL,
                project_value TEXT,
                duration TEXT,
                start_date DATE,
                end_date DATE,
                status TEXT DEFAULT 'Completed',
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_client_references table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_client_references (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                contact_name TEXT NOT NULL,
                organization TEXT NOT NULL,
                position TEXT,
                phone TEXT,
                email TEXT,
                relationship TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_work_proof_images table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_work_proof_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                image_url TEXT NOT NULL,
                description TEXT,
                project_reference TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_resubmission_feedback table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_resubmission_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER NOT NULL,
                evaluator_id INTEGER NOT NULL,
                evaluator_name TEXT NOT NULL,
                failed_criteria TEXT NOT NULL, -- JSON string of failed criteria
                overall_comment TEXT,
                requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active INTEGER DEFAULT 1,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
                FOREIGN KEY (evaluator_id) REFERENCES users (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_otp_verifications table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_otp_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER,
                email TEXT NOT NULL,
                otp_code TEXT NOT NULL,
                otp_type TEXT NOT NULL, -- registration, email_verification
                expires_at DATETIME NOT NULL,
                verified INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_bids table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_bids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                supplier_id INTEGER NOT NULL,
                total_cost DECIMAL(10,2) NOT NULL,
                proposed_quantity INTEGER NOT NULL,
                delivery_days INTEGER NOT NULL,
                bid_comments TEXT,
                technical_bid_document TEXT, -- file path
                financial_bid_document TEXT, -- file path
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders (id) ON DELETE CASCADE,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
                UNIQUE(tender_id, supplier_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_bid_items table (for item-specific bid data)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_bid_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bid_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                item_name TEXT NOT NULL,
                required_quantity INTEGER NOT NULL,
                proposed_quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                total_cost DECIMAL(10,2) NOT NULL,
                unit TEXT DEFAULT 'pieces',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (bid_id) REFERENCES supplier_bids (id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES demand_items (id) ON DELETE CASCADE,
                UNIQUE(bid_id, item_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supply_orders table
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
                order_status TEXT DEFAULT 'pending', -- pending, confirmed, delivered, cancelled
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
      // Create demand_items table (for multiple items per demand)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS demand_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                demand_id INTEGER NOT NULL,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                estimated_cost DECIMAL(10,2) NOT NULL,
                remarks TEXT,
                specifications TEXT,
                unit TEXT DEFAULT 'pieces',
                store_available_quantity INTEGER DEFAULT 0,
                store_status TEXT DEFAULT 'pending', -- pending, available, partial, not_available
                store_fulfilled INTEGER DEFAULT 0, -- 0 = not fulfilled by store, 1 = fulfilled by store
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
        });        // Create demand evaluations table (tracks purchase department evaluations)
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS demand_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                demand_id INTEGER NOT NULL,
                evaluator_id INTEGER NOT NULL,
                committee_type TEXT NOT NULL, -- 'purchase'
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
                technical_evaluation_completed_at DATETIME,
                technical_evaluation_completed_by INTEGER,
                evaluation_remarks TEXT,
                tender_document_path TEXT, -- path to uploaded tender document PDF
                items_list_path TEXT, -- path to uploaded items list Excel/CSV
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
                FOREIGN KEY (awarded_supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
                FOREIGN KEY (technical_evaluation_completed_by) REFERENCES users (id) ON DELETE SET NULL,
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(demand_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });        // Create grievance_applications table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS grievance_applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                technical_evaluation_id INTEGER NOT NULL,
                supplier_id INTEGER NOT NULL,
                tender_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                grievance_reason TEXT NOT NULL,
                supporting_documents TEXT,
                requested_action TEXT NOT NULL,
                additional_comments TEXT,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'under_review', 'meeting_scheduled', 'resolved', 'rejected')),
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reviewed_by INTEGER,
                reviewed_at DATETIME,
                meeting_scheduled_date DATETIME,
                meeting_details TEXT,
                resolution TEXT,
                FOREIGN KEY (technical_evaluation_id) REFERENCES technical_evaluations(id),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                FOREIGN KEY (reviewed_by) REFERENCES users(id),
                UNIQUE(technical_evaluation_id, supplier_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create financial_openings table
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS financial_openings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                scheduled_opening_time DATETIME NOT NULL,
                scheduled_by INTEGER NOT NULL,
                status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'opened', 'cancelled')),
                opened_at DATETIME,
                opened_by INTEGER,
                results TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                FOREIGN KEY (scheduled_by) REFERENCES users(id),
                FOREIGN KEY (opened_by) REFERENCES users(id),
                UNIQUE(tender_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create system_configurations table for admin settings
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS system_configurations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_key TEXT UNIQUE NOT NULL,
                config_value TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create grievance_deadlines table to track individual tender deadlines
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS grievance_deadlines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                deadline_start DATETIME NOT NULL,
                deadline_end DATETIME NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                UNIQUE(tender_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create audit_logs table for comprehensive audit trail
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                user_role TEXT NOT NULL,
                user_name TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create indexes for audit_logs table for better performance
        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create tender_evaluation_criteria table for knockout clauses
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS tender_evaluation_criteria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                criteria_title TEXT NOT NULL,
                criteria_description TEXT NOT NULL,
                is_knockout BOOLEAN DEFAULT 1, -- 1 for knockout, 0 for scoring
                minimum_requirement TEXT,
                weightage DECIMAL(5,2) DEFAULT 0, -- for scoring criteria
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create tender_status_history table to track tender workflow
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS tender_status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                status TEXT NOT NULL, -- pending, approved, rejected, published
                comments TEXT,
                changed_by INTEGER NOT NULL,
                changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders(id) ON DELETE CASCADE,
                FOREIGN KEY (changed_by) REFERENCES users(id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_tender_views table to track supplier interactions
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS supplier_tender_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tender_id INTEGER NOT NULL,
                supplier_id INTEGER NOT NULL,
                viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                criteria_acknowledged BOOLEAN DEFAULT 0,
                FOREIGN KEY (tender_id) REFERENCES demand_tenders(id) ON DELETE CASCADE,
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
                UNIQUE(tender_id, supplier_id)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create item_categories table for dropdown categories
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS item_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create item_names table for dropdown item names
        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS item_names (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES item_categories (id) ON DELETE CASCADE,
                UNIQUE(category_id, name)
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Create supplier_otp_verification table for email and SMS verification
        await new Promise((resolve, reject) => {
            // First check if table exists and drop it to recreate with new structure
            db.run(`DROP TABLE IF EXISTS supplier_otp_verification`, (err) => {
                if (err) {
                    console.log('Note: supplier_otp_verification table did not exist, creating new one');
                }
                
                // Create the table with new SMS structure
                db.run(`CREATE TABLE IF NOT EXISTS supplier_otp_verification (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL,
                    phone_number TEXT NOT NULL,
                    email_otp_code TEXT NOT NULL,
                    sms_otp_code TEXT NOT NULL,
                    registration_data TEXT NOT NULL,
                    file_paths TEXT,
                    expires_at DATETIME NOT NULL,
                    email_verified INTEGER DEFAULT 0,
                    sms_verified INTEGER DEFAULT 0,
                    is_completed INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    email_verified_at DATETIME,
                    sms_verified_at DATETIME,
                    completed_at DATETIME
                )`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });

        // Create indexes for supplier_otp_verification table
        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_email ON supplier_otp_verification(email)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_phone ON supplier_otp_verification(phone_number)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_email_code ON supplier_otp_verification(email_otp_code)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_sms_code ON supplier_otp_verification(sms_otp_code)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_expires ON supplier_otp_verification(expires_at)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Run database migrations
        await runMigrations();

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

        // Initialize default item categories
        const defaultCategories = [
            { name: 'Medical Equipment', description: 'Medical and healthcare equipment' },
            { name: 'Office Supplies', description: 'General office and administrative supplies' },
            { name: 'Laboratory Supplies', description: 'Laboratory equipment and consumables' },
            { name: 'Pharmaceuticals', description: 'Medicines and pharmaceutical products' },
            { name: 'IT Equipment', description: 'Information technology hardware and software' },
            { name: 'Maintenance Supplies', description: 'Maintenance and repair supplies' }
        ];

        for (const category of defaultCategories) {
            const existingCategory = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM item_categories WHERE name = ?", [category.name], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!existingCategory) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO item_categories (name, description) VALUES (?, ?)',
                        [category.name, category.description],
                        (err) => {
                            if (err) reject(err);
                            else {
                                console.log(`Default category '${category.name}' created successfully`);
                                resolve();
                            }
                        }
                    );
                });
            }
        }

        // Initialize default item names for each category
        const defaultItems = {
            'Medical Equipment': [
                'Stethoscope', 'Blood Pressure Monitor', 'Thermometer', 'Pulse Oximeter', 
                'ECG Machine', 'X-ray Film', 'Surgical Gloves', 'Face Masks'
            ],
            'Office Supplies': [
                'A4 Paper', 'Pens', 'Pencils', 'Folders', 'Stapler', 'Paper Clips', 
                'Notebooks', 'Envelopes', 'Printer Cartridges'
            ],
            'Laboratory Supplies': [
                'Test Tubes', 'Petri Dishes', 'Microscope Slides', 'Pipettes', 
                'Beakers', 'Reagents', 'Lab Coats', 'Safety Goggles'
            ],
            'Pharmaceuticals': [
                'Paracetamol', 'Antibiotics', 'Insulin', 'Vaccines', 'Syringes', 
                'IV Fluids', 'Bandages', 'Antiseptic Solution'
            ],
            'IT Equipment': [
                'Computers', 'Laptops', 'Printers', 'Keyboards', 'Mouse', 
                'Monitors', 'Network Cables', 'Software Licenses'
            ],
            'Maintenance Supplies': [
                'Cleaning Chemicals', 'Tools', 'Spare Parts', 'Electrical Items', 
                'Plumbing Supplies', 'Paint', 'Brushes', 'Safety Equipment'
            ]
        };

        for (const [categoryName, items] of Object.entries(defaultItems)) {
            // Get category ID
            const category = await new Promise((resolve, reject) => {
                db.get("SELECT id FROM item_categories WHERE name = ?", [categoryName], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (category) {
                for (const itemName of items) {
                    const existingItem = await new Promise((resolve, reject) => {
                        db.get("SELECT * FROM item_names WHERE category_id = ? AND name = ?", 
                               [category.id, itemName], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });

                    if (!existingItem) {
                        await new Promise((resolve, reject) => {
                            db.run(
                                'INSERT INTO item_names (category_id, name) VALUES (?, ?)',
                                [category.id, itemName],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                    }
                }
                console.log(`Default items for '${categoryName}' category initialized`);
            }
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
        
        // Check if Store Department exists
        const storeDeptRow = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM departments WHERE name = 'Store'", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!storeDeptRow) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO departments (name) VALUES (?)',
                    ['Store'],
                    (err) => {
                        if (err) reject(err);
                        else {
                            console.log('Store Department created successfully');
                            resolve();
                        }
                    }
                );
            });
        }

        // Check if Grievance Committee exists
        const grievanceCommitteeRow = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM committees WHERE name = 'Grievance Committee'", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!grievanceCommitteeRow) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO committees (name) VALUES (?)',
                    ['Grievance Committee'],
                    (err) => {
                        if (err) reject(err);
                        else {
                            console.log('Grievance Committee created successfully');
                            resolve();
                        }
                    }
                );
            });
        }

        // Check if Technical Evaluation Committee exists
        const technicalCommitteeRow = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM committees WHERE name = 'Technical Evaluation Committee'", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!technicalCommitteeRow) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO committees (name) VALUES (?)',
                    ['Technical Evaluation Committee'],
                    (err) => {
                        if (err) reject(err);
                        else {
                            console.log('Technical Evaluation Committee created successfully');
                            resolve();
                        }
                    }
                );
            });
        }

        // Initialize default system configurations
        const defaultConfigs = [
            {
                key: 'grievance_deadline_hours',
                value: '72',
                description: 'Number of hours suppliers have to submit grievance after technical evaluation (min: 1 hour, max: 720 hours/30 days)'
            }
        ];

        for (const config of defaultConfigs) {
            const existingConfig = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM system_configurations WHERE config_key = ?", [config.key], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!existingConfig) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO system_configurations (config_key, config_value, description) VALUES (?, ?, ?)',
                        [config.key, config.value, config.description],
                        (err) => {
                            if (err) reject(err);
                            else {
                                console.log(`Default configuration '${config.key}' created successfully`);
                                resolve();
                            }
                        }
                    );
                });
            }
        }
    } catch (err) {
        console.error('Error initializing database:', err);
    }
};

// Database migrations
const runMigrations = async () => {
    try {
        console.log('Running database migrations...');
        
        // Migration 1: Add store_fulfilled column to demand_items table
        await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(demand_items)", [], (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Check if store_fulfilled column exists
                const hasStoreFulfilledColumn = columns.some(col => col.name === 'store_fulfilled');
                
                if (!hasStoreFulfilledColumn) {
                    console.log('Adding store_fulfilled column to demand_items table...');
                    db.run("ALTER TABLE demand_items ADD COLUMN store_fulfilled INTEGER DEFAULT 0", (err) => {
                        if (err) {
                            console.error('Error adding store_fulfilled column:', err);
                            reject(err);
                        } else {
                            console.log('Successfully added store_fulfilled column');
                            resolve();
                        }
                    });
                } else {
                    console.log('store_fulfilled column already exists');
                    resolve();
                }
            });
        });        // Migration 2: Create supplier_bid_items table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_bid_items'", [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    console.log('Creating supplier_bid_items table...');
                    db.run(`CREATE TABLE IF NOT EXISTS supplier_bid_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        bid_id INTEGER NOT NULL,
                        item_id INTEGER NOT NULL,
                        item_name TEXT NOT NULL,
                        required_quantity INTEGER NOT NULL,
                        proposed_quantity INTEGER NOT NULL,
                        unit_price DECIMAL(10,2) NOT NULL,
                        total_cost DECIMAL(10,2) NOT NULL,
                        unit TEXT DEFAULT 'pieces',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (bid_id) REFERENCES supplier_bids (id) ON DELETE CASCADE,
                        FOREIGN KEY (item_id) REFERENCES demand_items (id) ON DELETE CASCADE,
                        UNIQUE(bid_id, item_id)
                    )`, (err) => {
                        if (err) {
                            console.error('Error creating supplier_bid_items table:', err);
                            reject(err);
                        } else {
                            console.log('Successfully created supplier_bid_items table');
                            resolve();
                        }
                    });
                } else {
                    console.log('supplier_bid_items table already exists');
                    resolve();
                }
            });
        });

        // Migration 3: Create financial_openings table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_openings'", [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    console.log('Creating financial_openings table...');
                    db.run(`CREATE TABLE IF NOT EXISTS financial_openings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        tender_id INTEGER NOT NULL,
                        scheduled_opening_time DATETIME NOT NULL,
                        scheduled_by INTEGER NOT NULL,
                        status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'opened', 'cancelled')),
                        opened_at DATETIME,
                        opened_by INTEGER,
                        results TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                        FOREIGN KEY (scheduled_by) REFERENCES users(id),
                        FOREIGN KEY (opened_by) REFERENCES users(id),
                        UNIQUE(tender_id)
                    )`, (err) => {
                        if (err) {
                            console.error('Error creating financial_openings table:', err);
                            reject(err);
                        } else {
                            console.log('Successfully created financial_openings table');
                            resolve();
                        }
                    });
                } else {
                    console.log('financial_openings table already exists');
                    resolve();
                }
            });
        });

        // Migration 4: Create system_configurations table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='system_configurations'", [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    console.log('Creating system_configurations table...');
                    db.run(`CREATE TABLE IF NOT EXISTS system_configurations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        config_key TEXT UNIQUE NOT NULL,
                        config_value TEXT NOT NULL,
                        description TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`, (err) => {
                        if (err) {
                            console.error('Error creating system_configurations table:', err);
                            reject(err);
                        } else {
                            console.log('Successfully created system_configurations table');
                            resolve();
                        }
                    });
                } else {
                    console.log('system_configurations table already exists');
                    resolve();
                }
            });
        });

        // Migration 5: Create grievance_deadlines table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='grievance_deadlines'", [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    console.log('Creating grievance_deadlines table...');
                    db.run(`CREATE TABLE IF NOT EXISTS grievance_deadlines (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        tender_id INTEGER NOT NULL,
                        deadline_start DATETIME NOT NULL,
                        deadline_end DATETIME NOT NULL,
                        is_active INTEGER DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
                        UNIQUE(tender_id)
                    )`, (err) => {
                        if (err) {
                            console.error('Error creating grievance_deadlines table:', err);
                            reject(err);
                        } else {
                            console.log('Successfully created grievance_deadlines table');
                            resolve();
                        }
                    });
                } else {
                    console.log('grievance_deadlines table already exists');
                    resolve();
                }
            });
        });

        // Migration 4: Add new columns to demand_items table for categories and fiscal year costs
        await new Promise((resolve, reject) => {
            // Check if new columns exist
            db.get("PRAGMA table_info(demand_items)", [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Get all columns
                db.all("PRAGMA table_info(demand_items)", [], (err, columns) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const columnNames = columns.map(col => col.name);
                    const hasNewColumns = columnNames.includes('category_id') && 
                                          columnNames.includes('item_name_id') && 
                                          columnNames.includes('prev_year_cost') && 
                                          columnNames.includes('current_year_cost');
                    
                    if (!hasNewColumns) {
                        console.log('Adding new columns to demand_items table...');
                        
                        // Add columns one by one
                        const addColumn = (columnDef) => {
                            return new Promise((resolveCol, rejectCol) => {
                                db.run(`ALTER TABLE demand_items ADD COLUMN ${columnDef}`, (err) => {
                                    if (err && !err.message.includes('duplicate column name')) {
                                        rejectCol(err);
                                    } else {
                                        resolveCol();
                                    }
                                });
                            });
                        };
                        
                        Promise.all([
                            addColumn('category_id INTEGER'),
                            addColumn('item_name_id INTEGER'),
                            addColumn('prev_year_cost DECIMAL(10,2) DEFAULT 0'),
                            addColumn('current_year_cost DECIMAL(10,2) DEFAULT 0'),
                            addColumn('stock_in_hand INTEGER DEFAULT 0'),
                            addColumn('consumption_type TEXT DEFAULT "monthly"'),
                            addColumn('consumption_amount INTEGER DEFAULT 0'),
                            addColumn('calculated_required_qty INTEGER DEFAULT 0'),
                            addColumn('store_estimated_cost DECIMAL(10,2) DEFAULT 0'),
                            addColumn('removal_reason TEXT'),
                            addColumn('is_removed INTEGER DEFAULT 0')
                        ]).then(() => {
                            console.log('Successfully added new columns to demand_items table');
                            resolve();
                        }).catch((err) => {
                            console.error('Error adding columns to demand_items table:', err);
                            reject(err);
                        });
                    } else {
                        console.log('demand_items table already has new columns');
                        resolve();
                    }
                });
            });
        });

        // Migration 6: Add 2FA columns to users table
        await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(users)", [], (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const columnNames = columns.map(col => col.name);
                const has2FAColumns = columnNames.includes('two_factor_secret') && 
                                      columnNames.includes('two_factor_enabled') && 
                                      columnNames.includes('backup_codes');
                
                if (!has2FAColumns) {
                    console.log('Adding 2FA columns to users table...');
                    
                    const addColumn = (columnDef) => {
                        return new Promise((resolveCol, rejectCol) => {
                            db.run(`ALTER TABLE users ADD COLUMN ${columnDef}`, (err) => {
                                if (err && !err.message.includes('duplicate column name')) {
                                    rejectCol(err);
                                } else {
                                    resolveCol();
                                }
                            });
                        });
                    };
                    
                    Promise.all([
                        addColumn('two_factor_secret TEXT'),
                        addColumn('two_factor_enabled INTEGER DEFAULT 0'),
                        addColumn('backup_codes TEXT')
                    ]).then(() => {
                        console.log('Successfully added 2FA columns to users table');
                        resolve();
                    }).catch((err) => {
                        console.error('Error adding 2FA columns to users table:', err);
                        reject(err);
                    });
                } else {
                    console.log('users table already has 2FA columns');
                    resolve();
                }
            });
        });

        // Migration 7: Create supplier_otp_verification table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_otp_verification'", [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    console.log('Creating supplier_otp_verification table...');
                    db.run(`CREATE TABLE IF NOT EXISTS supplier_otp_verification (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT NOT NULL,
                        phone_number TEXT NOT NULL,
                        email_otp_code TEXT NOT NULL,
                        sms_otp_code TEXT NOT NULL,
                        registration_data TEXT NOT NULL,
                        file_paths TEXT,
                        expires_at DATETIME NOT NULL,
                        email_verified INTEGER DEFAULT 0,
                        sms_verified INTEGER DEFAULT 0,
                        is_completed INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        email_verified_at DATETIME,
                        sms_verified_at DATETIME,
                        completed_at DATETIME
                    )`, (err) => {
                        if (err) {
                            console.error('Error creating supplier_otp_verification table:', err);
                            reject(err);
                        } else {
                            console.log('Successfully created supplier_otp_verification table');
                            
                            // Create indexes after table creation
                            Promise.all([
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_email ON supplier_otp_verification(email)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                }),
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_phone ON supplier_otp_verification(phone_number)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                }),
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_email_code ON supplier_otp_verification(email_otp_code)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                }),
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_sms_code ON supplier_otp_verification(sms_otp_code)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                }),
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_supplier_otp_expires ON supplier_otp_verification(expires_at)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                })
                            ]).then(() => {
                                console.log('Successfully created indexes for supplier_otp_verification table');
                                resolve();
                            }).catch(reject);
                        }
                    });
                } else {
                    // Table exists, check if it has the new SMS columns
                    db.all("PRAGMA table_info(supplier_otp_verification)", [], (err, columns) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        const columnNames = columns.map(col => col.name);
                        const hasSMSColumns = columnNames.includes('phone_number') && 
                                             columnNames.includes('email_otp_code') && 
                                             columnNames.includes('sms_otp_code') &&
                                             columnNames.includes('email_verified') &&
                                             columnNames.includes('sms_verified');
                        
                        if (!hasSMSColumns) {
                            console.log('Updating supplier_otp_verification table for SMS support...');
                            
                            // Drop and recreate table to add SMS support
                            db.run(`DROP TABLE IF EXISTS supplier_otp_verification`, (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                // Recreate with new structure
                                db.run(`CREATE TABLE supplier_otp_verification (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    email TEXT NOT NULL,
                                    phone_number TEXT NOT NULL,
                                    email_otp_code TEXT NOT NULL,
                                    sms_otp_code TEXT NOT NULL,
                                    registration_data TEXT NOT NULL,
                                    file_paths TEXT,
                                    expires_at DATETIME NOT NULL,
                                    email_verified INTEGER DEFAULT 0,
                                    sms_verified INTEGER DEFAULT 0,
                                    is_completed INTEGER DEFAULT 0,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    email_verified_at DATETIME,
                                    sms_verified_at DATETIME,
                                    completed_at DATETIME
                                )`, (err) => {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        console.log('Successfully updated supplier_otp_verification table');
                                        resolve();
                                    }
                                });
                            });
                        } else {
                            console.log('supplier_otp_verification table already has SMS columns');
                            resolve();
                        }
                    });
                }
            });
        });

        // Migration 8: Add contact_person_name to supplier_business_profile table
        await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(supplier_business_profile)", [], (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const columnNames = columns.map(col => col.name);
                const hasContactPersonName = columnNames.includes('contact_person_name');
                
                if (!hasContactPersonName) {
                    console.log('Adding contact_person_name column to supplier_business_profile table...');
                    db.run("ALTER TABLE supplier_business_profile ADD COLUMN contact_person_name TEXT", (err) => {
                        if (err) {
                            console.error('Error adding contact_person_name column:', err);
                            reject(err);
                        } else {
                            console.log('Successfully added contact_person_name column');
                            resolve();
                        }
                    });
                } else {
                    console.log('contact_person_name column already exists');
                    resolve();
                }
            });
        });

        // Migration 9: Create detailed item categorization tables
        await new Promise((resolve, reject) => {
            console.log('Creating detailed item categorization tables...');
            
            // Create drug categories table (for medicine items)
            db.run(`CREATE TABLE IF NOT EXISTS drug_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating drug_categories table:', err);
                    reject(err);
                } else {
                    console.log('Successfully created drug_categories table');
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            // Create drug names table
            db.run(`CREATE TABLE IF NOT EXISTS drug_names (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                drug_category_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (drug_category_id) REFERENCES drug_categories (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) {
                    console.error('Error creating drug_names table:', err);
                    reject(err);
                } else {
                    console.log('Successfully created drug_names table');
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            // Create strength units table
            db.run(`CREATE TABLE IF NOT EXISTS strength_units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                abbreviation TEXT NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating strength_units table:', err);
                    reject(err);
                } else {
                    console.log('Successfully created strength_units table');
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            // Create dosage forms table
            db.run(`CREATE TABLE IF NOT EXISTS dosage_forms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating dosage_forms table:', err);
                    reject(err);
                } else {
                    console.log('Successfully created dosage_forms table');
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            // Create preparations table
            db.run(`CREATE TABLE IF NOT EXISTS preparations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating preparations table:', err);
                    reject(err);
                } else {
                    console.log('Successfully created preparations table');
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            // Create equipment categories table (for medical equipment items)
            db.run(`CREATE TABLE IF NOT EXISTS equipment_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating equipment_categories table:', err);
                    reject(err);
                } else {
                    console.log('Successfully created equipment_categories table');
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            // Create equipment types table
            db.run(`CREATE TABLE IF NOT EXISTS equipment_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_category_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (equipment_category_id) REFERENCES equipment_categories (id) ON DELETE CASCADE
            )`, (err) => {
                if (err) {
                    console.error('Error creating equipment_types table:', err);
                    reject(err);
                } else {
                    console.log('Successfully created equipment_types table');
                    resolve();
                }
            });
        });

        // Migration 10: Update demand_items table structure for detailed categorization
        await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(demand_items)", [], (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const columnNames = columns.map(col => col.name);
                const needsDetailedColumns = !columnNames.includes('drug_category_id');
                
                if (needsDetailedColumns) {
                    console.log('Adding detailed categorization columns to demand_items table...');
                    
                    // Add all new columns for detailed item categorization
                    const alterQueries = [
                        "ALTER TABLE demand_items ADD COLUMN drug_category_id INTEGER",
                        "ALTER TABLE demand_items ADD COLUMN drug_name_id INTEGER", 
                        "ALTER TABLE demand_items ADD COLUMN strength_value DECIMAL(10,2)",
                        "ALTER TABLE demand_items ADD COLUMN strength_unit_id INTEGER",
                        "ALTER TABLE demand_items ADD COLUMN dosage_form_id INTEGER",
                        "ALTER TABLE demand_items ADD COLUMN preparation_id INTEGER",
                        "ALTER TABLE demand_items ADD COLUMN equipment_category_id INTEGER",
                        "ALTER TABLE demand_items ADD COLUMN equipment_type_id INTEGER"
                    ];
                    
                    let completed = 0;
                    
                    alterQueries.forEach((query, index) => {
                        db.run(query, (err) => {
                            if (err) {
                                console.error(`Error executing query ${query}:`, err);
                                reject(err);
                            } else {
                                completed++;
                                if (completed === alterQueries.length) {
                                    console.log('Successfully added detailed categorization columns');
                                    resolve();
                                }
                            }
                        });
                    });
                } else {
                    console.log('Detailed categorization columns already exist');
                    resolve();
                }
            });
        });

        // Migration 12: Create audit_logs table if it doesn't exist
        await new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'", [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    console.log('Creating audit_logs table...');
                    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        user_role TEXT NOT NULL,
                        user_name TEXT NOT NULL,
                        action TEXT NOT NULL,
                        details TEXT,
                        ip_address TEXT,
                        user_agent TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`, (err) => {
                        if (err) {
                            console.error('Error creating audit_logs table:', err);
                            reject(err);
                        } else {
                            console.log('Successfully created audit_logs table');
                            
                            // Create indexes after table creation
                            Promise.all([
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                }),
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                }),
                                new Promise((resolveIdx, rejectIdx) => {
                                    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`, (err) => {
                                        if (err) rejectIdx(err);
                                        else resolveIdx();
                                    });
                                })
                            ]).then(() => {
                                console.log('Successfully created indexes for audit_logs table');
                                resolve();
                            }).catch(reject);
                        }
                    });
                } else {
                    console.log('audit_logs table already exists');
                    resolve();
                }
            });
        });

        // Migration 11: Insert default drug categories and related data
        await new Promise((resolve, reject) => {
            console.log('Inserting default drug categories...');
            
            const drugCategories = [
                { name: 'Nitrates', description: 'Vasodilators for heart conditions' },
                { name: 'Beta-blockers', description: 'Heart rate and blood pressure medications' },
                { name: 'Calcium-antagonists', description: 'Calcium channel blockers' },
                { name: 'ACE inhibitors', description: 'Angiotensin-converting enzyme inhibitors' },
                { name: 'Antibiotics', description: 'Anti-bacterial medications' },
                { name: 'Analgesics', description: 'Pain relief medications' },
                { name: 'Anti-inflammatory', description: 'Anti-inflammatory medications' }
            ];
            
            let insertedCategories = 0;
            
            const insertNextDrugCategory = (index) => {
                if (index >= drugCategories.length) {
                    console.log('Successfully inserted default drug categories');
                    resolve();
                    return;
                }
                
                const category = drugCategories[index];
                db.run(
                    'INSERT OR IGNORE INTO drug_categories (name, description) VALUES (?, ?)',
                    [category.name, category.description],
                    (err) => {
                        if (err) {
                            console.error(`Error inserting drug category ${category.name}:`, err);
                        }
                        insertedCategories++;
                        // Continue with next category regardless of error
                        insertNextDrugCategory(index + 1);
                    }
                );
            };
            
            insertNextDrugCategory(0);
        });

        await new Promise((resolve, reject) => {
            console.log('Inserting default drug names...');
            
            // First get the drug category IDs
            db.all('SELECT id, name FROM drug_categories', [], (err, categories) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const categoryMap = {};
                categories.forEach(cat => {
                    categoryMap[cat.name] = cat.id;
                });
                
                const drugNames = [
                    { category: 'Nitrates', name: 'Glyceryl trinitrate', description: 'Short-acting nitrate' },
                    { category: 'Nitrates', name: 'Isosorbide dinitrate', description: 'Long-acting nitrate' },
                    { category: 'Beta-blockers', name: 'Propranolol', description: 'Non-selective beta blocker' },
                    { category: 'Beta-blockers', name: 'Metoprolol', description: 'Selective beta blocker' },
                    { category: 'Calcium-antagonists', name: 'Amlodipine', description: 'Calcium channel blocker' },
                    { category: 'Calcium-antagonists', name: 'Nifedipine', description: 'Calcium channel blocker' },
                    { category: 'ACE inhibitors', name: 'Lisinopril', description: 'ACE inhibitor for hypertension' },
                    { category: 'ACE inhibitors', name: 'Enalapril', description: 'ACE inhibitor for heart failure' }
                ];
                
                let insertedNames = 0;
                
                drugNames.forEach(drug => {
                    const categoryId = categoryMap[drug.category];
                    if (categoryId) {
                        db.run(
                            'INSERT OR IGNORE INTO drug_names (drug_category_id, name, description) VALUES (?, ?, ?)',
                            [categoryId, drug.name, drug.description],
                            (err) => {
                                if (err) {
                                    console.error(`Error inserting drug name ${drug.name}:`, err);
                                } else {
                                    insertedNames++;
                                    if (insertedNames === drugNames.length) {
                                        console.log('Successfully inserted default drug names');
                                        resolve();
                                    }
                                }
                            }
                        );
                    }
                });
            });
        });

        await new Promise((resolve, reject) => {
            console.log('Inserting default strength units...');
            
            const strengthUnits = [
                { name: 'milligram', abbreviation: 'mg' },
                { name: 'gram', abbreviation: 'g' },
                { name: 'microgram', abbreviation: 'mcg' },
                { name: 'unit', abbreviation: 'IU' },
                { name: 'milliliter', abbreviation: 'ml' },
                { name: 'percentage', abbreviation: '%' }
            ];
            
            let insertedUnits = 0;
            
            strengthUnits.forEach(unit => {
                db.run(
                    'INSERT OR IGNORE INTO strength_units (name, abbreviation) VALUES (?, ?)',
                    [unit.name, unit.abbreviation],
                    (err) => {
                        if (err) {
                            console.error(`Error inserting strength unit ${unit.name}:`, err);
                        } else {
                            insertedUnits++;
                            if (insertedUnits === strengthUnits.length) {
                                console.log('Successfully inserted default strength units');
                                resolve();
                            }
                        }
                    }
                );
            });
        });

        await new Promise((resolve, reject) => {
            console.log('Inserting default dosage forms...');
            
            const dosageForms = [
                { name: 'Tablet', description: 'Solid dosage form' },
                { name: 'Syrup', description: 'Liquid dosage form' },
                { name: 'Injection', description: 'Injectable form' },
                { name: 'Ampule', description: 'Glass container for injection' },
                { name: 'Sublingual tablet', description: 'Under-tongue tablet' },
                { name: 'Capsule', description: 'Encapsulated form' },
                { name: 'Cream', description: 'Topical form' },
                { name: 'Ointment', description: 'Topical semi-solid form' }
            ];
            
            let insertedForms = 0;
            
            const insertNextForm = (index) => {
                if (index >= dosageForms.length) {
                    console.log('Successfully inserted default dosage forms');
                    resolve();
                    return;
                }
                
                const form = dosageForms[index];
                db.run(
                    'INSERT OR IGNORE INTO dosage_forms (name, description) VALUES (?, ?)',
                    [form.name, form.description],
                    (err) => {
                        if (err) {
                            console.error(`Error inserting dosage form ${form.name}:`, err);
                        }
                        insertedForms++;
                        // Continue with next form regardless of error
                        insertNextForm(index + 1);
                    }
                );
            };
            
            insertNextForm(0);
        });

        await new Promise((resolve, reject) => {
            console.log('Inserting default preparations...');
            
            const preparations = [
                { name: 'Oral', description: 'Taken by mouth' },
                { name: 'Parenteral', description: 'Administered by injection' },
                { name: 'Topical', description: 'Applied to skin or surface' },
                { name: 'Inhaler', description: 'Inhaled into lungs' },
                { name: 'Suspension for nebulization', description: 'For nebulizer use' },
                { name: 'Sublingual', description: 'Under the tongue' },
                { name: 'Rectal', description: 'Administered rectally' }
            ];
            
            let insertedPreparations = 0;
            
            const insertNextPreparation = (index) => {
                if (index >= preparations.length) {
                    console.log('Successfully inserted default preparations');
                    resolve();
                    return;
                }
                
                const prep = preparations[index];
                db.run(
                    'INSERT OR IGNORE INTO preparations (name, description) VALUES (?, ?)',
                    [prep.name, prep.description],
                    (err) => {
                        if (err) {
                            console.error(`Error inserting preparation ${prep.name}:`, err);
                        }
                        insertedPreparations++;
                        // Continue with next preparation regardless of error
                        insertNextPreparation(index + 1);
                    }
                );
            };
            
            insertNextPreparation(0);
        });

        await new Promise((resolve, reject) => {
            console.log('Inserting default equipment categories...');
            
            const equipmentCategories = [
                { name: 'Diagnostic Equipment', description: 'Equipment for medical diagnosis' },
                { name: 'Surgical Instruments', description: 'Instruments used in surgery' },
                { name: 'Patient Monitoring', description: 'Equipment for monitoring patient vitals' },
                { name: 'Laboratory Equipment', description: 'Equipment for laboratory testing' },
                { name: 'Imaging Equipment', description: 'Equipment for medical imaging' }
            ];
            
            let insertedEquipCategories = 0;
            
            const insertNextEquipCategory = (index) => {
                if (index >= equipmentCategories.length) {
                    console.log('Successfully inserted default equipment categories');
                    resolve();
                    return;
                }
                
                const category = equipmentCategories[index];
                db.run(
                    'INSERT OR IGNORE INTO equipment_categories (name, description) VALUES (?, ?)',
                    [category.name, category.description],
                    (err) => {
                        if (err) {
                            console.error(`Error inserting equipment category ${category.name}:`, err);
                        }
                        insertedEquipCategories++;
                        // Continue with next category regardless of error
                        insertNextEquipCategory(index + 1);
                    }
                );
            };
            
            insertNextEquipCategory(0);
        });
        
        console.log('Database migrations completed successfully');
    } catch (error) {
        console.error('Error running database migrations:', error);
        throw error;
    }
};

module.exports = {
    connectDatabase,
    getDatabase,
    generateCredentials,
    generateUserBasedCredentials
};

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
let db = null;

/**
 * Database Connection and Management
 */
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

/**
 * User Credential Generation
 */
const generateCredentials = () => {
    const username = crypto.randomBytes(3).toString('hex');
    const password = crypto.randomBytes(4).toString('hex');
    return { username, password };
};

const generateUserBasedCredentials = async (name) => {
    const db = getDatabase();
    
    const words = name.trim().split(/\s+/);
    const nameToUse = words.length > 1 ? words[1] : words[0];
    const cleanName = nameToUse.toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomNumber = Math.floor(Math.random() * 90) + 10;
    
    let username = `${cleanName}${randomNumber}.ric`;
    let counter = 1;
    
    while (await checkUsernameExists(username)) {
        username = `${cleanName}${randomNumber + counter}.ric`;
        counter++;
        
        if (counter > 100) {
            const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
            username = `${cleanName}${randomSuffix}.ric`;
            
            if (await checkUsernameExists(username)) {
                username = `${cleanName}${Date.now().toString().slice(-4)}.ric`;
            }
            break;
        }
    }
    
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
                if (err) reject(err);
                else resolve(!!row);
            }
        );
    });
};

/**
 * Database Schema Definitions
 */
const SCHEMA = {
    // Core system tables
    departments: `CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    committees: `CREATE TABLE IF NOT EXISTS committees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    users: `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        plain_password TEXT,
        designation TEXT,
        department_id INTEGER,
        committee_id INTEGER,
        role TEXT NOT NULL,
        eligible_for_demand_creation INTEGER NOT NULL DEFAULT 0,
        two_factor_secret TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        backup_codes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE CASCADE,
        FOREIGN KEY (committee_id) REFERENCES committees (id) ON DELETE CASCADE
    )`,
    
    // Item categorization tables
    item_categories: `CREATE TABLE IF NOT EXISTS item_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    item_names: `CREATE TABLE IF NOT EXISTS item_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES item_categories (id) ON DELETE CASCADE,
        UNIQUE(category_id, name COLLATE NOCASE)
    )`,
    
    // Pharmaceutical categorization
    drug_categories: `CREATE TABLE IF NOT EXISTS drug_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    drug_names: `CREATE TABLE IF NOT EXISTS drug_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drug_category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (drug_category_id) REFERENCES drug_categories (id) ON DELETE CASCADE,
        UNIQUE(drug_category_id, name COLLATE NOCASE)
    )`,
    
    strength_units: `CREATE TABLE IF NOT EXISTS strength_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        abbreviation TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    dosage_forms: `CREATE TABLE IF NOT EXISTS dosage_forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    preparations: `CREATE TABLE IF NOT EXISTS preparations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Equipment categorization
    equipment_categories: `CREATE TABLE IF NOT EXISTS equipment_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    equipment_types: `CREATE TABLE IF NOT EXISTS equipment_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (equipment_category_id) REFERENCES equipment_categories (id) ON DELETE CASCADE,
        UNIQUE(equipment_category_id, name COLLATE NOCASE)
    )`,
    
    // Demand management
    demands: `CREATE TABLE IF NOT EXISTS demands (
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
        purchase_status TEXT DEFAULT 'pending',
        purchase_rejection_reason TEXT,
        purchase_response TEXT,
        purchase_response_by INTEGER,
        purchase_response_date DATETIME,
        bidding_expiry_time DATETIME,
        awarded_supplier_id INTEGER,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (store_response_by) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (awarded_supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL
    )`,
    
    demand_items: `CREATE TABLE IF NOT EXISTS demand_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        demand_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        estimated_cost DECIMAL(10,2) NOT NULL,
        remarks TEXT,
        specifications TEXT,
        unit TEXT DEFAULT 'pieces',
        store_available_quantity INTEGER DEFAULT 0,
        store_status TEXT DEFAULT 'pending',
        store_fulfilled INTEGER DEFAULT 0,
        store_response_at DATETIME,
        store_response_by INTEGER,
        category_id INTEGER,
        item_name_id INTEGER,
        prev_year_cost DECIMAL(10,2) DEFAULT 0,
        current_year_cost DECIMAL(10,2) DEFAULT 0,
        stock_in_hand INTEGER DEFAULT 0,
        consumption_type TEXT DEFAULT "monthly",
        consumption_amount INTEGER DEFAULT 0,
        calculated_required_qty INTEGER DEFAULT 0,
        store_estimated_cost DECIMAL(10,2) DEFAULT 0,
        removal_reason TEXT,
        is_removed INTEGER DEFAULT 0,
        drug_category_id INTEGER,
        drug_name_id INTEGER,
        strength_value DECIMAL(10,2),
        strength_unit_id INTEGER,
        dosage_form_id INTEGER,
        preparation_id INTEGER,
        equipment_category_id INTEGER,
        equipment_type_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
        FOREIGN KEY (store_response_by) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (category_id) REFERENCES item_categories (id),
        FOREIGN KEY (item_name_id) REFERENCES item_names (id),
        FOREIGN KEY (drug_category_id) REFERENCES drug_categories (id),
        FOREIGN KEY (drug_name_id) REFERENCES drug_names (id),
        FOREIGN KEY (strength_unit_id) REFERENCES strength_units (id),
        FOREIGN KEY (dosage_form_id) REFERENCES dosage_forms (id),
        FOREIGN KEY (preparation_id) REFERENCES preparations (id),
        FOREIGN KEY (equipment_category_id) REFERENCES equipment_categories (id),
        FOREIGN KEY (equipment_type_id) REFERENCES equipment_types (id)
    )`,
    
    // Supplier management
    suppliers: `CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        business_email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email_verified INTEGER DEFAULT 0,
        registration_step INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        rejection_reason TEXT,
        two_factor_secret TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        backup_codes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        rejected_at DATETIME
    )`,
    
    supplier_business_profile: `CREATE TABLE IF NOT EXISTS supplier_business_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER UNIQUE NOT NULL,
        business_entity_type TEXT,
        business_category TEXT,
        business_industry TEXT,
        description TEXT,
        iban_number TEXT,
        business_name TEXT,
        contact_person_name TEXT,
        origin_classification TEXT,
        origin_country TEXT,
        date_of_incorporation DATE,
        website_url TEXT,
        business_mobile_number TEXT,
        business_fax_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )`,
    
    // Additional supplier tables (registration bodies, documents, addresses, etc.)
    supplier_registration_bodies: `CREATE TABLE IF NOT EXISTS supplier_registration_bodies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        registration_body TEXT NOT NULL,
        registration_number TEXT NOT NULL,
        registration_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )`,
    
    supplier_documents: `CREATE TABLE IF NOT EXISTS supplier_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        document_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )`,
    
    supplier_addresses: `CREATE TABLE IF NOT EXISTS supplier_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        address_type TEXT NOT NULL,
        address_line_1 TEXT NOT NULL,
        address_line_2 TEXT,
        city TEXT NOT NULL,
        state_province TEXT NOT NULL,
        postal_code TEXT NOT NULL,
        country TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )`,
    
    supplier_ppra_registrations: `CREATE TABLE IF NOT EXISTS supplier_ppra_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        ppra_type TEXT NOT NULL,
        registration_number TEXT NOT NULL,
        registration_date DATE NOT NULL,
        expiry_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )`,
    
    supplier_past_experience: `CREATE TABLE IF NOT EXISTS supplier_past_experience (
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
    )`,
    
    supplier_client_references: `CREATE TABLE IF NOT EXISTS supplier_client_references (
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
    )`,
    
    supplier_work_proof_images: `CREATE TABLE IF NOT EXISTS supplier_work_proof_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        description TEXT,
        project_reference TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )`,
    
    supplier_resubmission_feedback: `CREATE TABLE IF NOT EXISTS supplier_resubmission_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        evaluator_id INTEGER NOT NULL,
        evaluator_name TEXT NOT NULL,
        failed_criteria TEXT NOT NULL,
        overall_comment TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
        FOREIGN KEY (evaluator_id) REFERENCES users (id) ON DELETE CASCADE
    )`,
    
    supplier_otp_verifications: `CREATE TABLE IF NOT EXISTS supplier_otp_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER,
        email TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        otp_type TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )`,
    
    supplier_otp_verification: `CREATE TABLE IF NOT EXISTS supplier_otp_verification (
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
    )`,
    
    // Tender and bidding system
    demand_tenders: `CREATE TABLE IF NOT EXISTS demand_tenders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        demand_id INTEGER NOT NULL,
        bidding_start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        bidding_end_time DATETIME NOT NULL,
        minimum_suppliers INTEGER DEFAULT 3,
        tender_status TEXT DEFAULT 'active',
        awarded_supplier_id INTEGER,
        awarded_bid_amount DECIMAL(10,2),
        awarded_at DATETIME,
        technical_evaluation_completed_at DATETIME,
        technical_evaluation_completed_by INTEGER,
        evaluation_remarks TEXT,
        tender_document_path TEXT,
        items_list_path TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
        FOREIGN KEY (awarded_supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
        FOREIGN KEY (technical_evaluation_completed_by) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(demand_id)
    )`,
    
    supplier_bids: `CREATE TABLE IF NOT EXISTS supplier_bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        total_cost DECIMAL(10,2) NOT NULL,
        proposed_quantity INTEGER NOT NULL,
        delivery_days INTEGER NOT NULL,
        bid_comments TEXT,
        technical_bid_document TEXT,
        financial_bid_document TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders (id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
        UNIQUE(tender_id, supplier_id)
    )`,
    
    supplier_bid_items: `CREATE TABLE IF NOT EXISTS supplier_bid_items (
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
    )`,
    
    // Evaluation and approval system
    supplier_evaluations: `CREATE TABLE IF NOT EXISTS supplier_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        evaluator_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        comments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
        FOREIGN KEY (evaluator_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(supplier_id, evaluator_id)
    )`,
    
    demand_evaluations: `CREATE TABLE IF NOT EXISTS demand_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        demand_id INTEGER NOT NULL,
        evaluator_id INTEGER NOT NULL,
        committee_type TEXT NOT NULL,
        status TEXT NOT NULL,
        comments TEXT,
        updated_demand_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
        FOREIGN KEY (evaluator_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(demand_id, evaluator_id, committee_type)
    )`,
    
    technical_evaluations: `CREATE TABLE IF NOT EXISTS technical_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        bid_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('approved','rejected')),
        rejection_reason TEXT,
        evaluated_by INTEGER NOT NULL,
        evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        knockout_clauses_checked INTEGER DEFAULT 0,
        knockout_clause_failures TEXT,
        grievance_marked INTEGER DEFAULT 0,
        total_score REAL,
        scoring_breakdown TEXT,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
        FOREIGN KEY (bid_id) REFERENCES supplier_bids(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (evaluated_by) REFERENCES users(id),
        UNIQUE(tender_id, item_id, bid_id)
    )`,
    
    // Grievance system
    grievance_applications: `CREATE TABLE IF NOT EXISTS grievance_applications (
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
    )`,
    
    grievance_deadlines: `CREATE TABLE IF NOT EXISTS grievance_deadlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        deadline_start DATETIME NOT NULL,
        deadline_end DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
        UNIQUE(tender_id)
    )`,
    
    // Financial opening system
    financial_openings: `CREATE TABLE IF NOT EXISTS financial_openings (
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
    )`,
    
    // Supply order management
    supply_orders: `CREATE TABLE IF NOT EXISTS supply_orders (
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
        order_status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (demand_id) REFERENCES demands (id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders (id) ON DELETE CASCADE,
        FOREIGN KEY (bid_id) REFERENCES supplier_bids (id) ON DELETE CASCADE
    )`,
    
    // Tender evaluation criteria
    tender_evaluation_criteria: `CREATE TABLE IF NOT EXISTS tender_evaluation_criteria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        criteria_title TEXT NOT NULL,
        criteria_description TEXT NOT NULL,
        is_knockout BOOLEAN DEFAULT 1,
        minimum_requirement TEXT,
        weightage DECIMAL(5,2) DEFAULT 0,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    
    tender_status_history: `CREATE TABLE IF NOT EXISTS tender_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        comments TEXT,
        changed_by INTEGER NOT NULL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id)
    )`,
    
    supplier_tender_views: `CREATE TABLE IF NOT EXISTS supplier_tender_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        criteria_acknowledged BOOLEAN DEFAULT 0,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
        UNIQUE(tender_id, supplier_id)
    )`,
    
    supplier_knockout_acknowledgments: `CREATE TABLE IF NOT EXISTS supplier_knockout_acknowledgments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        all_clauses_checked INTEGER DEFAULT 0,
        checklist JSON,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
        UNIQUE(tender_id, supplier_id)
    )`,
    
    // System configuration and audit
    system_configurations: `CREATE TABLE IF NOT EXISTS system_configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT UNIQUE NOT NULL,
        config_value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    audit_logs: `CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_role TEXT NOT NULL,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Temporary approval tables
    temporary_approvals: `CREATE TABLE IF NOT EXISTS temporary_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        tender_id INTEGER NOT NULL,
        technical_evaluation_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
        FOREIGN KEY (technical_evaluation_id) REFERENCES technical_evaluations(id),
        UNIQUE(supplier_id, tender_id)
    )`,
    
    temporary_approved_pools: `CREATE TABLE IF NOT EXISTS temporary_approved_pools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        approved_suppliers TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES demand_tenders(id),
        UNIQUE(tender_id)
    )`
};

/**
 * Index Definitions
 */
const INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
    'CREATE INDEX IF NOT EXISTS idx_supplier_otp_email ON supplier_otp_verification(email)',
    'CREATE INDEX IF NOT EXISTS idx_supplier_otp_phone ON supplier_otp_verification(phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_supplier_otp_email_code ON supplier_otp_verification(email_otp_code)',
    'CREATE INDEX IF NOT EXISTS idx_supplier_otp_sms_code ON supplier_otp_verification(sms_otp_code)',
    'CREATE INDEX IF NOT EXISTS idx_supplier_otp_expires ON supplier_otp_verification(expires_at)'
];

/**
 * Default Data
 */
const DEFAULT_DATA = {
    departments: [
        { name: 'Purchase', description: 'Purchase Department' },
        { name: 'Store', description: 'Store Department' }
    ],
    
    committees: [
        { name: 'Evaluation Committee' },
        { name: 'Grievance Committee' },
        { name: 'Technical Evaluation Committee' }
    ],
    
    item_categories: [
        { name: 'Medical Equipment', description: 'Medical and healthcare equipment' },
        { name: 'Office Supplies', description: 'General office and administrative supplies' },
        { name: 'Laboratory Supplies', description: 'Laboratory equipment and consumables' },
        { name: 'Pharmaceuticals', description: 'Medicines and pharmaceutical products' },
        { name: 'IT Equipment', description: 'Information technology hardware and software' },
        { name: 'Maintenance Supplies', description: 'Maintenance and repair supplies' }
    ],
    
    drug_categories: [
        { name: 'Nitrates', description: 'Vasodilators for heart conditions' },
        { name: 'Beta-blockers', description: 'Heart rate and blood pressure medications' },
        { name: 'Calcium-antagonists', description: 'Calcium channel blockers' },
        { name: 'ACE inhibitors', description: 'Angiotensin-converting enzyme inhibitors' },
        { name: 'Antibiotics', description: 'Anti-bacterial medications' },
        { name: 'Analgesics', description: 'Pain relief medications' },
        { name: 'Anti-inflammatory', description: 'Anti-inflammatory medications' }
    ],
    
    drug_names: [
        { category: 'Nitrates', name: 'Glyceryl trinitrate', description: 'Short-acting nitrate' },
        { category: 'Nitrates', name: 'Isosorbide dinitrate', description: 'Long-acting nitrate' },
        { category: 'Beta-blockers', name: 'Propranolol', description: 'Non-selective beta blocker' },
        { category: 'Beta-blockers', name: 'Metoprolol', description: 'Selective beta blocker' },
        { category: 'Calcium-antagonists', name: 'Amlodipine', description: 'Calcium channel blocker' },
        { category: 'Calcium-antagonists', name: 'Nifedipine', description: 'Calcium channel blocker' },
        { category: 'ACE inhibitors', name: 'Lisinopril', description: 'ACE inhibitor for hypertension' },
        { category: 'ACE inhibitors', name: 'Enalapril', description: 'ACE inhibitor for heart failure' }
    ],
    
    strength_units: [
        { name: 'milligram', abbreviation: 'mg' },
        { name: 'gram', abbreviation: 'g' },
        { name: 'microgram', abbreviation: 'mcg' },
        { name: 'unit', abbreviation: 'IU' },
        { name: 'milliliter', abbreviation: 'ml' },
        { name: 'percentage', abbreviation: '%' }
    ],
    
    dosage_forms: [
        { name: 'Tablet', description: 'Solid dosage form' },
        { name: 'Syrup', description: 'Liquid dosage form' },
        { name: 'Injection', description: 'Injectable form' },
        { name: 'Ampule', description: 'Glass container for injection' },
        { name: 'Sublingual tablet', description: 'Under-tongue tablet' },
        { name: 'Capsule', description: 'Encapsulated form' },
        { name: 'Cream', description: 'Topical form' },
        { name: 'Ointment', description: 'Topical semi-solid form' }
    ],
    
    preparations: [
        { name: 'Oral', description: 'Taken by mouth' },
        { name: 'Parenteral', description: 'Administered by injection' },
        { name: 'Topical', description: 'Applied to skin or surface' },
        { name: 'Inhaler', description: 'Inhaled into lungs' },
        { name: 'Suspension for nebulization', description: 'For nebulizer use' },
        { name: 'Sublingual', description: 'Under the tongue' },
        { name: 'Rectal', description: 'Administered rectally' }
    ],
    
    equipment_categories: [
        { name: 'Diagnostic Equipment', description: 'Equipment for medical diagnosis' },
        { name: 'Surgical Instruments', description: 'Instruments used in surgery' },
        { name: 'Patient Monitoring', description: 'Equipment for monitoring patient vitals' },
        { name: 'Laboratory Equipment', description: 'Equipment for laboratory testing' },
        { name: 'Imaging Equipment', description: 'Equipment for medical imaging' }
    ],
    
    system_configurations: [
        {
            key: 'grievance_deadline_hours',
            value: '72',
            description: 'Number of hours suppliers have to submit grievance after technical evaluation (min: 1 hour, max: 720 hours/30 days)'
        }
    ]
};

/**
 * Database Initialization
 */
const initializeDatabase = async () => {
    try {
        console.log('Initializing database schema...');
        
        // Create all tables
        for (const [tableName, schema] of Object.entries(SCHEMA)) {
            await createTable(tableName, schema);
        }
        
        // Create indexes
        for (const index of INDEXES) {
            await createIndex(index);
        }
        
        // Create superadmin if not exists
        await createSuperAdmin();
        
        // Initialize default data
        await initializeDefaultData();
        
        console.log('Database initialization completed successfully');
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    }
};

const createTable = (tableName, schema) => {
    return new Promise((resolve, reject) => {
        db.run(schema, (err) => {
            if (err) {
                console.error(`Error creating table ${tableName}:`, err);
                reject(err);
            } else {
                console.log(`Table ${tableName} ready`);
                resolve();
            }
        });
    });
};

const createIndex = (indexSQL) => {
    return new Promise((resolve, reject) => {
        db.run(indexSQL, (err) => {
            if (err) {
                console.error(`Error creating index:`, err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

const createSuperAdmin = async () => {
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
};

const initializeDefaultData = async () => {
    try {
        // Initialize departments
        for (const dept of DEFAULT_DATA.departments) {
            await insertIfNotExists('departments', 'name', dept.name, dept);
        }
        
        // Initialize committees
        for (const committee of DEFAULT_DATA.committees) {
            await insertIfNotExists('committees', 'name', committee.name, committee);
        }
        
        // Initialize item categories
        for (const category of DEFAULT_DATA.item_categories) {
            await insertIfNotExists('item_categories', 'name', category.name, category);
        }
        
        // Initialize drug categories
        for (const category of DEFAULT_DATA.drug_categories) {
            await insertIfNotExists('drug_categories', 'name', category.name, category);
        }
        
        // Initialize drug names
        const drugCategories = await getAllDrugCategories();
        for (const drug of DEFAULT_DATA.drug_names) {
            const category = drugCategories.find(c => c.name === drug.category);
            if (category) {
                const drugData = {
                    drug_category_id: category.id,
                    name: drug.name,
                    description: drug.description
                };
                await insertDrugIfNotExists(drugData);
            }
        }
        
        // Initialize strength units
        for (const unit of DEFAULT_DATA.strength_units) {
            await insertIfNotExists('strength_units', 'name', unit.name, unit);
        }
        
        // Initialize dosage forms
        for (const form of DEFAULT_DATA.dosage_forms) {
            await insertIfNotExists('dosage_forms', 'name', form.name, form);
        }
        
        // Initialize preparations
        for (const prep of DEFAULT_DATA.preparations) {
            await insertIfNotExists('preparations', 'name', prep.name, prep);
        }
        
        // Initialize equipment categories
        for (const category of DEFAULT_DATA.equipment_categories) {
            await insertIfNotExists('equipment_categories', 'name', category.name, category);
        }
        
        // Initialize system configurations
        for (const config of DEFAULT_DATA.system_configurations) {
            await insertIfNotExists('system_configurations', 'config_key', config.key, {
                config_key: config.key,
                config_value: config.value,
                description: config.description
            });
        }
        
        console.log('Default data initialization completed');
    } catch (err) {
        console.error('Error initializing default data:', err);
        throw err;
    }
};

const insertIfNotExists = (table, checkColumn, checkValue, data) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM ${table} WHERE ${checkColumn} = ?`, [checkValue], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!row) {
                const columns = Object.keys(data).join(', ');
                const placeholders = Object.keys(data).map(() => '?').join(', ');
                const values = Object.values(data);
                
                db.run(
                    `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
                    values,
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            } else {
                resolve();
            }
        });
    });
};

const insertDrugIfNotExists = (drugData) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM drug_names WHERE drug_category_id = ? AND LOWER(name) = LOWER(?)',
            [drugData.drug_category_id, drugData.name],
            (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    db.run(
                        'INSERT INTO drug_names (drug_category_id, name, description) VALUES (?, ?, ?)',
                        [drugData.drug_category_id, drugData.name, drugData.description],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                } else {
                    resolve();
                }
            }
        );
    });
};

const getAllDrugCategories = () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT id, name FROM drug_categories', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

module.exports = {
    connectDatabase,
    getDatabase,
    generateCredentials,
    generateUserBasedCredentials
};

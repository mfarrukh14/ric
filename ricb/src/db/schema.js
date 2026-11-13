/**
 * Database schema, written once in SQLite syntax. The SQL Server adapter
 * translates it, so the same definitions build both databases.
 *
 * migrate() is idempotent and runs on every start: it creates missing tables,
 * adds columns an older database lacks, and seeds reference data. To change the
 * schema, edit the table definition here; existing databases get new columns on
 * the next start.
 */
const bcrypt = require('bcryptjs');
const { parseInstant } = require('../utils/time');

const TABLES = {
    schema_migrations: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    audit_logs: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_role TEXT NOT NULL,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    category_field_options: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field_id INTEGER NOT NULL,
        value TEXT NOT NULL,
        parent_option_id INTEGER,
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    category_fields: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'dropdown')),
        depends_on_field_id INTEGER,
        is_required INTEGER DEFAULT 1,
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    committees: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    demand_evaluations: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        demand_id INTEGER NOT NULL,
        evaluator_id INTEGER NOT NULL,
        committee_type TEXT NOT NULL,
        status TEXT NOT NULL,
        comments TEXT,
        updated_demand_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(demand_id, evaluator_id, committee_type)`,
    demand_item_field_values: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        demand_item_id INTEGER NOT NULL,
        field_id INTEGER NOT NULL,
        value_text TEXT,
        option_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(demand_item_id, field_id)`,
    demand_items: `
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        category_id INTEGER,
        item_name_id INTEGER,
        prev_year_cost DECIMAL(10,2) DEFAULT 0,
        current_year_cost DECIMAL(10,2) DEFAULT 0,
        stock_in_hand INTEGER DEFAULT 0,
        consumption_type TEXT DEFAULT 'monthly',
        consumption_amount INTEGER DEFAULT 0,
        calculated_required_qty INTEGER DEFAULT 0,
        requested_quantity INTEGER,
        store_estimated_cost DECIMAL(10,2) DEFAULT 0,
        removal_reason TEXT,
        is_removed INTEGER DEFAULT 0,
        custom_item_name TEXT`,
    demand_tenders: `
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
        opened_by INTEGER,
        opened_at DATETIME,
        tender_number TEXT,
        purchase_hod_response_by INTEGER,
        purchase_hod_response_at DATETIME,
        finance_hod_response_by INTEGER,
        finance_hod_response_at DATETIME,
        finance_hod_status TEXT DEFAULT 'pending',
        ms_hod_response_by INTEGER,
        ms_hod_response_at DATETIME,
        ms_hod_status TEXT DEFAULT 'pending',
        published_at DATETIME,
        published_by INTEGER,
        time_extension_reason TEXT,
        time_extension_by INTEGER,
        time_extension_at DATETIME,
        UNIQUE(demand_id)`,
    demands: `
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
        is_merged INTEGER DEFAULT 0,
        hod_status TEXT DEFAULT NULL,
        hod_response_by INTEGER DEFAULT NULL,
        hod_response_at DATETIME DEFAULT NULL,
        hod_rejection_reason TEXT DEFAULT NULL,
        rejection_reason TEXT,
        rejected_by INTEGER,
        rejected_at DATETIME,
        vetting_rejection_reason TEXT`,
    departments: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    financial_grievance_emails: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grievance_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        email_address TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
        error_message TEXT,
        sent_at DATETIME,
        opened_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    financial_grievances: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        meeting_datetime DATETIME NOT NULL,
        meeting_location TEXT NOT NULL,
        custom_message TEXT,
        grievance_start_date DATETIME NOT NULL,
        grievance_end_date DATETIME NOT NULL,
        initiated_by INTEGER NOT NULL,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
        emails_sent INTEGER DEFAULT 0,
        total_recipients INTEGER DEFAULT 0,
        meeting_held_at DATETIME,
        meeting_minutes_file TEXT,
        completed_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tender_id)`,
    financial_opening_reports: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        report_file_path TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_size INTEGER,
        generated_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    financial_openings: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        scheduled_opening_time DATETIME NOT NULL,
        scheduled_by INTEGER NOT NULL,
        status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'opened', 'cancelled')),
        opened_at DATETIME,
        opened_by INTEGER,
        results TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tender_id)`,
    grievance_applications: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        technical_evaluation_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        tender_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        grievance_reason TEXT NOT NULL,
        supporting_documents TEXT,
        requested_action TEXT NOT NULL,
        additional_comments TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'meeting_scheduled', 'resolved', 'rejected')),
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        meeting_scheduled_date DATETIME,
        meeting_details TEXT,
        resolution TEXT,
        UNIQUE(technical_evaluation_id, supplier_id)`,
    grievance_deadlines: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        deadline_start DATETIME NOT NULL,
        deadline_end DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tender_id)`,
    item_categories: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    item_names: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category_id, name)`,
    knockout_clause_documents: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        clause_id INTEGER NOT NULL,
        document_filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tender_id, supplier_id, clause_id)`,
    letter_recipients: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        letter_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        supplier_email TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        email_status TEXT DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'bounced')),
        sent_at DATETIME,
        error_message TEXT,
        opened_at DATETIME,
        downloaded_at DATETIME,
        UNIQUE(letter_id, supplier_id)`,
    market_survey_documents: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        survey_id INTEGER NOT NULL,
        document_type TEXT NOT NULL CHECK (document_type IN ('supporting', 'evaluation')),
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    market_surveys: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        sent_by INTEGER NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        completed_by INTEGER,
        notes TEXT,
        UNIQUE(tender_id)`,
    merged_demands: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        new_demand_id INTEGER NOT NULL,
        original_demand_id INTEGER NOT NULL,
        merged_by INTEGER NOT NULL,
        merged_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    pre_bid_meetings: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        meeting_date DATE NOT NULL,
        meeting_time TIME NOT NULL,
        location TEXT NOT NULL,
        agenda TEXT,
        description TEXT,
        scheduled_by INTEGER NOT NULL,
        scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
        minutes_file_path TEXT,
        minutes_original_name TEXT,
        completed_by INTEGER,
        completed_at DATETIME,
        cancellation_reason TEXT,
        cancelled_by INTEGER,
        cancelled_at DATETIME,
        venue TEXT,
        additional_notes TEXT,
        UNIQUE(tender_id)`,
    purchase_department_grievances: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        bid_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        rejection_reason TEXT NOT NULL,
        supplier_email TEXT NOT NULL,
        supplier_name TEXT,
        contact_person TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_by TEXT,
        reviewed_at DATETIME,
        approval_comments TEXT`,
    purchase_orders: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        po_number TEXT NOT NULL UNIQUE,
        tender_id INTEGER NOT NULL,
        award_letter_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        items TEXT NOT NULL,
        total_amount DECIMAL(15,2) NOT NULL,
        status TEXT DEFAULT 'created' CHECK (status IN ('created', 'sent', 'acknowledged', 'fulfilled', 'cancelled')),
        remarks TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME,
        acknowledged_at DATETIME,
        fulfilled_at DATETIME,
        cancelled_at DATETIME,
        cancellation_reason TEXT,
        delivery_date TEXT,
        payment_terms TEXT,
        billing_address TEXT,
        shipping_address TEXT,
        contact_name TEXT,
        contact_phone TEXT,
        contact_email TEXT,
        reference_no TEXT`,
    supplier_addresses: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        address_type TEXT NOT NULL,
        address_line_1 TEXT NOT NULL,
        address_line_2 TEXT,
        city TEXT NOT NULL,
        state_province TEXT NOT NULL,
        postal_code TEXT NOT NULL,
        country TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_awards: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        bid_id INTEGER NOT NULL,
        award_letter_id INTEGER,
        award_amount DECIMAL(10,2),
        awarded_items TEXT,
        award_status TEXT DEFAULT 'awarded' CHECK (award_status IN ('awarded', 'contract_signed', 'completed', 'cancelled')),
        awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        contract_signed_at DATETIME,
        completion_date DATE,
        notes TEXT,
        UNIQUE(tender_id, supplier_id)`,
    supplier_bid_items: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bid_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        required_quantity INTEGER NOT NULL,
        proposed_quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_cost DECIMAL(10,2) NOT NULL,
        unit TEXT DEFAULT 'pieces',
        manufacturer_brand TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bid_id, item_id)`,
    supplier_bids: `
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
        bid_cdr_document TEXT,
        UNIQUE(tender_id, supplier_id)`,
    supplier_business_profile: `
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_client_references: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        contact_name TEXT NOT NULL,
        organization TEXT NOT NULL,
        position TEXT,
        phone TEXT,
        email TEXT,
        relationship TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_documents: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        document_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_evaluations: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        evaluator_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        comments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(supplier_id, evaluator_id)`,
    supplier_knockout_acknowledgments: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        all_clauses_checked INTEGER DEFAULT 0,
        checklist JSON,
        UNIQUE(tender_id, supplier_id)`,
    supplier_otp_verifications: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER,
        email TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        otp_type TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_past_experience: `
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_ppra_registrations: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        ppra_type TEXT NOT NULL,
        registration_number TEXT NOT NULL,
        registration_date DATE NOT NULL,
        expiry_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_registration_bodies: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        registration_body TEXT NOT NULL,
        registration_number TEXT NOT NULL,
        registration_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    supplier_resubmission_feedback: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        evaluator_id INTEGER NOT NULL,
        evaluator_name TEXT NOT NULL,
        failed_criteria TEXT NOT NULL,
        overall_comment TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1`,
    supplier_tender_views: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        criteria_acknowledged BOOLEAN DEFAULT 0,
        UNIQUE(tender_id, supplier_id)`,
    supplier_work_proof_images: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        description TEXT,
        project_reference TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    suppliers: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        business_email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email_verified INTEGER DEFAULT 0,
        registration_step INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        rejection_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        rejected_at DATETIME,
        two_factor_secret TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        backup_codes TEXT`,
    supply_orders: `
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    system_configurations: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT UNIQUE NOT NULL,
        config_value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    technical_evaluations: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        bid_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('approved','rejected')),
        rejection_reason TEXT,
        evaluated_by INTEGER NOT NULL,
        evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        knockout_clauses_checked INTEGER DEFAULT 0,
        knockout_clause_failures TEXT,
        grievance_marked INTEGER DEFAULT 0,
        total_score REAL,
        scoring_breakdown TEXT,
        evaluation_status TEXT DEFAULT 'pending',
        completed_at TEXT,
        UNIQUE(tender_id, item_id, bid_id)`,
    temporary_approvals: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        tender_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        grievance_id INTEGER NOT NULL,
        approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_by INTEGER NOT NULL,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
        UNIQUE(supplier_id, tender_id, item_id, grievance_id)`,
    temporary_approved_pools: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        bid_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tender_id, item_id, supplier_id)`,
    tender_evaluation_criteria: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        criteria_title TEXT NOT NULL,
        criteria_description TEXT NOT NULL,
        is_knockout BOOLEAN DEFAULT 1,
        minimum_requirement TEXT,
        weightage DECIMAL(5,2) DEFAULT 0,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    tender_letters: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        letter_type TEXT NOT NULL CHECK (letter_type IN ('intent', 'award')),
        letter_title TEXT NOT NULL,
        letter_content TEXT,
        letter_file_path TEXT,
        letter_original_name TEXT,
        sent_to TEXT NOT NULL,
        sent_by INTEGER NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_recipients INTEGER DEFAULT 0,
        successful_sends INTEGER DEFAULT 0,
        failed_sends INTEGER DEFAULT 0`,
    tender_status_history: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        comments TEXT,
        changed_by INTEGER NOT NULL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    tender_vetting_evaluations: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER NOT NULL,
        committee_member_id INTEGER NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
        comments TEXT,
        evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tender_id, committee_member_id)`,
    users: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        designation TEXT,
        department_id INTEGER,
        committee_id INTEGER,
        role TEXT NOT NULL,
        eligible_for_demand_creation INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        two_factor_secret TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        backup_codes TEXT,
        is_hod INTEGER DEFAULT 0,
        is_finance_user INTEGER DEFAULT 0,
        password_sealed TEXT,
        deactivated_at DATETIME`,
};

const INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
    'CREATE INDEX IF NOT EXISTS idx_category_fields_category_id ON category_fields(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_category_field_options_field_id ON category_field_options(field_id)',
    'CREATE INDEX IF NOT EXISTS idx_demand_item_field_values_item_id ON demand_item_field_values(demand_item_id)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_tender_id ON purchase_orders(tender_id)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number)',
];

const DEPARTMENTS = ['Purchase', 'Store', 'Finance', 'MS'];

const COMMITTEES = [
    'Supplier Evaluation Committee',
    'Grievance Committee',
    'Technical Evaluation Committee',
    'Vetting Committee',
    'Market Survey Committee',
];

const ITEM_CATEGORIES = {
    'Medical Equipment': {
        description: 'Medical and healthcare equipment',
        items: ['Stethoscope', 'Blood Pressure Monitor', 'Thermometer', 'Pulse Oximeter', 'ECG Machine', 'X-ray Film', 'Surgical Gloves', 'Face Masks'],
    },
    'Office Supplies': {
        description: 'General office and administrative supplies',
        items: ['A4 Paper', 'Pens', 'Pencils', 'Folders', 'Stapler', 'Paper Clips', 'Notebooks', 'Envelopes', 'Printer Cartridges'],
    },
    'Laboratory Supplies': {
        description: 'Laboratory equipment and consumables',
        items: ['Test Tubes', 'Petri Dishes', 'Microscope Slides', 'Pipettes', 'Beakers', 'Reagents', 'Lab Coats', 'Safety Goggles'],
    },
    Pharmaceuticals: {
        description: 'Medicines and pharmaceutical products',
        items: ['Paracetamol', 'Antibiotics', 'Insulin', 'Vaccines', 'Syringes', 'IV Fluids', 'Bandages', 'Antiseptic Solution'],
    },
    'IT Equipment': {
        description: 'Information technology hardware and software',
        items: ['Computers', 'Laptops', 'Printers', 'Keyboards', 'Mouse', 'Monitors', 'Network Cables', 'Software Licenses'],
    },
    'Maintenance Supplies': {
        description: 'Maintenance and repair supplies',
        items: ['Cleaning Chemicals', 'Tools', 'Spare Parts', 'Electrical Items', 'Plumbing Supplies', 'Paint', 'Brushes', 'Safety Equipment'],
    },
};

const SYSTEM_CONFIG = [
    {
        key: 'grievance_deadline_hours',
        value: '72',
        description: 'Number of hours suppliers have to submit grievance after technical evaluation (min: 1 hour, max: 720 hours/30 days)',
    },
];

// Starting options for the pharmaceutical and equipment item fields on a new
// database. Older databases kept these in dedicated lookup tables, which are
// read instead when present.
const PHARMA_DEFAULTS = {
    drugCategories: ['ACE inhibitors', 'Analgesics', 'Anti-inflammatory', 'Antibiotics', 'Beta-blockers', 'Calcium-antagonists', 'Nitrates'],
    drugNames: [
        ['Nitrates', 'Glyceryl trinitrate'], ['Nitrates', 'Isosorbide dinitrate'],
        ['Beta-blockers', 'Propranolol'], ['Beta-blockers', 'Metoprolol'],
        ['Calcium-antagonists', 'Amlodipine'], ['Calcium-antagonists', 'Nifedipine'],
        ['ACE inhibitors', 'Lisinopril'], ['ACE inhibitors', 'Enalapril'],
    ],
    strengthUnits: ['gram (g)', 'microgram (mcg)', 'milligram (mg)', 'milliliter (ml)', 'percentage (%)', 'unit (IU)'],
    dosageForms: ['Ampule', 'Capsule', 'Cream', 'Injection', 'Ointment', 'Sublingual tablet', 'Syrup', 'Tablet'],
    preparations: ['Inhaler', 'Oral', 'Parenteral', 'Rectal', 'Sublingual', 'Suspension for nebulization', 'Topical'],
    equipmentCategories: ['Diagnostic Equipment', 'Imaging Equipment', 'Laboratory Equipment', 'Patient Monitoring', 'Surgical Instruments'],
};

// ── Tables and columns ─────────────────────────────────────────────────────

const splitDefinitions = (body) => {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i += 1) {
        if (body[i] === '(') depth += 1;
        else if (body[i] === ')') depth -= 1;
        else if (body[i] === ',' && depth === 0) {
            parts.push(body.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(body.slice(start).trim());
    return parts.filter(Boolean);
};

/**
 * Columns in the form ALTER TABLE ... ADD COLUMN accepts on both databases:
 * type and default only, without NOT NULL, UNIQUE or CHECK.
 */
const addableColumns = (body) =>
    splitDefinitions(body)
        .filter((def) => !/^(UNIQUE|CHECK|FOREIGN|PRIMARY)\b/i.test(def) && !/PRIMARY KEY/i.test(def))
        .map((def) => {
            const [, name, type, rest] = def.match(/^(\w+)\s+(\w+(?:\(\d+(?:,\s*\d+)?\))?)(.*)$/);
            const fallback = rest.match(/\bDEFAULT\s+('[^']*'|\S+)/i);
            return { name, definition: `${name} ${type}${fallback ? ` DEFAULT ${fallback[1]}` : ''}` };
        });

async function createTables(db, existing) {
    for (const [table, body] of Object.entries(TABLES)) {
        if (!existing.has(table)) {
            await db.run(`CREATE TABLE IF NOT EXISTS ${table} (${body}\n)`);
            continue;
        }
        const present = new Set((await db.columns(table)).map((name) => name.toLowerCase()));
        for (const column of addableColumns(body)) {
            if (!present.has(column.name.toLowerCase())) {
                await db.run(`ALTER TABLE ${table} ADD COLUMN ${column.definition}`);
            }
        }
    }
    for (const statement of INDEXES) await db.run(statement);
}

// ── Reference data ─────────────────────────────────────────────────────────

/** Inserts the row unless one already matches `match`; returns its id. */
async function ensureRow(db, table, match, extra = {}) {
    const where = Object.keys(match).map((key) => `${key} = ?`).join(' AND ');
    const found = await db.get(`SELECT id FROM ${table} WHERE ${where}`, Object.values(match));
    if (found) return found.id;
    const row = { ...match, ...extra };
    const columns = Object.keys(row);
    const result = await db.run(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        Object.values(row),
    );
    return result.lastID;
}

async function seedReferenceData(db) {
    for (const name of DEPARTMENTS) await ensureRow(db, 'departments', { name });
    for (const name of COMMITTEES) await ensureRow(db, 'committees', { name });

    for (const [name, { description, items }] of Object.entries(ITEM_CATEGORIES)) {
        const categoryId = await ensureRow(db, 'item_categories', { name }, { description });
        for (const item of items) await ensureRow(db, 'item_names', { category_id: categoryId, name: item });
    }

    for (const { key, value, description } of SYSTEM_CONFIG) {
        await ensureRow(db, 'system_configurations', { config_key: key }, { config_value: value, description });
    }

    if (!(await db.get("SELECT id FROM users WHERE role = 'superadmin'"))) {
        const password = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
        if (!process.env.SUPERADMIN_PASSWORD) {
            console.warn('Created the superadmin with the default password. Sign in and change it, or set SUPERADMIN_PASSWORD before first start.');
        }
        await db.run('INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)', [
            'Super Admin', 'superadmin', await bcrypt.hash(password, 10), 'superadmin',
        ]);
    }
}

// Tenders created before tender numbers existed get one in the same format.
async function backfillTenderNumbers(db) {
    const tenders = await db.all('SELECT id, created_at FROM demand_tenders WHERE tender_number IS NULL ORDER BY id');
    for (const [index, tender] of tenders.entries()) {
        const date = new Date(tender.created_at);
        const stamp = [date.getDate(), date.getMonth() + 1].map((n) => String(n).padStart(2, '0')).join('') + date.getFullYear();
        await db.run('UPDATE demand_tenders SET tender_number = ? WHERE id = ?', [
            `RIC-${stamp}-${String(index + 1).padStart(3, '0')}`, tender.id,
        ]);
    }
    await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_number_unique ON demand_tenders(tender_number)');
}

// ── Item fields for pharmaceuticals and equipment ─────────────────────────

async function createField(db, categoryId, label, fieldType, order, required, dependsOn = null) {
    const result = await db.run(
        'INSERT INTO category_fields (category_id, label, field_type, depends_on_field_id, is_required, display_order) VALUES (?, ?, ?, ?, ?, ?)',
        [categoryId, label, fieldType, dependsOn, required ? 1 : 0, order],
    );
    return result.lastID;
}

/** Options are the same when they share a field, a parent and (ignoring case and spaces) a value. */
const optionKey = (fieldId, parentId, value) => `${fieldId}|${parentId ?? ''}|${String(value).trim().toLowerCase()}`;

/**
 * Creates one option per { key, label, parent }; returns Map(key → option id).
 * Repeated labels share one option: the old code re-inserted every drug name on each
 * start, so legacy tables can hold the same name many times over.
 */
async function createOptions(db, fieldId, entries, parentOptions = null) {
    const ids = new Map();
    const created = new Map();
    for (const { key, label, parent } of entries) {
        const parentId = parentOptions?.get(parent) ?? null;
        const unique = optionKey(fieldId, parentId, label);
        if (!created.has(unique)) {
            const result = await db.run(
                'INSERT INTO category_field_options (field_id, value, parent_option_id, display_order) VALUES (?, ?, ?, ?)',
                [fieldId, String(label).trim(), parentId, created.size],
            );
            created.set(unique, result.lastID);
        }
        ids.set(key, created.get(unique));
    }
    return ids;
}

/**
 * Folds duplicate dropdown options into the oldest copy, moving demand values and child
 * options over first. Repeats because merging parents can make their children duplicates.
 */
async function mergeDuplicateOptions(db) {
    for (let pass = 0; pass < 5; pass += 1) {
        const keep = new Map();
        const merges = [];
        for (const option of await db.all('SELECT id, field_id, value, parent_option_id FROM category_field_options ORDER BY id')) {
            const unique = optionKey(option.field_id, option.parent_option_id, option.value);
            if (keep.has(unique)) merges.push([option.id, keep.get(unique)]);
            else keep.set(unique, option.id);
        }
        if (!merges.length) return;
        for (const [duplicate, original] of merges) {
            await db.run('UPDATE demand_item_field_values SET option_id = ? WHERE option_id = ?', [original, duplicate]);
            await db.run('UPDATE category_field_options SET parent_option_id = ? WHERE parent_option_id = ?', [original, duplicate]);
            await db.run('DELETE FROM category_field_options WHERE id = ?', [duplicate]);
        }
        console.log(`Merged ${merges.length} duplicate item field option(s)`);
    }
}

/** Options from a legacy lookup table if this database still has it, else the defaults. */
async function optionsFrom(db, tables, table, defaults, toEntry) {
    if (!tables.has(table)) return defaults;
    return (await db.all(`SELECT * FROM ${table} ORDER BY name`)).map(toEntry);
}

const fromLabels = (labels) => labels.map((label) => ({ key: label, label }));
const byId = (row) => ({ key: row.id, label: row.name });

/** Copies values held in the old per-attribute demand_items columns. */
async function copyLegacyValues(db, mappings) {
    const present = new Set(await db.columns('demand_items'));
    const usable = mappings.filter((m) => present.has(m.column));
    if (!usable.length) return;
    const items = await db.all(
        `SELECT id, ${usable.map((m) => m.column).join(', ')} FROM demand_items
         WHERE ${usable.map((m) => `${m.column} IS NOT NULL`).join(' OR ')}`,
    );
    for (const item of items) {
        for (const { column, fieldId, options } of usable) {
            const value = item[column];
            if (value === null || value === undefined) continue;
            if (!options) {
                await db.run('INSERT INTO demand_item_field_values (demand_item_id, field_id, value_text) VALUES (?, ?, ?)', [item.id, fieldId, String(value)]);
            } else if (options.has(value)) {
                await db.run('INSERT INTO demand_item_field_values (demand_item_id, field_id, option_id) VALUES (?, ?, ?)', [item.id, fieldId, options.get(value)]);
            }
        }
    }
}

async function seedPharmaFields(db, categoryId, tables) {
    const d = PHARMA_DEFAULTS;
    const categoryField = await createField(db, categoryId, 'Drug Category', 'dropdown', 1, true);
    const categories = await createOptions(db, categoryField, await optionsFrom(db, tables, 'drug_categories', fromLabels(d.drugCategories), byId));

    const nameField = await createField(db, categoryId, 'Drug Name', 'dropdown', 2, true, categoryField);
    const names = await createOptions(db, nameField, await optionsFrom(
        db, tables, 'drug_names',
        d.drugNames.map(([parent, label]) => ({ key: label, label, parent })),
        (row) => ({ key: row.id, label: row.name, parent: row.drug_category_id }),
    ), categories);

    const strengthField = await createField(db, categoryId, 'Strength Value', 'number', 3, true);
    const unitField = await createField(db, categoryId, 'Strength Unit', 'dropdown', 4, true);
    const units = await createOptions(db, unitField, await optionsFrom(
        db, tables, 'strength_units', fromLabels(d.strengthUnits),
        (row) => ({ key: row.id, label: row.abbreviation ? `${row.name} (${row.abbreviation})` : row.name }),
    ));
    const formField = await createField(db, categoryId, 'Dosage Form', 'dropdown', 5, true);
    const forms = await createOptions(db, formField, await optionsFrom(db, tables, 'dosage_forms', fromLabels(d.dosageForms), byId));
    const prepField = await createField(db, categoryId, 'Preparation', 'dropdown', 6, false);
    const preps = await createOptions(db, prepField, await optionsFrom(db, tables, 'preparations', fromLabels(d.preparations), byId));

    await copyLegacyValues(db, [
        { column: 'drug_category_id', fieldId: categoryField, options: categories },
        { column: 'drug_name_id', fieldId: nameField, options: names },
        { column: 'strength_value', fieldId: strengthField },
        { column: 'strength_unit_id', fieldId: unitField, options: units },
        { column: 'dosage_form_id', fieldId: formField, options: forms },
        { column: 'preparation_id', fieldId: prepField, options: preps },
    ]);
}

async function seedEquipmentFields(db, categoryId, tables) {
    const categoryField = await createField(db, categoryId, 'Equipment Category', 'dropdown', 1, true);
    const categories = await createOptions(db, categoryField, await optionsFrom(
        db, tables, 'equipment_categories', fromLabels(PHARMA_DEFAULTS.equipmentCategories), byId,
    ));

    const typeField = await createField(db, categoryId, 'Equipment Type', 'dropdown', 2, true, categoryField);
    const types = await createOptions(db, typeField, await optionsFrom(
        db, tables, 'equipment_types', [],
        (row) => ({ key: row.id, label: row.name, parent: row.equipment_category_id }),
    ), categories);

    await copyLegacyValues(db, [
        { column: 'equipment_category_id', fieldId: categoryField, options: categories },
        { column: 'equipment_type_id', fieldId: typeField, options: types },
    ]);
}

/** Gives the pharmaceutical and equipment categories their item fields, once. */
async function seedItemFields(db, tables) {
    const categories = await db.all('SELECT id, name FROM item_categories');
    const find = (words) => categories.find((c) => words.some((w) => c.name.toLowerCase().includes(w)));
    const hasFields = async (id) => Boolean(await db.get('SELECT id FROM category_fields WHERE category_id = ?', [id]));

    const pharma = find(['pharmaceutical', 'medicine', 'drug']);
    if (pharma && !(await hasFields(pharma.id))) await seedPharmaFields(db, pharma.id, tables);
    const equipment = find(['equipment', 'machinery', 'instrument']);
    if (equipment && !(await hasFields(equipment.id))) await seedEquipmentFields(db, equipment.id, tables);
}

// ── Timestamps ─────────────────────────────────────────────────────────────
// Every instant is stored in UTC (see src/utils/time.js). Older databases were not.

/** Runs a one-off data fix the first time a database sees it. */
async function once(db, name, task) {
    if (await db.get('SELECT id FROM schema_migrations WHERE name = ?', [name])) return;
    await task();
    await db.run('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
}

const DATETIME_COLUMNS = Object.entries(TABLES).map(([table, body]) => [
    table,
    splitDefinitions(body).map((def) => def.match(/^(\w+)\s+(DATETIME|TIMESTAMP)\b/i)?.[1]).filter(Boolean),
]);

/**
 * SQLite: the old code saved some times as typed in a datetime-local box ("2026-01-05T00:02",
 * Pakistan time) or as ISO strings, next to UTC "YYYY-MM-DD HH:MM:SS" values, and compared
 * them as text. Rewrites them all as UTC.
 */
async function normalizeSqliteTimestamps(db) {
    let fixed = 0;
    for (const [table, columns] of DATETIME_COLUMNS) {
        const present = new Set(await db.columns(table));
        for (const column of columns.filter((c) => present.has(c))) {
            // UTC values already come back as Date objects; anything else is legacy.
            const rows = await db.all(`SELECT rowid AS row_id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`);
            for (const { row_id: rowId, value } of rows) {
                if (value instanceof Date || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) continue;
                const epoch = typeof value === 'number' || /^\d{12,13}$/.test(String(value));
                const instant = epoch ? new Date(Number(value)) : parseInstant(String(value));
                if (!instant || Number.isNaN(instant.getTime())) continue;
                await db.run(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`, [instant, rowId]);
                fixed += 1;
            }
        }
    }
    if (fixed) console.log(`Converted ${fixed} legacy timestamp(s) to UTC`);
}

// Columns the old code filled from the database clock (CURRENT_TIMESTAMP / GETDATE()), found
// by scanning its queries. Columns with a GETDATE() default are read from the database.
const SERVER_CLOCK_COLUMNS = [
    'category_fields.updated_at', 'demand_items.created_at', 'demand_items.store_response_at',
    'demand_tenders.awarded_at', 'demand_tenders.finance_hod_response_at', 'demand_tenders.ms_hod_response_at',
    'demand_tenders.opened_at', 'demand_tenders.published_at', 'demand_tenders.purchase_hod_response_at',
    'demand_tenders.technical_evaluation_completed_at', 'demand_tenders.time_extension_at',
    'demands.hod_response_at', 'demands.purchase_response_date', 'demands.rejected_at', 'demands.store_response_at',
    'demands.updated_at', 'financial_grievance_emails.sent_at', 'financial_grievances.meeting_held_at',
    'financial_openings.opened_at', 'grievance_applications.reviewed_at', 'grievance_applications.submitted_at',
    'item_categories.updated_at', 'item_names.updated_at', 'knockout_clause_documents.uploaded_at',
    'letter_recipients.downloaded_at', 'letter_recipients.sent_at', 'market_surveys.completed_at',
    'pre_bid_meetings.completed_at', 'pre_bid_meetings.scheduled_at', 'purchase_department_grievances.reviewed_at',
    'purchase_orders.cancelled_at', 'supplier_business_profile.updated_at', 'supplier_evaluations.created_at',
    'supplier_knockout_acknowledgments.acknowledged_at', 'supplier_tender_views.viewed_at', 'suppliers.updated_at',
    'system_configurations.updated_at', 'tender_letters.sent_at',
];

/**
 * SQL Server: GETDATE() is the server's local clock, but the driver writes and reads JS dates
 * as UTC, so the two kinds of value sat hours apart (a deadline compared with GETDATE() ended
 * early). Moves server-clock values, and the Pakistan wall-clock text the old code stored, to
 * UTC, and makes column defaults use GETUTCDATE().
 */
async function moveSqlServerTimestampsToUtc(db) {
    const SCHEMA = 'Eproc';
    const [{ offset }] = await db.raw('SELECT DATEDIFF(MINUTE, GETUTCDATE(), GETDATE()) AS offset');
    const datetimeColumns = new Set((await db.raw(
        `SELECT TABLE_NAME + '.' + COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = '${SCHEMA}' AND DATA_TYPE IN ('datetime', 'datetime2', 'smalldatetime')`,
    )).map((row) => row.name.toLowerCase()));
    const shift = async (key, minutes, extraWhere = '') => {
        const [table, column] = key.split('.');
        if (!minutes || !datetimeColumns.has(key.toLowerCase())) return;
        await db.raw(`UPDATE [${SCHEMA}].[${table}] SET [${column}] = DATEADD(MINUTE, ${minutes}, [${column}]) WHERE [${column}] IS NOT NULL${extraWhere}`);
    };

    const defaults = await db.raw(
        `SELECT t.name AS tbl, c.name AS col, dc.name AS constraint_name
         FROM sys.default_constraints dc
         JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
         JOIN sys.tables t ON t.object_id = dc.parent_object_id
         JOIN sys.schemas s ON s.schema_id = t.schema_id
         WHERE s.name = '${SCHEMA}' AND LOWER(dc.definition) LIKE '%getdate()%'`,
    );
    const shifted = new Set();
    for (const { tbl, col, constraint_name: name } of defaults) {
        await shift(`${tbl}.${col}`, -offset);
        shifted.add(`${tbl}.${col}`.toLowerCase());
        await db.raw(`ALTER TABLE [${SCHEMA}].[${tbl}] DROP CONSTRAINT [${name}]`);
        await db.raw(`ALTER TABLE [${SCHEMA}].[${tbl}] ADD CONSTRAINT [${name}] DEFAULT GETUTCDATE() FOR [${col}]`);
    }
    for (const key of SERVER_CLOCK_COLUMNS) {
        if (!shifted.has(key.toLowerCase())) await shift(key, -offset);
    }
    // Stored exactly as typed (Pakistan time): extended deadlines and grievance meeting times.
    await shift('demand_tenders.bidding_end_time', -300, ' AND time_extension_at IS NOT NULL');
    await shift('grievance_applications.meeting_scheduled_date', -300);
    console.log(`Moved SQL Server timestamps to UTC (server clock offset ${offset} min, ${defaults.length} column default(s) updated)`);
}

/** @param db query helpers: get, all, run, columns(table), tables(), client(), raw(sql) */
async function migrate(db) {
    const tables = new Set(await db.tables());
    const fresh = !tables.has('users');
    await createTables(db, tables);
    await once(db, 'timestamps-utc', async () => {
        if (fresh) return;
        if (db.client() === 'mssql') await moveSqlServerTimestampsToUtc(db);
        else await normalizeSqliteTimestamps(db);
    });
    await seedReferenceData(db);
    await backfillTenderNumbers(db);
    await seedItemFields(db, tables);
    await mergeDuplicateOptions(db);
}

module.exports = { migrate, optionKey };

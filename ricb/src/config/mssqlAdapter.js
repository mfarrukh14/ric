/**
 * MSSQL Adapter - Drop-in replacement for sqlite3 in the eproc backend.
 * Provides db.get(), db.all(), db.run() with the same callback API as sqlite3,
 * while transparently converting SQLite SQL dialect to T-SQL.
 */
const sql = require('mssql');

// ── All eproc table names (for schema-prefixing) ──────────────────────────
const EPROC_TABLES = [
    'departments', 'committees', 'users', 'demands', 'demand_items',
    'suppliers', 'supplier_business_profile', 'supplier_registration_bodies',
    'supplier_documents', 'supplier_addresses', 'supplier_ppra_registrations',
    'supplier_past_experience', 'supplier_client_references',
    'supplier_work_proof_images', 'supplier_resubmission_feedback',
    'supplier_otp_verifications', 'supplier_otp_verification',
    'supplier_evaluations', 'supplier_bids', 'supplier_bid_items',
    'supplier_tender_views', 'supplier_knockout_acknowledgments',
    'supplier_awards',
    'demand_evaluations', 'demand_tenders',
    'supply_orders', 'purchase_orders',
    'tender_evaluation_criteria', 'tender_status_history',
    'tender_vetting_evaluations', 'tender_letters', 'letter_recipients',
    'grievance_applications', 'grievance_deadlines',
    'financial_openings', 'financial_opening_reports',
    'financial_grievances', 'financial_grievance_emails',
    'pre_bid_meetings', 'market_surveys', 'market_survey_documents',
    'item_categories', 'item_names',
    'drug_categories', 'drug_names', 'strength_units', 'dosage_forms', 'preparations',
    'equipment_categories', 'equipment_types',
    'category_fields', 'category_field_options', 'demand_item_field_values',
    'system_configurations', 'audit_logs',
    'technical_evaluations', 'temporary_approved_pools',
    'purchase_department_grievances'
];

const SCHEMA = 'Eproc';

// ── SQL Conversion ─────────────────────────────────────────────────────────

function convertSql(rawSql, params) {
    let s = rawSql;

    // ── Handle PRAGMA table_info(tablename) ───────────────────────────
    const pragmaMatch = s.match(/PRAGMA\s+table_info\((\w+)\)/i);
    if (pragmaMatch) {
        const tbl = pragmaMatch[1];
        s = `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, 
             CASE WHEN IS_NULLABLE='NO' THEN 1 ELSE 0 END AS [notnull],
             COLUMN_DEFAULT AS dflt_value
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_NAME='${tbl}'`;
        return { sql: s, params: [] };
    }

    // ── Handle sqlite_master queries ──────────────────────────────────
    s = s.replace(
        /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*\?/gi,
        `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_NAME=?`
    );
    s = s.replace(
        /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*'(\w+)'/gi,
        `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${SCHEMA}' AND TABLE_NAME='$1'`
    );

    // ── Handle CREATE TABLE IF NOT EXISTS ─────────────────────────────
    const createMatch = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);
    if (createMatch) {
        const tbl = createMatch[1];
        s = convertCreateTable(s, tbl);
        return { sql: s, params: [] };
    }

    // ── Handle CREATE INDEX IF NOT EXISTS ─────────────────────────────
    const indexMatch = s.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)/i);
    if (indexMatch) {
        const idxName = indexMatch[1];
        const tbl = indexMatch[2];
        const cols = indexMatch[3];
        const isUnique = /UNIQUE/i.test(s) ? 'UNIQUE ' : '';
        // Wrap in TRY/CATCH to gracefully skip indexes on NVARCHAR(MAX) columns
        s = `BEGIN TRY
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='${idxName}' AND object_id=OBJECT_ID('${SCHEMA}.${tbl}'))
    CREATE ${isUnique}INDEX ${idxName} ON ${SCHEMA}.${tbl}(${cols})
END TRY BEGIN CATCH END CATCH`;
        return { sql: s, params: [] };
    }

    // ── Handle DROP TABLE IF EXISTS ───────────────────────────────────
    const dropMatch = s.match(/DROP\s+TABLE\s+IF\s+EXISTS\s+(\w+)/i);
    if (dropMatch) {
        const tbl = dropMatch[1];
        const schemaTbl = isEprocTable(tbl) ? `${SCHEMA}.${tbl}` : tbl;
        s = `IF OBJECT_ID('${schemaTbl}', 'U') IS NOT NULL DROP TABLE ${schemaTbl}`;
        return { sql: s, params: params || [] };
    }

    // ── Handle ALTER TABLE ... ADD COLUMN ─────────────────────────────
    const alterMatch = s.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+/i);
    if (alterMatch) {
        const tbl = alterMatch[1];
        s = s.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+/i, `ALTER TABLE ${SCHEMA}.${tbl} ADD `);
        s = convertColumnTypes(s);
        return { sql: s, params: params || [] };
    }

    // ── DML: schema-prefix table names ────────────────────────────────
    s = prefixTables(s);

    // ── SQLite INSERT OR IGNORE / INSERT OR REPLACE ───────────────────
    // Convert to TRY-CATCH wrapped INSERT (ignore duplicates)
    let hasInsertOr = false;
    if (/INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO/i.test(s)) {
        hasInsertOr = true;
        s = s.replace(/INSERT\s+OR\s+(?:IGNORE|REPLACE)\s+INTO/gi, 'INSERT INTO');
    }

    // ── SQLite function replacements ──────────────────────────────────
    // datetime('now', '+N minutes'/'-N hours'/etc) → DATEADD(..., GETDATE())
    // Computed entirely server-side so it's always compared against the same
    // clock as GETDATE() - mixing this with a JS-computed UTC timestamp caused
    // expiry comparisons to be off by the server's UTC offset (GETDATE() is
    // local time despite drivers formatting it with a misleading 'Z' suffix).
    s = s.replace(
        /datetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+(second|minute|hour|day)s?'\s*\)/gi,
        (match, amount, unit) => `DATEADD(${unit.toUpperCase()}, ${parseInt(amount, 10)}, GETDATE())`
    );
    s = s.replace(/datetime\(\s*'now'\s*,\s*'localtime'\s*\)/gi, 'GETDATE()');
    s = s.replace(/datetime\(\s*'now'\s*\)/gi, 'GETDATE()');
    // datetime(column) in comparisons → just column
    s = s.replace(/datetime\((\w+(?:\.\w+)?)\)/gi, '$1');
    // GROUP_CONCAT → STRING_AGG
    s = s.replace(/GROUP_CONCAT\s*\(([^,)]+),\s*([^)]+)\)/gi, 'STRING_AGG($1, $2)');

    // ── Convert ? placeholders to @p0, @p1, etc. ─────────────────────
    let idx = 0;
    const namedParams = {};
    s = s.replace(/\?/g, () => {
        const name = `p${idx}`;
        if (params && idx < params.length) {
            namedParams[name] = params[idx];
        }
        idx++;
        return `@${name}`;
    });

    // ── Convert LIMIT/OFFSET to SQL Server OFFSET-FETCH ─────────────
    // Pattern: ORDER BY ... LIMIT @pN OFFSET @pM  →  ORDER BY ... OFFSET @pM ROWS FETCH NEXT @pN ROWS ONLY
    s = s.replace(
        /\bLIMIT\s+(@p\d+)\s+OFFSET\s+(@p\d+)/gi,
        'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY'
    );
    // Pattern: ORDER BY ... LIMIT @pN  →  ORDER BY ... OFFSET 0 ROWS FETCH NEXT @pN ROWS ONLY
    s = s.replace(
        /\bLIMIT\s+(@p\d+)(?!\s+OFFSET)/gi,
        'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY'
    );
    // Pattern: LIMIT N (literal number), with optional ORDER BY already present
    s = s.replace(
        /\bLIMIT\s+(\d+)\s+OFFSET\s+(\d+)/gi,
        'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY'
    );
    s = s.replace(
        /\bLIMIT\s+(\d+)(?!\s+OFFSET)/gi,
        'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY'
    );
    // Ensure queries using OFFSET-FETCH have ORDER BY (SQL Server requires it)
    // If no ORDER BY present but OFFSET exists, add ORDER BY (SELECT NULL) before OFFSET
    if (/\bOFFSET\s+/i.test(s) && !/\bORDER\s+BY\b/i.test(s)) {
        s = s.replace(/\bOFFSET\s+/i, 'ORDER BY (SELECT NULL) OFFSET ');
    }

    // Wrap INSERT OR IGNORE/REPLACE in TRY-CATCH to ignore duplicate key errors
    if (hasInsertOr) {
        s = `BEGIN TRY ${s} END TRY BEGIN CATCH IF ERROR_NUMBER() NOT IN (2627, 2601) THROW END CATCH`;
    }

    return { sql: s, params: namedParams };
}

function isEprocTable(name) {
    return EPROC_TABLES.includes(name.toLowerCase());
}

function prefixTables(s) {
    for (const tbl of EPROC_TABLES) {
        // Case-insensitive replacement for various SQL contexts
        const re = new RegExp(
            `(FROM|JOIN|INTO|UPDATE|TABLE|EXISTS|REFERENCES)\\s+${tbl}\\b`,
            'gi'
        );
        s = s.replace(re, `$1 ${SCHEMA}.${tbl}`);
        // Also handle INSERT INTO table (
        const reInsert = new RegExp(`(INTO)\\s+${tbl}\\s*\\(`, 'gi');
        s = s.replace(reInsert, `$1 ${SCHEMA}.${tbl} (`);
    }
    return s;
}

function convertCreateTable(rawSql, tableName) {
    let body = rawSql;

    // Remove CREATE TABLE IF NOT EXISTS prefix
    body = body.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s*\(/i, '');

    // Remove trailing ); and any subsequent text
    const lastParen = body.lastIndexOf(')');
    if (lastParen >= 0) body = body.substring(0, lastParen);

    // Remove FOREIGN KEY lines (avoid ordering issues)
    body = body.replace(/,?\s*FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+\w+\s*\([^)]*\)(?:\s+ON\s+DELETE\s+(?:CASCADE|SET\s+NULL|NO\s+ACTION|RESTRICT))?/gi, '');

    // INTEGER PRIMARY KEY AUTOINCREMENT → INT IDENTITY(1,1) PRIMARY KEY
    // Must happen BEFORE general type conversion (which turns INTEGER→INT)
    body = body.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'INT IDENTITY(1,1) PRIMARY KEY');

    // Convert types
    body = convertColumnTypes(body);

    // ── Fix UNIQUE constraints on NVARCHAR(MAX) columns ────────────
    // Collect column names involved in any UNIQUE constraint
    const uniqueCols = new Set();

    // Inline UNIQUE: colname NVARCHAR(MAX) ... UNIQUE
    let m;
    const inlineRe = /^\s*(\w+)\s+NVARCHAR\(MAX\)[^,]*UNIQUE/gim;
    while ((m = inlineRe.exec(body)) !== null) {
        uniqueCols.add(m[1].toLowerCase());
    }
    // Table-level UNIQUE(col1, col2, ...)
    const tableRe = /UNIQUE\s*\(([^)]+)\)/gi;
    while ((m = tableRe.exec(body)) !== null) {
        m[1].split(',').forEach(c => uniqueCols.add(c.trim().toLowerCase()));
    }
    // Change NVARCHAR(MAX) → NVARCHAR(255) for columns in UNIQUE constraints
    for (const col of uniqueCols) {
        const re = new RegExp(`(\\b${col}\\s+)NVARCHAR\\(MAX\\)`, 'gi');
        body = body.replace(re, '$1NVARCHAR(255)');
    }

    // Remove duplicate trailing commas from UNIQUE/CHECK before closing
    body = body.replace(/,\s*(UNIQUE|CHECK)/gi, ', $1');
    // Remove trailing comma before end
    body = body.replace(/,\s*$/, '');

    const schemaTbl = `${SCHEMA}.${tableName}`;

    return `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='${tableName}' AND schema_id=SCHEMA_ID('${SCHEMA}'))
CREATE TABLE ${schemaTbl} (
${body}
)`;
}

function convertColumnTypes(s) {
    // TEXT → NVARCHAR(MAX)
    s = s.replace(/\bTEXT\b/gi, 'NVARCHAR(MAX)');
    // BOOLEAN → BIT
    s = s.replace(/\bBOOLEAN\b/gi, 'BIT');
    // INTEGER → INT (but not IDENTITY which we handle separately)
    s = s.replace(/\bINTEGER\b/gi, 'INT');
    // REAL → FLOAT
    s = s.replace(/\bREAL\b/gi, 'FLOAT');
    // JSON → NVARCHAR(MAX)  
    s = s.replace(/\bJSON\b/gi, 'NVARCHAR(MAX)');
    // CURRENT_TIMESTAMP → GETDATE()
    s = s.replace(/\bCURRENT_TIMESTAMP\b/gi, 'GETDATE()');
    // Handle DEFAULT "monthly" → DEFAULT 'monthly' (SQLite uses double quotes for strings)
    s = s.replace(/DEFAULT\s+"([^"]+)"/gi, "DEFAULT '$1'");
    return s;
}

// ── MssqlAdapter class ─────────────────────────────────────────────────────

class MssqlAdapter {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * db.run(sql, params?, callback?) – execute DDL/DML, returns lastID & changes
     */
    run(rawSql, paramsOrCb, maybeCb) {
        let params = [];
        let callback = null;

        if (typeof paramsOrCb === 'function') {
            callback = paramsOrCb;
        } else if (Array.isArray(paramsOrCb)) {
            params = paramsOrCb;
            callback = maybeCb;
        } else if (paramsOrCb != null) {
            params = paramsOrCb;
            callback = maybeCb;
        }

        const { sql: converted, params: namedParams } = convertSql(rawSql, params);

        const isInsert = /^\s*(?:IF\s|SET\s|--)*\s*INSERT\s/i.test(rawSql) ||
                         /INSERT\s+INTO/i.test(rawSql);

        const execSql = isInsert
            ? `${converted}; SELECT SCOPE_IDENTITY() AS lastID`
            : converted;

        this._exec(execSql, namedParams)
            .then((result) => {
                const ctx = {
                    lastID: null,
                    changes: result.rowsAffected ? result.rowsAffected[0] : 0
                };
                if (isInsert && result.recordset && result.recordset.length > 0) {
                    ctx.lastID = result.recordset[0].lastID;
                }
                if (callback) callback.call(ctx, null);
            })
            .catch((err) => {
                if (callback) callback.call({ lastID: null, changes: 0 }, err);
            });
    }

    /**
     * db.get(sql, params?, callback?) – returns single row
     */
    get(rawSql, paramsOrCb, maybeCb) {
        let params = [];
        let callback = null;

        if (typeof paramsOrCb === 'function') {
            callback = paramsOrCb;
        } else if (Array.isArray(paramsOrCb)) {
            params = paramsOrCb;
            callback = maybeCb;
        } else if (paramsOrCb != null) {
            params = paramsOrCb;
            callback = maybeCb;
        }

        const { sql: converted, params: namedParams } = convertSql(rawSql, params);

        this._exec(converted, namedParams)
            .then((result) => {
                const row = result.recordset && result.recordset.length > 0
                    ? result.recordset[0]
                    : undefined;
                if (callback) callback(null, row);
            })
            .catch((err) => {
                if (callback) callback(err, undefined);
            });
    }

    /**
     * db.all(sql, params?, callback?) – returns array of rows
     */
    all(rawSql, paramsOrCb, maybeCb) {
        let params = [];
        let callback = null;

        if (typeof paramsOrCb === 'function') {
            callback = paramsOrCb;
        } else if (Array.isArray(paramsOrCb)) {
            params = paramsOrCb;
            callback = maybeCb;
        } else if (paramsOrCb != null) {
            params = paramsOrCb;
            callback = maybeCb;
        }

        const { sql: converted, params: namedParams } = convertSql(rawSql, params);

        this._exec(converted, namedParams)
            .then((result) => {
                if (callback) callback(null, result.recordset || []);
            })
            .catch((err) => {
                if (callback) callback(err, []);
            });
    }

    /**
     * Internal: build and execute a parameterized mssql request.
     * Maps SQL Server errors to SQLite-compatible error codes for controller compat.
     */
    async _exec(sqlStr, namedParams) {
        const request = this.pool.request();

        if (namedParams && typeof namedParams === 'object' && !Array.isArray(namedParams)) {
            for (const [name, value] of Object.entries(namedParams)) {
                if (value === undefined || value === null) {
                    request.input(name, sql.NVarChar, null);
                } else if (typeof value === 'number') {
                    if (Number.isInteger(value)) {
                        request.input(name, sql.Int, value);
                    } else {
                        request.input(name, sql.Decimal(18, 2), value);
                    }
                } else if (typeof value === 'boolean') {
                    request.input(name, sql.Bit, value ? 1 : 0);
                } else if (value instanceof Date) {
                    request.input(name, sql.DateTime, value);
                } else {
                    request.input(name, sql.NVarChar, String(value));
                }
            }
        }

        try {
            return await request.query(sqlStr);
        } catch (err) {
            // Map SQL Server error numbers to SQLite-compatible error codes
            if (err.number === 2627 || err.number === 2601) {
                err.code = 'SQLITE_CONSTRAINT_UNIQUE';
            } else if (err.number === 547) {
                err.code = 'SQLITE_CONSTRAINT_FOREIGNKEY';
            }
            // Map SQL Server duplicate column error for migration compat
            if (err.number === 2705 || (err.message && err.message.includes('Column names in each table must be unique'))) {
                err.message = `duplicate column name: ${err.message}`;
            }
            throw err;
        }
    }
}

// ── Connection management ──────────────────────────────────────────────────

let pool = null;
let adapter = null;

async function connect(config) {
    pool = await sql.connect(config);

    // Ensure Eproc schema exists
    await pool.request().query(
        `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name='${SCHEMA}')
         EXEC('CREATE SCHEMA ${SCHEMA}')`
    );

    adapter = new MssqlAdapter(pool);
    return adapter;
}

function getAdapter() {
    if (!adapter) throw new Error('MSSQL adapter not initialised – call connect() first');
    return adapter;
}

async function close() {
    if (pool) await pool.close();
    pool = null;
    adapter = null;
}

module.exports = { connect, getAdapter, close, SCHEMA, EPROC_TABLES, convertSql };

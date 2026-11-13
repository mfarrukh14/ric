/**
 * SQL Server adapter. Queries throughout the app are written in SQLite syntax
 * with `?` placeholders; this translates them to T-SQL against the Eproc schema
 * and exposes the same callback API as the SQLite adapter.
 */
const sql = require('mssql');
const { parseArgs, deliver } = require('./callbacks');
const { hasZone, isWallClock, parseInstant } = require('../utils/time');

const SCHEMA = 'Eproc';

// Tables that live in the Eproc schema and need prefixing.
const EPROC_TABLES = [
    'departments', 'committees', 'users', 'demands', 'demand_items',
    'suppliers', 'supplier_business_profile', 'supplier_registration_bodies',
    'supplier_documents', 'supplier_addresses', 'supplier_ppra_registrations',
    'supplier_past_experience', 'supplier_client_references',
    'supplier_work_proof_images', 'supplier_resubmission_feedback',
    'supplier_otp_verifications', 'supplier_evaluations', 'supplier_bids', 'supplier_bid_items',
    'supplier_tender_views', 'supplier_knockout_acknowledgments',
    'supplier_awards', 'knockout_clause_documents',
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
    'technical_evaluations', 'temporary_approved_pools', 'temporary_approvals',
    'purchase_department_grievances', 'merged_demands',
];

const TABLE_PATTERNS = EPROC_TABLES.map((table) => [
    new RegExp(`(FROM|JOIN|INTO|UPDATE|TABLE|EXISTS|REFERENCES)\\s+${table}\\b`, 'gi'),
    `$1 ${SCHEMA}.${table}`,
]);

const prefixTables = (s) => TABLE_PATTERNS.reduce((out, [re, replacement]) => out.replace(re, replacement), s);

// ── Schema statements ──────────────────────────────────────────────────────

const convertColumnTypes = (s) => s
    .replace(/\bTEXT\b/gi, 'NVARCHAR(MAX)')
    .replace(/\bBOOLEAN\b/gi, 'BIT')
    .replace(/\bINTEGER\b/gi, 'INT')
    .replace(/\bREAL\b/gi, 'FLOAT')
    .replace(/\bJSON\b/gi, 'NVARCHAR(MAX)')
    .replace(/\bCURRENT_TIMESTAMP\b/gi, 'GETUTCDATE()')
    .replace(/DEFAULT\s+"([^"]+)"/gi, "DEFAULT '$1'");

function convertCreateTable(rawSql, table) {
    let body = rawSql.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s*\(/i, '');
    body = body.substring(0, body.lastIndexOf(')'));
    // Foreign keys are left out so tables can be created in any order.
    body = body.replace(/,?\s*FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+\w+\s*\([^)]*\)(?:\s+ON\s+DELETE\s+(?:CASCADE|SET\s+NULL|NO\s+ACTION|RESTRICT))?/gi, '');
    body = body.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'INT IDENTITY(1,1) PRIMARY KEY');
    body = convertColumnTypes(body);

    // SQL Server cannot index NVARCHAR(MAX), so columns under a UNIQUE
    // constraint are narrowed to NVARCHAR(255).
    const uniqueColumns = new Set();
    for (const m of body.matchAll(/^\s*(\w+)\s+NVARCHAR\(MAX\)[^,]*UNIQUE/gim)) uniqueColumns.add(m[1]);
    for (const m of body.matchAll(/UNIQUE\s*\(([^)]+)\)/gi)) m[1].split(',').forEach((c) => uniqueColumns.add(c.trim()));
    for (const column of uniqueColumns) {
        body = body.replace(new RegExp(`(\\b${column}\\s+)NVARCHAR\\(MAX\\)`, 'gi'), '$1NVARCHAR(255)');
    }
    body = body.replace(/,\s*$/, '');

    return `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='${table}' AND schema_id=SCHEMA_ID('${SCHEMA}'))
CREATE TABLE ${SCHEMA}.${table} (
${body}
)`;
}

function convertCreateIndex([, unique, name, table, columns]) {
    // TRY/CATCH skips indexes SQL Server refuses (e.g. on NVARCHAR(MAX) columns).
    return `BEGIN TRY
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='${name}' AND object_id=OBJECT_ID('${SCHEMA}.${table}'))
    CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${name} ON ${SCHEMA}.${table}(${columns})
END TRY BEGIN CATCH END CATCH`;
}

// ── Queries ────────────────────────────────────────────────────────────────

function convertSql(rawSql, params = []) {
    const create = rawSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);
    if (create) return { sql: convertCreateTable(rawSql, create[1]), params: {} };

    const index = rawSql.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)/i);
    if (index) return { sql: convertCreateIndex(index), params: {} };

    let s = rawSql;
    const alter = s.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+/i);
    if (alter) s = convertColumnTypes(s.replace(alter[0], `ALTER TABLE ${SCHEMA}.${alter[1]} ADD `));
    else s = prefixTables(s);

    // INSERT OR IGNORE / OR REPLACE: insert, ignoring duplicate-key errors.
    const ignoreDuplicates = /INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO/i.test(s);
    if (ignoreDuplicates) s = s.replace(/INSERT\s+OR\s+(?:IGNORE|REPLACE)\s+INTO/gi, 'INSERT INTO');

    // SQLite date functions. "Now" is UTC, the clock the driver writes JS dates in
    // (useUTC), so stored instants and the server's clock always compare correctly.
    s = s.replace(
        /datetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+(second|minute|hour|day)s?'\s*\)/gi,
        (match, amount, unit) => `DATEADD(${unit.toUpperCase()}, ${parseInt(amount, 10)}, GETUTCDATE())`,
    );
    s = s.replace(/datetime\(\s*'now'\s*(?:,\s*'localtime'\s*)?\)/gi, 'GETUTCDATE()');
    s = s.replace(/\bGETDATE\s*\(\s*\)/gi, 'GETUTCDATE()');
    s = s.replace(/datetime\((\w+(?:\.\w+)?)\)/gi, '$1');
    s = s.replace(/GROUP_CONCAT\s*\(([^,)]+),\s*([^)]+)\)/gi, 'STRING_AGG($1, $2)');

    // ? placeholders → @p0, @p1, ...
    const named = {};
    let i = 0;
    s = s.replace(/\?/g, () => {
        const name = `p${i}`;
        if (i < params.length) named[name] = params[i];
        i += 1;
        return `@${name}`;
    });

    // LIMIT/OFFSET → OFFSET ... FETCH, which needs an ORDER BY.
    s = s.replace(/\bLIMIT\s+(@p\d+|\d+)\s+OFFSET\s+(@p\d+|\d+)/gi, 'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY');
    s = s.replace(/\bLIMIT\s+(@p\d+|\d+)/gi, 'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY');
    if (/\bOFFSET\s+/i.test(s) && !/\bORDER\s+BY\b/i.test(s)) s = s.replace(/\bOFFSET\s+/i, 'ORDER BY (SELECT NULL) OFFSET ');

    if (ignoreDuplicates) s = `BEGIN TRY ${s} END TRY BEGIN CATCH IF ERROR_NUMBER() NOT IN (2627, 2601) THROW END CATCH`;

    return { sql: s, params: named };
}

// ── Adapter ────────────────────────────────────────────────────────────────

const INT32_MAX = 2147483647;

function bind(request, params) {
    for (const [name, value] of Object.entries(params)) {
        if (value === undefined || value === null) request.input(name, sql.NVarChar, null);
        else if (typeof value === 'number') {
            if (!Number.isInteger(value)) request.input(name, sql.Float, value);
            else if (Math.abs(value) > INT32_MAX) request.input(name, sql.BigInt, value);
            else request.input(name, sql.Int, value);
        } else if (typeof value === 'boolean') request.input(name, sql.Bit, value ? 1 : 0);
        else if (value instanceof Date) request.input(name, sql.DateTime, value);
        // Zoned ISO strings and Pakistan wall-clock times are instants, not text.
        else if (hasZone(value) || isWallClock(value)) request.input(name, sql.DateTime, parseInstant(value));
        else request.input(name, sql.NVarChar, String(value));
    }
}

class MssqlAdapter {
    constructor(pool) {
        this.client = 'mssql';
        this.pool = pool;
    }

    async execute(rawSql, params) {
        const { sql: text, params: named } = convertSql(rawSql, params);
        const request = this.pool.request();
        bind(request, named);
        try {
            return await request.query(text);
        } catch (err) {
            if (err.number === 2627 || err.number === 2601) err.code = 'DB_UNIQUE_VIOLATION';
            else if (err.number === 547) err.code = 'DB_FOREIGN_KEY_VIOLATION';
            throw err;
        }
    }

    run(rawSql, paramsOrCb, maybeCb) {
        const { params, callback } = parseArgs(paramsOrCb, maybeCb);
        const isInsert = /^\s*INSERT\s/i.test(rawSql);
        // SCOPE_IDENTITY() reports the id of the row this statement inserted.
        this.execute(isInsert ? `${rawSql}; SELECT SCOPE_IDENTITY() AS lastID` : rawSql, params).then(
            (result) => deliver(callback, {
                lastID: isInsert ? result.recordset?.[0]?.lastID ?? null : null,
                changes: result.rowsAffected?.[0] ?? 0,
            }, null),
            (err) => deliver(callback, { lastID: null, changes: 0 }, err),
        );
    }

    get(rawSql, paramsOrCb, maybeCb) {
        const { params, callback } = parseArgs(paramsOrCb, maybeCb);
        this.execute(rawSql, params).then(
            (result) => deliver(callback, null, null, result.recordset?.[0]),
            (err) => deliver(callback, null, err, undefined),
        );
    }

    all(rawSql, paramsOrCb, maybeCb) {
        const { params, callback } = parseArgs(paramsOrCb, maybeCb);
        this.execute(rawSql, params).then(
            (result) => deliver(callback, null, null, result.recordset || []),
            (err) => deliver(callback, null, err, []),
        );
    }

    async tableNames() {
        const result = await this.pool.request()
            .input('schema', sql.NVarChar, SCHEMA)
            .query('SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema');
        return result.recordset.map((row) => row.name);
    }

    /** Runs T-SQL as written (no translation); used by one-off schema maintenance. */
    async raw(text) {
        const result = await this.pool.request().query(text);
        return result.recordset || [];
    }

    async tableColumns(table) {
        const result = await this.pool.request()
            .input('schema', sql.NVarChar, SCHEMA)
            .input('table', sql.NVarChar, table)
            .query('SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table');
        return result.recordset.map((row) => row.name);
    }

    async close() {
        await this.pool.close();
    }
}

async function open(config) {
    const pool = await new sql.ConnectionPool(config).connect();
    await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name='${SCHEMA}') EXEC('CREATE SCHEMA ${SCHEMA}')`);
    return new MssqlAdapter(pool);
}

module.exports = { open, convertSql };

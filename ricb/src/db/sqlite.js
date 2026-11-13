/**
 * Local SQLite database (Node's built-in node:sqlite), used when SQL Server is
 * not configured or not reachable. Exposes the same callback API as the SQL
 * Server adapter so the rest of the app does not care which one is active.
 *
 * Timestamps are stored as UTC 'YYYY-MM-DD HH:MM:SS' (SQLite's CURRENT_TIMESTAMP
 * format) and come back as Date objects, matching what the mssql driver returns.
 */
const { DatabaseSync } = require('node:sqlite');
const { parseArgs, deliver } = require('./callbacks');
const { hasZone, isWallClock, parseInstant } = require('../utils/time');

const TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

const toTimestamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const toParam = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toTimestamp(value);
    // Zoned ISO strings and Pakistan wall-clock times are stored as UTC like every other instant.
    if (typeof value === 'string') return hasZone(value) || isWallClock(value) ? toTimestamp(parseInstant(value)) : value;
    if (typeof value === 'number' || typeof value === 'bigint' || Buffer.isBuffer(value)) return value;
    return String(value);
};

const toRow = (row) => {
    if (!row) return row;
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        out[key] = typeof value === 'string' && TIMESTAMP.test(value) ? new Date(`${value.replace(' ', 'T')}Z`) : value;
    }
    return out;
};

// ── T-SQL that some queries use and SQLite lacks ──────────────────────────

const closingParen = (sql, open) => {
    let depth = 0;
    let quoted = false;
    for (let i = open; i < sql.length; i += 1) {
        const ch = sql[i];
        if (ch === "'") quoted = !quoted;
        else if (!quoted && ch === '(') depth += 1;
        else if (!quoted && ch === ')' && --depth === 0) return i;
    }
    return -1;
};

const splitArgs = (inner) => {
    const args = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    for (let i = 0; i < inner.length; i += 1) {
        const ch = inner[i];
        if (ch === "'") quoted = !quoted;
        else if (!quoted && ch === '(') depth += 1;
        else if (!quoted && ch === ')') depth -= 1;
        else if (!quoted && ch === ',' && depth === 0) {
            args.push(inner.slice(start, i).trim());
            start = i + 1;
        }
    }
    args.push(inner.slice(start).trim());
    return args;
};

/** Replaces every NAME(...) call with replace(innerText). */
const rewriteCalls = (sql, name, replace) => {
    const re = new RegExp(`\\b${name}\\s*\\(`, 'gi');
    let out = '';
    let from = 0;
    let match;
    while ((match = re.exec(sql))) {
        const open = re.lastIndex - 1;
        const close = closingParen(sql, open);
        if (close < 0) break;
        out += sql.slice(from, match.index) + replace(sql.slice(open + 1, close));
        from = close + 1;
        re.lastIndex = from;
    }
    return out + sql.slice(from);
};

const DATE_UNITS = {
    year: 'years', yy: 'years', yyyy: 'years',
    month: 'months', mm: 'months', m: 'months',
    day: 'days', dd: 'days', d: 'days',
    hour: 'hours', hh: 'hours',
    minute: 'minutes', mi: 'minutes', n: 'minutes',
    second: 'seconds', ss: 'seconds', s: 'seconds',
};

const translate = (sql) => {
    let s = sql.replace(/\bEproc\./g, '');
    s = s.replace(/\bGETDATE\s*\(\s*\)/gi, "datetime('now')");
    s = s.replace(/\bISNULL\s*\(/gi, 'IFNULL(');
    s = s.replace(/\bLEN\s*\(/gi, 'LENGTH(');
    if (/\bDATEADD\s*\(/i.test(s)) {
        s = rewriteCalls(s, 'DATEADD', (inner) => {
            const [unit, amount, expr] = splitArgs(inner);
            const modifier = DATE_UNITS[unit.toLowerCase()];
            if (!modifier) throw new Error(`Unsupported DATEADD unit: ${unit}`);
            return `datetime(${expr}, (${amount}) || ' ${modifier}')`;
        });
    }
    if (/\bCAST\s*\(/i.test(s)) {
        s = rewriteCalls(s, 'CAST', (inner) => {
            const asDate = inner.match(/^([\s\S]*)\s+AS\s+DATE$/i);
            return asDate ? `date(${asDate[1].trim()})` : `CAST(${inner})`;
        });
    }
    return s;
};

const countPlaceholders = (sql) => {
    let count = 0;
    let quoted = false;
    for (const ch of sql) {
        if (ch === "'") quoted = !quoted;
        else if (!quoted && ch === '?') count += 1;
    }
    return count;
};

// node:sqlite reports constraint failures by SQLite's extended result code.
const UNIQUE_CODES = new Set([1555, 2067]); // PRIMARYKEY, UNIQUE
const FOREIGN_KEY_CODE = 787;

const normaliseError = (err) => {
    if (UNIQUE_CODES.has(err.errcode)) err.code = 'DB_UNIQUE_VIOLATION';
    else if (err.errcode === FOREIGN_KEY_CODE) err.code = 'DB_FOREIGN_KEY_VIOLATION';
    return err;
};

const STATEMENT_CACHE_LIMIT = 500;

class SqliteAdapter {
    constructor(file) {
        this.client = 'sqlite';
        this.file = file;
        this.db = new DatabaseSync(file);
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
        this.statements = new Map();
    }

    prepare(rawSql) {
        let entry = this.statements.get(rawSql);
        if (!entry) {
            const sql = translate(rawSql);
            entry = { stmt: this.db.prepare(sql), arity: countPlaceholders(sql) };
            if (this.statements.size >= STATEMENT_CACHE_LIMIT) {
                this.statements.delete(this.statements.keys().next().value);
            }
            this.statements.set(rawSql, entry);
        }
        return entry;
    }

    // Deferred so callbacks are always asynchronous, as with the mssql adapter.
    execute(rawSql, params, method) {
        return new Promise((resolve, reject) => {
            setImmediate(() => {
                try {
                    const { stmt, arity } = this.prepare(rawSql);
                    resolve(stmt[method](...params.slice(0, arity).map(toParam)));
                } catch (err) {
                    reject(normaliseError(err));
                }
            });
        });
    }

    run(sql, paramsOrCb, maybeCb) {
        const { params, callback } = parseArgs(paramsOrCb, maybeCb);
        this.execute(sql, params, 'run').then(
            (result) => deliver(callback, { lastID: Number(result.lastInsertRowid), changes: Number(result.changes) }, null),
            (err) => deliver(callback, { lastID: null, changes: 0 }, err),
        );
    }

    get(sql, paramsOrCb, maybeCb) {
        const { params, callback } = parseArgs(paramsOrCb, maybeCb);
        this.execute(sql, params, 'get').then(
            (row) => deliver(callback, null, null, toRow(row)),
            (err) => deliver(callback, null, err, undefined),
        );
    }

    all(sql, paramsOrCb, maybeCb) {
        const { params, callback } = parseArgs(paramsOrCb, maybeCb);
        this.execute(sql, params, 'all').then(
            (rows) => deliver(callback, null, null, rows.map(toRow)),
            (err) => deliver(callback, null, err, []),
        );
    }

    async tableNames() {
        return this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    }

    async tableColumns(table) {
        return this.db.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name);
    }

    async close() {
        this.statements.clear();
        this.db.close();
    }
}

const open = (file) => new SqliteAdapter(file);

module.exports = { open, translate };

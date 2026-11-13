/**
 * Database connection and query helpers.
 *
 * DB_CLIENT picks the database:
 *   auto   (default) SQL Server when it is configured and reachable at startup,
 *          otherwise the local SQLite file. The choice holds until restart, so
 *          writes never split between the two.
 *   mssql  SQL Server only; while it is unreachable the API answers 503 and
 *          keeps retrying in the background.
 *   sqlite the local SQLite file only.
 */
const env = require('../config/env');
const mssql = require('./mssql');
const sqlite = require('./sqlite');
const { migrate } = require('./schema');

const RETRY_INTERVAL_MS = 15_000;

let db = null;
let connecting = null;
let lastAttemptAt = 0;
let lastError = null;

const mssqlConfig = () => ({
    ...env.mssql,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 5_000,
    requestTimeout: 15_000,
});

async function openDatabase() {
    const { client, sqliteFile } = env.db;
    if (client !== 'sqlite') {
        if (!env.mssql) {
            console.warn('SQL Server is not configured (MSSQL_* in .env).');
        } else {
            try {
                return await mssql.open(mssqlConfig());
            } catch (err) {
                if (client === 'mssql') throw err;
                console.warn(`SQL Server unreachable: ${err.message}`);
            }
        }
    }
    console.info(`Using the local SQLite database at ${sqliteFile}`);
    return sqlite.open(sqliteFile);
}

/** Connects (once) and brings the schema up to date. Never rejects. */
function connectDatabase() {
    if (db) return Promise.resolve(db);
    if (connecting) return connecting;

    lastAttemptAt = Date.now();
    connecting = (async () => {
        try {
            db = await openDatabase();
            lastError = null;
            if (db.client === 'mssql') console.info('Connected to SQL Server');
            try {
                await migrate(schemaHelpers);
            } catch (err) {
                console.error('Schema update failed:', err);
            }
        } catch (err) {
            if (err.message !== lastError) console.warn('Database unreachable; retrying in the background:', err.message);
            lastError = err.message;
        } finally {
            connecting = null;
        }
        return db;
    })();
    return connecting;
}

/** Fire-and-forget reconnect for request middleware; at most once per interval. */
function ensureDatabaseConnection() {
    if (!db && !connecting && Date.now() - lastAttemptAt >= RETRY_INTERVAL_MS) connectDatabase();
}

const isDatabaseConnected = () => db !== null;

/** 'mssql', 'sqlite', or null while disconnected. */
const databaseClient = () => db?.client ?? null;

function getDatabase() {
    if (!db) {
        const err = new Error('Database is not connected');
        err.code = 'DB_UNAVAILABLE';
        throw err;
    }
    return db;
}

// ── Query helpers ──────────────────────────────────────────────────────────

/** First matching row, or undefined. */
const dbGet = (sql, params = []) =>
    new Promise((resolve, reject) => {
        getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

/** All matching rows (always an array). */
const dbAll = (sql, params = []) =>
    new Promise((resolve, reject) => {
        getDatabase().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

/** Executes a statement; resolves to { lastID, changes }. */
const dbRun = (sql, params = []) =>
    new Promise((resolve, reject) => {
        getDatabase().run(sql, params, function onDone(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });

const isUniqueViolation = (err) => err?.code === 'DB_UNIQUE_VIOLATION';
const isForeignKeyViolation = (err) => err?.code === 'DB_FOREIGN_KEY_VIOLATION';

const schemaHelpers = {
    get: dbGet,
    all: dbAll,
    run: dbRun,
    tables: () => getDatabase().tableNames(),
    columns: (table) => getDatabase().tableColumns(table),
    client: () => getDatabase().client,
    raw: (text) => getDatabase().raw(text),
};

module.exports = {
    connectDatabase,
    ensureDatabaseConnection,
    isDatabaseConnected,
    databaseClient,
    getDatabase,
    dbGet,
    dbAll,
    dbRun,
    isUniqueViolation,
    isForeignKeyViolation,
};

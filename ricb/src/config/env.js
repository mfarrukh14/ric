/**
 * Runtime configuration, read once from ricb/.env.
 *
 * Secrets never have fallbacks in code: a missing JWT secret or database
 * password is a deployment mistake and should fail loudly at startup, not
 * silently fall back to a value that is published in the repository.
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

// The system runs on Pakistan time wherever it is hosted: report dates, Excel/PDF output
// and any zone-less time a library parses all follow this. See src/utils/time.js.
process.env.TZ = 'Asia/Karachi';

const required = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
    }
    return value;
};

const DB_CLIENT = (process.env.DB_CLIENT || 'auto').toLowerCase();
if (!['auto', 'mssql', 'sqlite'].includes(DB_CLIENT)) {
    throw new Error(`DB_CLIENT must be auto, mssql or sqlite (got "${process.env.DB_CLIENT}").`);
}

const mssqlConfig = () => {
    const configured = ['MSSQL_HOST', 'MSSQL_DATABASE', 'MSSQL_USER', 'MSSQL_PASSWORD'].every((name) => process.env[name]);
    if (!configured && DB_CLIENT !== 'mssql') return null;
    return {
        server: required('MSSQL_HOST'),
        port: Number(process.env.MSSQL_PORT) || 1433,
        database: required('MSSQL_DATABASE'),
        user: required('MSSQL_USER'),
        password: required('MSSQL_PASSWORD'),
    };
};

const list = (value) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);

module.exports = {
    ROOT,
    PORT: Number(process.env.PORT) || 5000,
    HOST: process.env.HOST || '0.0.0.0',
    JWT_SECRET: required('JWT_SECRET'),
    // Empty means "any origin". Auth uses bearer tokens, not cookies, so this is
    // not a CSRF surface, but deployments can still pin it down.
    CORS_ORIGINS: list(process.env.CORS_ORIGINS),
    FINANCE_CALLBACK_TOKEN: process.env.FINANCE_CALLBACK_TOKEN || '',
    // Encrypts staff passwords so the superadmin can view them later. Defaults to a key
    // derived from JWT_SECRET; changing whichever is used makes stored passwords unreadable
    // (reset them from People & teams).
    CREDENTIALS_KEY: process.env.CREDENTIALS_KEY || '',
    db: {
        client: DB_CLIENT,
        sqliteFile: path.resolve(ROOT, process.env.SQLITE_FILE || 'database.sqlite'),
    },
    // null when SQL Server is not configured, which is only allowed when the
    // local SQLite database can stand in (DB_CLIENT auto or sqlite).
    mssql: mssqlConfig(),
};

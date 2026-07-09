// Independent connection to the hospital's real inventory system (HMS_Jun26),
// used only to look up actual stock-on-hand for items during store fulfillment.
// Kept entirely separate from the main app's mssql connection pool (mssqlAdapter.js)
// so a problem here can never affect the primary eProc database connection.
const sql = require('mssql');

// Credentials are intentionally NOT hardcoded here - set them in ricb/.env
// (see .env.example) as HMS_STOCK_DB_HOST/PORT/NAME/USER/PASSWORD.
const getHmsStockConfig = () => {
    const required = ['HMS_STOCK_DB_HOST', 'HMS_STOCK_DB_NAME', 'HMS_STOCK_DB_USER', 'HMS_STOCK_DB_PASSWORD'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`HMS stock lookup is not configured - missing env vars: ${missing.join(', ')}`);
    }

    return {
        server: process.env.HMS_STOCK_DB_HOST,
        port: parseInt(process.env.HMS_STOCK_DB_PORT || '1433', 10),
        database: process.env.HMS_STOCK_DB_NAME,
        user: process.env.HMS_STOCK_DB_USER,
        password: process.env.HMS_STOCK_DB_PASSWORD,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
        },
        pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
        connectionTimeout: 5000,
        requestTimeout: 5000,
    };
};

let pool = null;
let connecting = null;

const getHmsStockPool = async () => {
    if (pool && pool.connected) return pool;

    if (!connecting) {
        connecting = new sql.ConnectionPool(getHmsStockConfig())
            .connect()
            .then((connectedPool) => {
                pool = connectedPool;
                connecting = null;
                return pool;
            })
            .catch((err) => {
                connecting = null;
                throw err;
            });
    }

    return connecting;
};

module.exports = { getHmsStockPool, sql };

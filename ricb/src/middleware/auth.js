/**
 * Authentication and authorization.
 *
 * One bearer token scheme serves two kinds of account:
 *   - staff (users table): tokens carry { id }
 *   - suppliers (suppliers table): tokens carry { supplierId } (or the legacy { type: 'supplier', id })
 *
 * `authenticate` accepts either and sets req.user. Routes then narrow access with
 * `requireStaff`, `requireSupplier` or `requireSuperAdmin`, so a supplier's token can
 * never drive an internal workflow just because it is a valid token.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, FINANCE_CALLBACK_TOKEN } = require('../config/env');
const { dbGet: getRow } = require('../db');

// Columns that must never ride along on req.user, where a careless res.json could leak them.
const SECRET_COLUMNS = ['password', 'password_sealed', 'plain_password', 'two_factor_secret', 'backup_codes'];

const withoutSecrets = (row) => {
    const safe = { ...row };
    for (const column of SECRET_COLUMNS) delete safe[column];
    return safe;
};

const bearerToken = (req) => {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

const supplierIdFrom = (claims) => claims.supplierId ?? (claims.type === 'supplier' ? claims.id : null);

const loadSupplier = (id) => getRow('SELECT * FROM suppliers WHERE id = ?', [id]);

const loadStaff = (id) =>
    getRow(
        `SELECT u.*, d.name AS department_name, c.name AS committee_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN committees c ON u.committee_id = c.id
         WHERE u.id = ? AND u.deactivated_at IS NULL`,
        [id]
    );

const toSupplierUser = (supplier) => ({
    id: supplier.id,
    supplierId: supplier.id,
    role: 'supplier',
    username: supplier.username,
    businessEmail: supplier.business_email || supplier.company_email,
    emailVerified: supplier.email_verified === 1 || supplier.email_verified === true,
    registrationStep: supplier.registration_step,
    status: supplier.status,
});

const unauthorized = (res, message = 'Please authenticate') => res.status(401).json({ error: message });

const verifyToken = (req) => {
    const token = bearerToken(req);
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
};

/** Resolves the bearer token to a staff user or supplier and sets req.user. */
const authenticate = async (req, res, next) => {
    const claims = verifyToken(req);
    if (!claims || claims.purpose) return unauthorized(res); // purpose-scoped tokens (e.g. 2FA challenge) are not sessions

    try {
        const supplierId = supplierIdFrom(claims);
        if (supplierId != null) {
            const supplier = await loadSupplier(supplierId);
            if (!supplier) return unauthorized(res);
            req.user = toSupplierUser(supplier);
        } else {
            const user = await loadStaff(claims.id);
            if (!user) return unauthorized(res);
            req.user = withoutSecrets(user);
        }
        next();
    } catch (error) {
        // A database outage is not the user's fault: don't answer 401, which logs them out.
        console.error('Authentication lookup failed:', error.message);
        res.status(503).json({ error: 'Service temporarily unavailable.' });
    }
};

const requireStaff = (req, res, next) =>
    req.user && req.user.role !== 'supplier' ? next() : res.status(403).json({ error: 'Access denied.' });

const requireSupplier = (req, res, next) =>
    req.user?.role === 'supplier' ? next() : res.status(403).json({ error: 'Supplier account required.' });

// Suppliers sign in before they are approved, to finish their application. Tenders,
// bids, awards and grievances are for approved suppliers only.
const requireApprovedSupplier = (req, res, next) =>
    req.user?.role === 'supplier' && req.user.status === 'approved'
        ? next()
        : res.status(403).json({ error: 'Your supplier account has not been approved yet.' });

// The application can be edited until it is submitted, and again when the committee asks for changes.
const EDITABLE_APPLICATION = new Set(['draft', 'pending_resubmission']);
const requireEditableApplication = (req, res, next) => {
    if (req.user?.role !== 'supplier') return res.status(403).json({ error: 'Supplier account required.' });
    if (!EDITABLE_APPLICATION.has(req.user.status)) return res.status(409).json({ error: 'This application can no longer be changed.' });
    return next();
};

const requireSuperAdmin = (req, res, next) =>
    req.user?.role === 'superadmin' ? next() : res.status(403).json({ error: 'Access denied. Superadmin only.' });

/**
 * Supplier-only authentication that also exposes the 2FA columns, for the
 * supplier 2FA endpoints that need them. Sets req.supplier.
 */
const authenticateSupplierToken = async (req, res, next) => {
    const claims = verifyToken(req);
    const supplierId = claims && !claims.purpose ? supplierIdFrom(claims) : null;
    if (supplierId == null) return unauthorized(res, 'Please authenticate as supplier');

    try {
        const supplier = await loadSupplier(supplierId);
        if (!supplier) return unauthorized(res, 'Please authenticate as supplier');
        req.supplier = {
            id: supplier.id,
            username: supplier.username,
            business_email: supplier.business_email,
            status: supplier.status,
            two_factor_enabled: supplier.two_factor_enabled,
            two_factor_secret: supplier.two_factor_secret,
            backup_codes: supplier.backup_codes,
        };
        next();
    } catch (error) {
        console.error('Supplier authentication lookup failed:', error.message);
        res.status(503).json({ error: 'Service temporarily unavailable.' });
    }
};

/** Shared-secret check for server-to-server calls from the Finance module. */
const requireFinanceToken = (req, res, next) => {
    if (!FINANCE_CALLBACK_TOKEN) return res.status(503).json({ error: 'Finance integration is not configured' });
    const sent = Buffer.from(String(req.headers['x-finance-token'] || ''));
    const expected = Buffer.from(FINANCE_CALLBACK_TOKEN);
    return sent.length === expected.length && crypto.timingSafeEqual(sent, expected)
        ? next()
        : res.status(401).json({ error: 'Unauthorized' });
};

const staffOnly = [authenticate, requireStaff];
const supplierOnly = [authenticate, requireSupplier];
const approvedSupplierOnly = [authenticate, requireApprovedSupplier];
const applicantOnly = [authenticate, requireEditableApplication];
const superAdminOnly = [authenticate, requireSuperAdmin];

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.authenticateToken = authenticate;
module.exports.authenticateSupplierToken = authenticateSupplierToken;
module.exports.requireStaff = requireStaff;
module.exports.requireSupplier = requireSupplier;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.requireFinanceToken = requireFinanceToken;
module.exports.staffOnly = staffOnly;
module.exports.supplierOnly = supplierOnly;
module.exports.approvedSupplierOnly = approvedSupplierOnly;
module.exports.applicantOnly = applicantOnly;
module.exports.superAdminOnly = superAdminOnly;

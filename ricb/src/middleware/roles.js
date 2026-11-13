/**
 * Staff roles, derived from a user's department, committee and HOD flag (the
 * same rules as ricf/src/app/navigation.js). Use after `authenticate`:
 *
 *   router.post('/open/:id', allow('purchase'), handler)
 *
 * The superadmin passes every check.
 */
const department = (user) => String(user?.department_name || '').toLowerCase();
const committee = (user) => String(user?.committee_name || '').toLowerCase();
const isHod = (user) => Number(user?.is_hod) === 1;

const ROLES = {
    purchase: (u) => department(u) === 'purchase',
    store: (u) => department(u) === 'store',
    hod: isHod,
    purchaseHod: (u) => isHod(u) && department(u) === 'purchase',
    storeHod: (u) => isHod(u) && department(u) === 'store',
    financeHod: (u) => isHod(u) && department(u) === 'finance',
    msHod: (u) => isHod(u) && department(u) === 'ms',
    supplierEvaluation: (u) => committee(u) === 'supplier evaluation committee',
    technicalEvaluation: (u) => committee(u).includes('technical evaluation'),
    grievance: (u) => committee(u).includes('grievance'),
    vetting: (u) => committee(u).includes('vetting'),
    marketSurvey: (u) => committee(u).includes('market survey'),
};

const hasRole = (user, role) => user?.role === 'superadmin' || ROLES[role](user);

/** Middleware: lets the request through when the user holds any of `roles`. */
function allow(...roles) {
    const unknown = roles.filter((role) => !ROLES[role]);
    if (unknown.length) throw new Error(`Unknown role(s): ${unknown.join(', ')}`);
    return (req, res, next) =>
        roles.some((role) => hasRole(req.user, role))
            ? next()
            : res.status(403).json({ error: 'You do not have access to this action.', message: 'You do not have access to this action.' });
}

module.exports = { allow, hasRole };

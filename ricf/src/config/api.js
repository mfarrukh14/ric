import axios from 'axios';

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

/** eProc API. Defaults to port 5000 on whichever host served the app. */
export const apiUrl = import.meta.env.VITE_EPROC_API_URL || `http://${host}:5000/api`;

/** Finance module (cross-authentication for finance-only accounts). */
export const FINANCE_API_URL = import.meta.env.VITE_FINANCE_API_URL || `http://${host}:5000/api`;
export const FINANCE_FRONTEND_URL = import.meta.env.VITE_FINANCE_FRONTEND_URL || `http://${host}:5173`;

const api = axios.create({
    baseURL: apiUrl,
    headers: { 'Content-Type': 'application/json' },
});

// Staff and supplier sessions both authenticate with a bearer token.
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token') || localStorage.getItem('supplierToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

/** Runs a request and returns its data; failures reject with the server's { error | message }. */
const call = (promise, fallback = 'Something went wrong') =>
    promise.then(
        (response) => response.data,
        (error) => {
            throw error.response?.data || { error: error.response ? fallback : 'Cannot reach the server. Check your connection.' };
        }
    );

// ── Auth ─────────────────────────────────────────────────────────────
export const login = (username, password) => call(api.post('/auth/login', { username, password }));
export const complete2FALogin = (challenge, token, isBackupCode = false) =>
    call(api.post('/auth/complete-2fa-login', { challenge, token, isBackupCode }));

// ── Two-factor authentication ────────────────────────────────────────
export const setup2FA = () => call(api.post('/2fa/setup'));
export const enable2FA = (token) => call(api.post('/2fa/enable', { token }));
export const disable2FA = (token, isBackupCode = false) => call(api.post('/2fa/disable', { token, isBackupCode }));
export const get2FAStatus = () => call(api.get('/2fa/status'));
export const regenerateBackupCodes = (token, isBackupCode = false) =>
    call(api.post('/2fa/regenerate-backup-codes', { token, isBackupCode }));

/** The 2FA operations, for staff and for suppliers, behind one interface. */
export const staffTwoFactor = { status: get2FAStatus, setup: setup2FA, enable: enable2FA, disable: disable2FA, regenerate: regenerateBackupCodes };
export const supplierTwoFactor = {
    status: () => call(api.get('/supplier-2fa/status')),
    setup: () => call(api.post('/supplier-2fa/setup')),
    enable: (token) => call(api.post('/supplier-2fa/enable', { token })),
    disable: (code, isBackupCode) => call(api.post('/supplier-2fa/disable', isBackupCode ? { backupCode: code } : { token: code })),
    regenerate: (code) => call(api.post('/supplier-2fa/regenerate-backup-codes', { token: code })),
};
export const completeSupplier2FALogin = (challenge, token, isBackupCode = false) =>
    call(api.post('/suppliers/complete-2fa-login', { challenge, token, isBackupCode }));

// ── Organisation ─────────────────────────────────────────────────────
export const listDepartments = () => call(api.get('/admin/departments'));
export const createDepartment = (name) => call(api.post('/admin/departments', { name }), 'Failed to create department');
export const deleteDepartment = (id) => call(api.delete(`/admin/departments/${id}`));

export const listCommittees = () => call(api.get('/admin/committees'));
export const createCommittee = (name) => call(api.post('/admin/committees', { name }), 'Failed to create committee');
export const deleteCommittee = (id) => call(api.delete(`/admin/committees/${id}`));

export const listUsers = () => call(api.get('/admin/users'));
export const createUser = (user) => call(api.post('/admin/users', user), 'Failed to create user');
export const deleteUser = (id) => call(api.delete(`/admin/users/${id}`), 'Failed to remove user');
export const revealUserPassword = (id) => call(api.get(`/admin/users/${id}/password`), 'Failed to load password');
export const resetUserPassword = (id) => call(api.post(`/admin/users/${id}/reset-password`), 'Failed to reset password');
export const updateHodStatus = (userId, isHod) => call(api.put('/admin/users/hod-status', { userId, isHod }), 'Failed to update HOD status');
export const updateEprocStatus = (userId, isEprocUser) =>
    call(api.put('/admin/users/eproc-status', { userId, isEprocUser }), 'Failed to update eProcurement status');

// ── Item catalogue ───────────────────────────────────────────────────
export const getItemCategories = () => call(api.get('/items/categories'));
export const createItemCategory = (category) => call(api.post('/items/categories', category));
export const updateItemCategory = (id, category) => call(api.put(`/items/categories/${id}`, category));
export const deleteItemCategory = (id) => call(api.delete(`/items/categories/${id}`));

export const getAllItemNames = () => call(api.get('/items/names'));
export const getItemNamesByCategory = (categoryId) => call(api.get(`/items/categories/${categoryId}/names`));
export const createItemName = (item) => call(api.post('/items/names', item));
export const updateItemName = (id, item) => call(api.put(`/items/names/${id}`, item));
export const deleteItemName = (id) => call(api.delete(`/items/names/${id}`));

// Per-category custom fields (text / number / dropdown) with dependent options
export const getCategoryFields = (categoryId) => call(api.get(`/items/categories/${categoryId}/fields`));
export const createCategoryField = (categoryId, field) => call(api.post(`/items/categories/${categoryId}/fields`, field));
export const updateCategoryField = (fieldId, field) => call(api.put(`/items/fields/${fieldId}`, field));
export const deleteCategoryField = (fieldId) => call(api.delete(`/items/fields/${fieldId}`));
export const createFieldOption = (fieldId, option) => call(api.post(`/items/fields/${fieldId}/options`, option));
export const updateFieldOption = (optionId, option) => call(api.put(`/items/fields/options/${optionId}`, option));
export const deleteFieldOption = (optionId) => call(api.delete(`/items/fields/options/${optionId}`));

// ── Supplier tenders ─────────────────────────────────────────────────
export const getOpenTenders = () => call(api.get('/suppliers/tenders/active'));
export const getMyBids = () => call(api.get('/suppliers/bids/my-bids'));

/**
 * Downloads a file from the API with the signed-in token and saves it under the server's
 * file name (or `fallbackName`).
 */
export async function downloadFile(path, fallbackName = 'download') {
    let response;
    try {
        response = await api.get(path, { responseType: 'blob' });
    } catch (error) {
        const blob = error.response?.data;
        const detail = blob instanceof Blob ? await blob.text().then((t) => { try { return JSON.parse(t); } catch { return null; } }) : null;
        throw detail || { error: error.response ? 'Download failed' : 'Cannot reach the server. Check your connection.' };
    }
    const disposition = response.headers['content-disposition'] || '';
    const name = decodeURIComponent(disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] || fallbackName);
    const url = URL.createObjectURL(response.data);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Headers for raw fetch() calls made by older screens. */
export const authHeaders = (json = true) => {
    const token = localStorage.getItem('token') || localStorage.getItem('supplierToken');
    return {
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

export default api;

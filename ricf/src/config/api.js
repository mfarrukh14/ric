import axios from 'axios';

const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

// eProc backend
// - Prefer env override for deployments
// - Default to the same host running the frontend (port 5000)
const API_URL =
    import.meta.env.VITE_EPROC_API_URL ||
    `http://${runtimeHost}:5000/api`;

// Finance module configuration for cross-authentication
// - Prefer env override for deployments
// - Default to the same host running the frontend (ports 5000/5173)
export const FINANCE_API_URL =
    import.meta.env.VITE_FINANCE_API_URL ||
    `http://${runtimeHost}:5000/api`;
export const FINANCE_FRONTEND_URL =
    import.meta.env.VITE_FINANCE_FRONTEND_URL ||
    `http://${runtimeHost}:5173`;

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to requests if it exists
api.interceptors.request.use((config) => {
    // Support both internal user tokens and supplier tokens
    const token = localStorage.getItem('token') || localStorage.getItem('supplierToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth
export const login = async (username, password) => {
    try {
        const response = await api.post('/auth/login', { username, password });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

// Complete 2FA Login
export const complete2FALogin = async (userId, token, isBackupCode = false) => {
    try {
        const response = await api.post('/auth/complete-2fa-login', { 
            userId, 
            token, 
            isBackupCode 
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

// 2FA Management
export const setup2FA = async () => {
    try {
        const response = await api.post('/2fa/setup');
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const enable2FA = async (token) => {
    try {
        const response = await api.post('/2fa/enable', { token });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const verify2FA = async (userId, token, isBackupCode = false) => {
    try {
        const response = await api.post('/2fa/verify', { 
            userId, 
            token, 
            isBackupCode 
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const disable2FA = async (token, isBackupCode = false) => {
    try {
        const response = await api.post('/2fa/disable', { 
            token, 
            isBackupCode 
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const get2FAStatus = async () => {
    try {
        const response = await api.get('/2fa/status');
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const regenerateBackupCodes = async (token, isBackupCode = false) => {
    try {
        const response = await api.post('/2fa/regenerate-backup-codes', { 
            token, 
            isBackupCode 
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

// Department Management
export const createDepartment = async (name) => {
    const token = localStorage.getItem('token');
    if (!token) {
        throw { error: 'Authentication token not found. Please log in again.' };
    }
    
    try {
        const response = await api.post('/admin/departments', 
            { name },
            { 
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Department creation error:', error);
        throw error.response?.data || { error: 'Failed to create department' };
    }
};

export const listDepartments = async () => {
    const response = await api.get('/admin/departments');
    return response.data;
};

export const deleteDepartment = async (id) => {
    const response = await api.delete(`/admin/departments/${id}`);
    return response.data;
};

// Committee Management
export const createCommittee = async (name) => {
    const token = localStorage.getItem('token');
    if (!token) {
        throw { error: 'Authentication token not found. Please log in again.' };
    }
    
    try {
        const response = await api.post('/admin/committees', 
            { name },
            { 
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Committee creation error:', error);
        throw error.response?.data || { error: 'Failed to create committee' };
    }
};

export const listCommittees = async () => {
    const response = await api.get('/admin/committees');
    return response.data;
};

export const deleteCommittee = async (id) => {
    const response = await api.delete(`/admin/committees/${id}`);
    return response.data;
};

// User Management
export const createUser = async (userData) => {
    const token = localStorage.getItem('token');
    if (!token) {
        throw { error: 'Authentication token not found. Please log in again.' };
    }
    
    try {
        const response = await api.post('/admin/users', 
            userData,
            { 
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('User creation error:', error);
        throw error.response?.data || { error: 'Failed to create user' };
    }
};

export const listUsers = async () => {
    const response = await api.get('/admin/users');
    return response.data;
};

export const deleteUser = async (id) => {
    const response = await api.delete(`/admin/users/${id}`);
    return response.data;
};

export const updateHodStatus = async (userId, isHod) => {
    try {
        const response = await api.put('/admin/users/hod-status', {
            userId,
            isHod
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Failed to update HOD status' };
    }
};

export const updateEprocStatus = async (userId, isEprocUser) => {
    try {
        const response = await api.put('/admin/users/eproc-status', {
            userId,
            isEprocUser
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Failed to update eProcurement status' };
    }
};

// Demand Management
export const createDemand = async (demandData) => {
    const response = await api.post('/demands', demandData);
    return response.data;
};

export const getUserDemands = async () => {
    const response = await api.get('/demands/user');
    return response.data;
};

export const getAllDemands = async () => {
    const response = await api.get('/demands/all');
    return response.data;
};

export const updateDemandStatus = async (demandId, status, responseText) => {
    const response = await api.patch(`/demands/${demandId}/status`, { 
        status, 
        response: responseText 
    });
    return response.data;
};

export const getDemandById = async (demandId) => {
    const response = await api.get(`/demands/${demandId}`);
    return response.data;
};

// Item Categories
export const getItemCategories = async () => {
    const response = await api.get('/items/categories');
    return response.data;
};

export const createItemCategory = async (categoryData) => {
    const response = await api.post('/items/categories', categoryData);
    return response.data;
};

export const updateItemCategory = async (id, categoryData) => {
    const response = await api.put(`/items/categories/${id}`, categoryData);
    return response.data;
};

export const deleteItemCategory = async (id) => {
    const response = await api.delete(`/items/categories/${id}`);
    return response.data;
};

// Item Names
export const getItemNamesByCategory = async (categoryId) => {
    const response = await api.get(`/items/categories/${categoryId}/names`);
    return response.data;
};

export const getAllItemNames = async () => {
    const response = await api.get('/items/names');
    return response.data;
};

export const createItemName = async (itemNameData) => {
    const response = await api.post('/items/names', itemNameData);
    return response.data;
};

export const updateItemName = async (id, itemNameData) => {
    const response = await api.put(`/items/names/${id}`, itemNameData);
    return response.data;
};

export const deleteItemName = async (id) => {
    const response = await api.delete(`/items/names/${id}`);
    return response.data;
};

// Category Custom Fields (generic engine: text/number/dropdown fields per category)
export const getCategoryFields = async (categoryId) => {
    const response = await api.get(`/items/categories/${categoryId}/fields`);
    return response.data;
};

export const createCategoryField = async (categoryId, fieldData) => {
    const response = await api.post(`/items/categories/${categoryId}/fields`, fieldData);
    return response.data;
};

export const updateCategoryField = async (fieldId, fieldData) => {
    const response = await api.put(`/items/fields/${fieldId}`, fieldData);
    return response.data;
};

export const deleteCategoryField = async (fieldId) => {
    const response = await api.delete(`/items/fields/${fieldId}`);
    return response.data;
};

export const createFieldOption = async (fieldId, optionData) => {
    const response = await api.post(`/items/fields/${fieldId}/options`, optionData);
    return response.data;
};

export const updateFieldOption = async (optionId, optionData) => {
    const response = await api.put(`/items/fields/options/${optionId}`, optionData);
    return response.data;
};

export const deleteFieldOption = async (optionId) => {
    const response = await api.delete(`/items/fields/options/${optionId}`);
    return response.data;
};

// Supplier Registration
export const registerSupplier = async (supplierData) => {
    try {
        const response = await api.post('/suppliers/register', supplierData);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const loginSupplier = async (username, password) => {
    try {
        const response = await api.post('/suppliers/login', { username, password });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const sendEmailOTP = async (email) => {
    try {
        const response = await api.post('/suppliers/send-email-otp', { email });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const verifyEmailOTP = async (email, otp) => {
    try {
        const response = await api.post('/suppliers/verify-email-otp', { email, otp });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const saveRegistrationStep = async (stepData) => {
    try {
        const response = await api.post('/suppliers/save-step', stepData);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

export const submitSupplierApplication = async (applicationData) => {
    try {
        const response = await api.post('/suppliers/submit-application', applicationData);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Network error' };
    }
};

// Export API URL for direct fetch calls if needed
export const apiUrl = API_URL;

export default api;

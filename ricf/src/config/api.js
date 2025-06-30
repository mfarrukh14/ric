import axios from 'axios';

const API_URL = 'http://147.93.87.182:5001/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to requests if it exists
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
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

// Export API URL for direct fetch calls if needed
export const apiUrl = API_URL;

export default api;

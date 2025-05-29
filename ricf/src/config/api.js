import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

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
    const response = await api.post('/admin/departments', { name });
    return response.data;
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
    const response = await api.post('/admin/committees', { name });
    return response.data;
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
    const response = await api.post('/admin/users', userData);
    return response.data;
};

export const listUsers = async () => {
    const response = await api.get('/admin/users');
    return response.data;
};

export const deleteUser = async (id) => {
    const response = await api.delete(`/admin/users/${id}`);
    return response.data;
};

export default api;

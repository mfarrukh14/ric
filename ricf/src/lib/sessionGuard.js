import { toast } from 'react-toastify';
import api, { apiUrl } from '../config/api';
import { getSession, signOut } from './session';

/**
 * When a token expires, every request used to fail quietly and pages sat empty.
 * Any 401 from our API on an authenticated request now ends the session cleanly
 * and sends the person back to sign in.
 */

const CREDENTIAL_ENDPOINTS = /\/(auth\/login|auth\/complete-2fa-login|suppliers\/login|suppliers\/complete-2fa-login)\b/;

let expiring = false;

function expire() {
    if (expiring || !getSession()) return;
    expiring = true;
    signOut();
    toast.info('Your session has expired. Please sign in again.', { toastId: 'session-expired' });
    setTimeout(() => {
        expiring = false;
    }, 1500);
}

const hasAuthorization = (headers) => {
    if (!headers) return false;
    if (typeof headers.get === 'function') return Boolean(headers.get('Authorization'));
    return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization' && headers[key]);
};

export function installSessionGuard() {
    if (window.__ricSessionGuard) return;
    window.__ricSessionGuard = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
        const response = await originalFetch(input, init);
        if (response.status === 401) {
            const url = typeof input === 'string' ? input : input?.url || '';
            const headers = init.headers || (typeof input === 'object' ? input.headers : null);
            if (url.startsWith(apiUrl) && !CREDENTIAL_ENDPOINTS.test(url) && hasAuthorization(headers)) expire();
        }
        return response;
    };

    api.interceptors.response.use(
        (response) => response,
        (error) => {
            const url = error.config?.url || '';
            if (error.response?.status === 401 && !CREDENTIAL_ENDPOINTS.test(url) && hasAuthorization(error.config?.headers)) expire();
            return Promise.reject(error);
        }
    );
}

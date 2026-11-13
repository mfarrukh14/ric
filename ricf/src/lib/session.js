import { useSyncExternalStore } from 'react';

/**
 * The signed-in account, kept in localStorage under the keys the rest of the app
 * already reads ('token' + 'user' for staff, 'supplierToken' + 'supplier' for
 * suppliers). This module is the only place that writes them.
 */

const KEYS = ['token', 'user', 'supplier', 'supplierToken', 'supplierRegistrationIncomplete'];
const listeners = new Set();

const parse = (value) => {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
};

function load() {
    const user = parse(localStorage.getItem('user'));
    if (user && localStorage.getItem('token')) return user;

    const supplier = parse(localStorage.getItem('supplier'));
    // A supplier token minted for an unfinished registration is not a session.
    if (supplier && localStorage.getItem('supplierToken') && localStorage.getItem('supplierRegistrationIncomplete') !== 'true') {
        return { ...supplier, role: 'supplier' };
    }
    return null;
}

let current = load();

const emit = () => listeners.forEach((listener) => listener());

export function getSession() {
    return current;
}

export function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('supplierToken');
}

export function signInStaff(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    ['supplier', 'supplierToken', 'supplierRegistrationIncomplete'].forEach((k) => localStorage.removeItem(k));
    current = user;
    emit();
}

export function signInSupplier(token, supplier) {
    localStorage.setItem('supplierToken', token);
    localStorage.setItem('supplier', JSON.stringify({ ...supplier, role: 'supplier' }));
    localStorage.removeItem('supplierRegistrationIncomplete');
    ['token', 'user'].forEach((k) => localStorage.removeItem(k));
    current = { ...supplier, role: 'supplier' };
    emit();
}

/** Stores a supplier token that only drives the registration wizard; it survives a reload. */
export function beginSupplierRegistration(token, supplier, isResubmission = false) {
    localStorage.setItem('supplierToken', token);
    localStorage.setItem('supplier', JSON.stringify({ ...supplier, role: 'supplier', isResubmission }));
    localStorage.setItem('supplierRegistrationIncomplete', 'true');
}

/** The unfinished registration to reopen after a page reload, or null. */
export function pendingRegistration() {
    if (localStorage.getItem('supplierRegistrationIncomplete') !== 'true' || !localStorage.getItem('supplierToken')) return null;
    const supplier = parse(localStorage.getItem('supplier'));
    return supplier?.id ? { supplierId: supplier.id, isResubmission: Boolean(supplier.isResubmission) } : null;
}

export function signOut() {
    KEYS.forEach((k) => localStorage.removeItem(k));
    current = null;
    emit();
}

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function useSession() {
    return useSyncExternalStore(subscribe, getSession);
}

/** Display helpers */
export const displayName = (user) => (user?.role === 'supplier' ? user.companyName || user.username : user?.name || user?.username) || '';

export const initials = (name) =>
    String(name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');

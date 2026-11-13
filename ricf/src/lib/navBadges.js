import { useSyncExternalStore } from 'react';

/**
 * Counts shown beside sidebar items ("3 pending"). Pages that already fetch the
 * data publish a number here; the sidebar just reads it. No extra requests.
 */
let counts = {};
const listeners = new Set();

export function setNavBadge(key, value) {
    const next = Number(value) || 0;
    if (counts[key] === next) return;
    counts = { ...counts, [key]: next };
    listeners.forEach((listener) => listener());
}

export function clearNavBadges() {
    counts = {};
    listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function useNavBadges() {
    return useSyncExternalStore(subscribe, () => counts);
}

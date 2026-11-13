import { useEffect, useSyncExternalStore } from 'react';

/** 'system' | 'light' | 'dark', persisted; applied as <html data-theme>. */
const STORAGE_KEY = 'ric-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set();

const read = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
        return 'system';
    }
};

let preference = read();

const resolved = () => (preference === 'dark' || (preference === 'system' && media?.matches) ? 'dark' : 'light');

export function applyTheme() {
    document.documentElement.dataset.theme = resolved();
}

export function setThemePreference(next) {
    preference = next;
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        /* private mode */
    }
    applyTheme();
    listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function useTheme() {
    const current = useSyncExternalStore(subscribe, () => preference);
    useEffect(() => {
        if (!media) return undefined;
        const onChange = () => preference === 'system' && applyTheme();
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);
    return { preference: current, setPreference: setThemePreference };
}

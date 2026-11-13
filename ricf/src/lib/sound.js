/**
 * Interface sounds, synthesised with the Web Audio API (no audio files).
 *
 * Restraint is the point: soft sine/triangle tones, short envelopes, low gain.
 * Sounds play only in response to something the person did or needs to know
 * (navigating, a save succeeding, an error), never on hover or idle.
 */

const STORAGE_KEY = 'ric-sound';
const listeners = new Set();

let context = null;
let enabled = readPreference();

function readPreference() {
    try {
        return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
        return true;
    }
}

function audio() {
    if (typeof window === 'undefined' || !window.AudioContext) return null;
    if (!context) context = new window.AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
}

/** One enveloped tone. `at` is seconds from now. */
function tone(ctx, { frequency, to, type = 'sine', at = 0, duration = 0.12, gain = 0.05, attack = 0.006 }) {
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
}

const SOUNDS = {
    // A barely-there tick for moving around the app.
    tap: (ctx) => tone(ctx, { frequency: 1500, to: 1100, duration: 0.045, gain: 0.025, type: 'triangle' }),
    // Switches and toggles.
    toggle: (ctx) => tone(ctx, { frequency: 880, to: 1320, duration: 0.07, gain: 0.03 }),
    // Rising fifth: something worked.
    success: (ctx) => {
        tone(ctx, { frequency: 784, duration: 0.16, gain: 0.045, type: 'triangle' });
        tone(ctx, { frequency: 1175, at: 0.085, duration: 0.24, gain: 0.04, type: 'triangle' });
    },
    // Falling minor third: something needs attention.
    error: (ctx) => {
        tone(ctx, { frequency: 392, duration: 0.14, gain: 0.05, type: 'triangle' });
        tone(ctx, { frequency: 330, at: 0.11, duration: 0.22, gain: 0.05, type: 'triangle' });
    },
    warning: (ctx) => tone(ctx, { frequency: 523, duration: 0.2, gain: 0.04, type: 'triangle' }),
    // A soft bell for neutral notices.
    info: (ctx) => {
        tone(ctx, { frequency: 1046, duration: 0.3, gain: 0.03 });
        tone(ctx, { frequency: 2093, duration: 0.18, gain: 0.008 });
    },
    // A sheet sliding up.
    open: (ctx) => tone(ctx, { frequency: 420, to: 640, duration: 0.11, gain: 0.02 }),
};

export function play(name) {
    if (!enabled) return;
    const ctx = audio();
    const sound = SOUNDS[name === 'default' ? 'info' : name];
    if (!ctx || !sound) return;
    try {
        sound(ctx);
    } catch {
        /* audio is a nicety; never let it break the UI */
    }
}

export function isSoundEnabled() {
    return enabled;
}

export function setSoundEnabled(next) {
    enabled = next;
    try {
        localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
        /* private mode */
    }
    if (next) play('toggle');
    listeners.forEach((listener) => listener(next));
}

export function subscribeSound(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

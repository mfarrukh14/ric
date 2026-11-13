/**
 * Pakistan time for everything people see and type, whatever zone the browser is in.
 *
 * The API sends instants as ISO strings in UTC ("…Z"). Calendar dates ("2026-11-13") and
 * zone-less wall-clock times ("2026-11-13T17:00", what a datetime-local box holds) are
 * Pakistan time. Everything renders through these helpers, so every screen shows the same
 * clock, and a missing or broken value shows as "—" instead of "Invalid Date"/"undefined".
 */
export const TIME_ZONE = 'Asia/Karachi';
const OFFSET = '+05:00';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// "T" or no seconds: typed wall-clock time. "YYYY-MM-DD HH:MM:SS" is the database's UTC format.
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?| \d{2}:\d{2})$/;
const DB_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** Any date-ish value → Date, or null. */
export function toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') return new Date(value);
    const text = String(value).trim();
    let iso = text;
    if (DATE_ONLY.test(text)) iso = `${text}T00:00:00${OFFSET}`;
    else if (WALL_CLOCK.test(text)) iso = `${text.replace(' ', 'T')}${OFFSET}`;
    else if (DB_UTC.test(text)) iso = `${text.replace(' ', 'T')}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

const formatter = (options) => new Intl.DateTimeFormat('en-PK', { timeZone: TIME_ZONE, ...options });
const FORMATS = {
    dateTime: formatter({ day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }),
    date: formatter({ day: 'numeric', month: 'short', year: 'numeric' }),
    time: formatter({ hour: 'numeric', minute: '2-digit', hour12: true }),
    longDate: formatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
};

const format = (name) => (value, fallback = '—') => {
    const date = toDate(value);
    return date ? FORMATS[name].format(date) : fallback;
};

/** 13 Nov 2026, 5:05 pm */
export const formatDateTime = format('dateTime');
/** 13 Nov 2026 */
export const formatDate = format('date');
/** 5:05 pm */
export const formatTime = format('time');
/** Friday, 13 November 2026 */
export const formatLongDate = format('longDate');

/** "17:30" (a time of day, Pakistan) → "5:30 pm". */
export const formatClockTime = (value, fallback = '—') =>
    /^\d{1,2}:\d{2}/.test(String(value ?? '')) ? formatTime(`2000-01-01T${String(value).padStart(5, '0').slice(0, 5)}`, fallback) : fallback;

/** A meeting kept as separate date and "HH:MM" fields (Pakistan time). */
export const formatDateAndTime = (date, time, fallback = '—') => {
    const day = DATE_ONLY.test(String(date ?? '')) ? String(date) : formatInputDate(date);
    if (!day) return fallback;
    return time ? formatDateTime(`${day}T${String(time).slice(0, 5)}`, fallback) : formatDate(day, fallback);
};

export const isPast = (value, now = Date.now()) => {
    const date = toDate(value);
    return date ? date.getTime() <= now : false;
};

/** "2d 4h left", "35m left", or "Closed" once the moment has passed; null if no date. */
export function timeLeft(value, now = Date.now()) {
    const date = toDate(value);
    if (!date) return null;
    const ms = date.getTime() - now;
    if (ms <= 0) return 'Closed';
    const minutes = Math.floor(ms / 60_000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes % 60}m left`;
    return `${Math.max(minutes, 1)}m left`;
}

// ── Form inputs ──────────────────────────────────────────────────────────

const PARTS = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const partsOf = (date) => Object.fromEntries(PARTS.formatToParts(date).map((p) => [p.type, p.value]));

/** Value for <input type="datetime-local"> showing the instant in Pakistan time. */
export function toInputValue(value) {
    const date = toDate(value);
    if (!date) return '';
    const p = partsOf(date);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Value for <input type="date"> (Pakistan calendar day). */
export const formatInputDate = (value) => toInputValue(value).slice(0, 10);

/** A datetime-local value, minutes from now, for `min` attributes and defaults. */
export const inputValueFromNow = (minutes = 0) => toInputValue(Date.now() + minutes * 60_000);

/** Today's date in Pakistan, YYYY-MM-DD. */
export const todayInPakistan = () => formatInputDate(new Date());

/** What a datetime-local box holds (Pakistan time) → ISO instant for the API. */
export function fromInputValue(value) {
    if (!value) return null;
    const text = String(value).trim();
    return `${text.length === 16 ? `${text}:00` : text}${OFFSET}`;
}

/** Separate date + time boxes (Pakistan time) → ISO instant. */
export const fromDateAndTime = (date, time) => (date && time ? fromInputValue(`${date}T${String(time).slice(0, 5)}`) : null);

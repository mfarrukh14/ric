/**
 * Time rules for the whole system: instants are stored in UTC and everything a person
 * sees or types is Pakistan time (Asia/Karachi, UTC+5, no daylight saving).
 *
 * Browsers send a <input type="datetime-local"> value without a zone ("2026-11-13T17:00");
 * that is read as Pakistan time, never as the server's own zone.
 */
const TIME_ZONE = 'Asia/Karachi';
const PKT_OFFSET = '+05:00';

// "YYYY-MM-DDTHH:MM", "YYYY-MM-DDTHH:MM:SS", "YYYY-MM-DD HH:MM": Pakistan wall-clock time.
// The database's own "YYYY-MM-DD HH:MM:SS" (space and seconds) is UTC and is not matched.
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?| \d{2}:\d{2})$/;
const WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

const isWallClock = (value) => typeof value === 'string' && WALL_CLOCK.test(value.trim());
const hasZone = (value) => typeof value === 'string' && WITH_ZONE.test(value.trim());

/** A time from a request or legacy row → Date, or null when missing/invalid. */
function parseInstant(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim();
    const date = new Date(isWallClock(text) ? `${text.replace(' ', 'T')}${PKT_OFFSET}` : text);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Pakistan calendar date of an instant, as YYYY-MM-DD. */
const pktDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(value));

/**
 * A DATE column as YYYY-MM-DD. SQLite returns the text; SQL Server returns a Date at UTC
 * midnight, which must not be shifted into another day.
 */
const calendarDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

/** A TIME column as HH:MM (SQL Server returns a Date on 1970-01-01 UTC). */
const clockTime = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(11, 16);
    return String(value).slice(0, 5);
};

const formatter = (options) => new Intl.DateTimeFormat('en-PK', { timeZone: TIME_ZONE, ...options });
const DATE_TIME = formatter({ day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const DATE_ONLY = formatter({ day: 'numeric', month: 'short', year: 'numeric' });
const LONG_DATE_TIME = formatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const LONG_DATE = formatter({ day: 'numeric', month: 'long', year: 'numeric' });
const TIME_ONLY = formatter({ hour: 'numeric', minute: '2-digit', hour12: true });

const format = (fmt) => (value, fallback = '—') => {
    const date = parseInstant(value);
    return date ? fmt.format(date) : fallback;
};

module.exports = {
    TIME_ZONE,
    isWallClock,
    hasZone,
    parseInstant,
    pktDate,
    calendarDate,
    clockTime,
    formatDateTime: format(DATE_TIME),
    formatDate: format(DATE_ONLY),
    formatLongDateTime: format(LONG_DATE_TIME),
    formatLongDate: format(LONG_DATE),
    /** "17:30" (a Pakistan time of day) → "5:30 pm"; other text is returned as is. */
    formatClock: (value) => (/^\d{1,2}:\d{2}/.test(String(value ?? '')) ? TIME_ONLY.format(parseInstant(`2000-01-01T${String(value).padStart(5, '0').slice(0, 5)}`)) : String(value ?? '')),
};

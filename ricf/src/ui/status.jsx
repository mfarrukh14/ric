import { Badge } from './index';
import { formatDate, formatDateTime } from '../lib/time';

/** Turns snake_case status codes into readable labels: "pending_hod_approval" → "Pending HOD approval". */
export function humanize(value) {
    if (!value) return 'Unknown';
    const text = String(value).replace(/[_-]+/g, ' ').trim().toLowerCase();
    return (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\b(hod|ms|po|so|id)\b/gi, (m) => m.toUpperCase());
}

const LABELS = {
    pending: 'Pending store review',
    pending_hod_approval: 'Awaiting HOD approval',
    pending_store_hod_approval: 'Awaiting store HOD',
    hod_rejected: 'Rejected by HOD',
    available: 'Stock allotted',
    not_available: 'Not available',
    partial: 'Partially available',
};

const TONES = [
    [/reject|not_available|cancel|fail|expired|disqualif/, 'danger'],
    [/approved|available|complete|awarded|allotted|resolved|accepted|published|active|fulfilled|delivered|opened/, 'success'],
    [/pending|await|review|draft|scheduled|partial|progress|vetting|submitted/, 'warning'],
];

export function statusTone(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'not_available') return 'danger';
    return TONES.find(([pattern]) => pattern.test(s))?.[1] ?? 'neutral';
}

export function StatusBadge({ status, label }) {
    return <Badge tone={statusTone(status)}>{label || LABELS[status] || humanize(status)}</Badge>;
}

const URGENCY_TONE = { urgent: 'danger', high: 'warning', critical: 'danger' };

export function UrgencyBadge({ urgency }) {
    if (!urgency) return null;
    return <Badge tone={URGENCY_TONE[urgency] || 'neutral'}>{humanize(urgency)}</Badge>;
}

/** "Rs 12,400" with grouping; blanks stay blank. */
export function money(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}` : '—';
}

/** Pakistan-time date (or date and time); missing values show as "—". */
export const date = (value, withTime = false) => (withTime ? formatDateTime(value) : formatDate(value));

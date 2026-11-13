import { toast } from 'react-toastify';

/**
 * Drop-in replacement for window.alert(): shows a toast whose tone is read from
 * the message, so "Failed to…" is an error, "…saved successfully" a success and
 * "Please select…" a gentle warning.
 */
const FAILURE = /\b(fail(ed|ure)?|error|invalid|unable|cannot|can't|couldn't|denied|not allowed|expired|exceed(s|ed)?)\b/i;
const NUDGE = /\b(please|must|required|select|enter|provide|at least|no .* (selected|found))\b/i;
const SUCCESS = /\b(success(fully)?|saved|created|updated|sent|approved|uploaded|submitted|deleted|completed|scheduled|published|merged|done)\b/i;

export function notify(message) {
    const text = String(message ?? '').trim();
    if (!text) return undefined;
    if (FAILURE.test(text)) return toast.error(text);
    if (SUCCESS.test(text)) return toast.success(text);
    if (NUDGE.test(text)) return toast.warning(text);
    return toast.info(text);
}

export { toast };

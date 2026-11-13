import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WarningCircle, Question } from '@phosphor-icons/react';
import { play } from './sound';

/**
 * Promise-based replacement for window.confirm():
 *   if (!(await confirmDialog('Delete this user?'))) return;
 * Destructive wording (delete, reject, cancel, irreversible…) gets a danger button.
 */

let enqueue = null;

const DESTRUCTIVE = /\b(delete|remove|reject|cancel|revoke|irreversible|discard|permanently|disable)\b/i;

export function confirmDialog(message, options = {}) {
    return new Promise((resolve) => {
        if (!enqueue) {
            resolve(window.confirm(message));
            return;
        }
        enqueue({ message: String(message), ...options, resolve });
    });
}

export function ConfirmHost() {
    const [request, setRequest] = useState(null);
    const confirmRef = useRef(null);
    const requestRef = useRef(null);
    requestRef.current = request;

    const close = useCallback((answer) => {
        requestRef.current?.resolve(answer);
        setRequest(null);
    }, []);

    useEffect(() => {
        enqueue = (next) => {
            // A second confirm while one is open resolves the first as "no".
            requestRef.current?.resolve(false);
            play('open');
            setRequest(next);
        };
        return () => {
            enqueue = null;
        };
    }, []);

    useEffect(() => {
        if (!request) return undefined;
        confirmRef.current?.focus();
        const onKey = (event) => event.key === 'Escape' && close(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [request, close]);

    if (!request) return null;

    const danger = request.tone ? request.tone === 'danger' : DESTRUCTIVE.test(request.message);
    const [title, ...rest] = request.title ? [request.title, request.message] : splitMessage(request.message);

    return createPortal(
        <div className="ui-scrim" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
            <div className="ui-dialog ui-dialog--confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
                <div className="ui-confirm__icon" data-tone={danger ? 'danger' : 'brand'}>
                    {danger ? <WarningCircle size={22} weight="fill" /> : <Question size={22} weight="fill" />}
                </div>
                <h2 id="confirm-title" className="ui-confirm__title">{title}</h2>
                {rest.length > 0 && <p className="ui-confirm__body">{rest.join(' ')}</p>}
                <div className="ui-confirm__actions">
                    <button type="button" className="ui-btn ui-btn--secondary" onClick={() => close(false)}>
                        {request.cancelLabel || 'Cancel'}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        className={`ui-btn ${danger ? 'ui-btn--danger-solid' : 'ui-btn--primary'}`}
                        onClick={() => close(true)}
                    >
                        {request.confirmLabel || (danger ? 'Yes, continue' : 'Confirm')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

/** "Are you sure? This cannot be undone." → title + body, split at the first sentence. */
function splitMessage(message) {
    const match = message.match(/^(.+?[?.!])\s+(.+)$/s);
    return match ? [match[1], match[2]] : [message];
}

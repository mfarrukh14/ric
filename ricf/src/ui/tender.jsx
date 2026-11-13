import { useEffect, useState } from 'react';
import { Badge, cx } from './index';
import { timeLeft } from '../lib/time';
import { TENDER_PHASES, tenderStatus, tenderStatusLabel } from '../lib/tender';

export function TenderStatus({ status }) {
    const { label, tone } = tenderStatus(status);
    return <Badge tone={tone}>{label}</Badge>;
}

/**
 * Phases from approval to award; rejected tenders stop where they were turned down.
 * `from` starts the strip at a later phase (suppliers only see the tender once it is published).
 */
export function TenderProgress({ status, from = 'approval', className }) {
    const { phase, tone } = tenderStatus(status);
    const phases = TENDER_PHASES.slice(Math.max(0, TENDER_PHASES.findIndex((p) => p.key === from)));
    const current = phases.findIndex((p) => p.key === phase);
    const done = status === 'awarded';
    return (
        <ol className={cx('tender-progress', className)} style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }} aria-label={`Tender progress: ${tenderStatusLabel(status)}`}>
            {phases.map((p, i) => {
                const state = done || i < current ? 'done' : i === current ? (tone === 'danger' ? 'stopped' : 'current') : 'todo';
                return (
                    <li key={p.key} className="tender-progress__step" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                        <span className="tender-progress__bar" />
                        <span className="tender-progress__label">{p.label}</span>
                    </li>
                );
            })}
        </ol>
    );
}

/** "2d 4h left" that keeps counting; "Closed" once the deadline passes. */
export function Countdown({ until, onElapsed }) {
    const [now, setNow] = useState(() => Date.now());
    const label = timeLeft(until, now);
    useEffect(() => {
        if (!label || label === 'Closed') return undefined;
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, [label]);
    useEffect(() => {
        if (label === 'Closed') onElapsed?.();
    }, [label, onElapsed]);
    if (!label) return null;
    const soon = label !== 'Closed' && !label.includes('d ');
    return <span className="countdown" data-tone={label === 'Closed' ? 'closed' : soon ? 'soon' : undefined}>{label}</span>;
}

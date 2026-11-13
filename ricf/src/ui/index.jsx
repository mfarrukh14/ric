/**
 * The small set of building blocks every screen is made of. Styling lives in
 * styles/ui.css; components here only decide structure and semantics.
 */
import { Children, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CircleNotch, X } from '@phosphor-icons/react';
import { play } from '../lib/sound';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Spinner({ size = 18, label = 'Loading', className }) {
    return (
        <span className={cx('ui-spinner', className)} role="status" aria-label={label}>
            <CircleNotch size={size} weight="bold" />
        </span>
    );
}

export function Button({ variant = 'secondary', size, icon, loading, children, className, type = 'button', ...props }) {
    return (
        <button
            type={type}
            {...props}
            className={cx('ui-btn', `ui-btn--${variant}`, size === 'sm' && 'ui-btn--sm', size === 'lg' && 'ui-btn--lg', !children && 'ui-btn--icon', className)}
            disabled={loading || props.disabled}
            aria-busy={loading || undefined}
        >
            {loading ? <Spinner size={16} label="Working" /> : icon}
            {children}
        </button>
    );
}

export function Badge({ tone = 'neutral', icon, children, className }) {
    return (
        <span className={cx('ui-badge', className)} data-tone={tone}>
            {icon}
            {children}
        </span>
    );
}

export function PageHeader({ title, actions }) {
    return (
        <header className="ui-page-header">
            <h1 className="ui-page-header__title">{title}</h1>
            {actions && <div className="ui-actions">{actions}</div>}
        </header>
    );
}

export function Panel({ title, description, actions, children, flush, className }) {
    return (
        <section className={cx('ui-panel', className)}>
            {(title || actions) && (
                <header className="ui-panel__header">
                    <div>
                        {title && <h2 className="ui-panel__title">{title}</h2>}
                        {description && <p className="ui-panel__description">{description}</p>}
                    </div>
                    {actions && <div className="ui-actions">{actions}</div>}
                </header>
            )}
            {Children.count(children) > 0 && <div className={flush ? undefined : 'ui-panel__body'}>{children}</div>}
        </section>
    );
}

export function EmptyState({ icon, title, children, actions }) {
    return (
        <div className="ui-empty">
            {icon && <div className="ui-empty__icon">{icon}</div>}
            <h3 className="ui-empty__title">{title}</h3>
            {children && <div className="ui-empty__body">{children}</div>}
            {actions && <div className="ui-actions">{actions}</div>}
        </div>
    );
}

export function Notice({ tone = 'info', icon, children, actions }) {
    return (
        <div className="ui-notice" data-tone={tone} role={tone === 'danger' ? 'alert' : undefined}>
            {icon && <span className="ui-notice__icon">{icon}</span>}
            <div className="ui-notice__body">{children}</div>
            {actions && <div className="ui-actions">{actions}</div>}
        </div>
    );
}

export function Stat({ label, value, icon, tone = 'neutral', hint }) {
    return (
        <div className="ui-stat" data-tone={tone}>
            <div className="ui-stat__top">
                <span className="ui-stat__label">{label}</span>
                {icon && <span className="ui-stat__icon">{icon}</span>}
            </div>
            <span className="ui-stat__value numeric">{value}</span>
            {hint && <span className="ui-stat__hint">{hint}</span>}
        </div>
    );
}

export function LoadingBlock({ label = 'Loading…' }) {
    return (
        <div className="ui-loading">
            <Spinner size={20} />
            <span>{label}</span>
        </div>
    );
}

/** iOS-style segmented control. options: [{ value, label, icon }] */
export function Segmented({ value, onChange, options, label, size, iconOnly }) {
    return (
        <div className={cx('ui-segmented', size === 'sm' && 'ui-segmented--sm')} role="radiogroup" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={option.value === value}
                    aria-label={iconOnly ? option.label : undefined}
                    title={iconOnly ? option.label : undefined}
                    className="ui-segmented__option"
                    onClick={() => onChange(option.value)}
                >
                    {option.icon}
                    {!iconOnly && <span>{option.label}</span>}
                </button>
            ))}
        </div>
    );
}

/** Accessible modal sheet: focus moves in, Escape and the scrim close it. */
export function Modal({ show, onClose, title, description, children, footer, size = 'md' }) {
    const titleId = useId();
    const panelRef = useRef(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!show) return undefined;
        play('open');
        const previous = document.activeElement;
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        panelRef.current?.querySelector('input, select, textarea, button:not([data-close])')?.focus();
        const onKey = (event) => event.key === 'Escape' && onCloseRef.current?.();
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = overflow;
            window.removeEventListener('keydown', onKey);
            previous?.focus?.();
        };
    }, [show]);

    if (!show) return null;

    return createPortal(
        <div className="ui-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
            <div ref={panelRef} className={cx('ui-dialog', `ui-dialog--${size}`)} role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <header className="ui-dialog__header">
                    <div>
                        <h2 id={titleId} className="ui-dialog__title">{title}</h2>
                        {description && <p className="ui-dialog__description">{description}</p>}
                    </div>
                    <button type="button" data-close className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </header>
                <div className="ui-dialog__body">{children}</div>
                {footer && <footer className="ui-dialog__footer">{footer}</footer>}
            </div>
        </div>,
        document.body
    );
}

export { cx };

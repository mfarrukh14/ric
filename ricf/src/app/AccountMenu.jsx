import { useEffect, useRef, useState } from 'react';
import { CaretUpDown, ShieldCheck, SignOut } from '@phosphor-icons/react';
import { displayName, initials, signOut } from '../lib/session';
import { roleLabel } from './navigation';
import { play } from '../lib/sound';
import TwoFactorSetup from '../components/auth/TwoFactorSetup/TwoFactorSetup';

/** The person's card at the foot of the sidebar, opening a small menu. */
export function AccountMenu({ user }) {
    const [open, setOpen] = useState(false);
    const [securityOpen, setSecurityOpen] = useState(false);
    const rootRef = useRef(null);
    const name = displayName(user);

    useEffect(() => {
        if (!open) return undefined;
        const onPointer = (event) => !rootRef.current?.contains(event.target) && setOpen(false);
        const onKey = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const staff = user?.role !== 'supplier';

    return (
        <div ref={rootRef} className="account">
            <button type="button" className="account__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                <span className="account__avatar" aria-hidden="true">{initials(name)}</span>
                <span className="account__text">
                    <span className="account__name">{name}</span>
                    <span className="account__role">{roleLabel(user)}</span>
                </span>
                <CaretUpDown size={15} className="account__caret" />
            </button>

            {open && (
                <div className="account__menu" role="menu">
                    {staff && (
                        <button
                            type="button"
                            role="menuitem"
                            className="account__item"
                            onClick={() => {
                                setOpen(false);
                                setSecurityOpen(true);
                            }}
                        >
                            <ShieldCheck size={17} />
                            Two-factor authentication
                        </button>
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        className="account__item account__item--danger"
                        onClick={() => {
                            play('tap');
                            signOut();
                        }}
                    >
                        <SignOut size={17} />
                        Sign out
                    </button>
                </div>
            )}

            {securityOpen && <TwoFactorSetup onClose={() => setSecurityOpen(false)} />}
        </div>
    );
}

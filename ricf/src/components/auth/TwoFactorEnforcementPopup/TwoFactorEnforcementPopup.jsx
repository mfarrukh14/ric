import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LockKey, SignOut } from '@phosphor-icons/react';
import { signOut } from '../../../lib/session';
import { Button } from '../../../ui';
import TwoFactorSetup from '../TwoFactorSetup/TwoFactorSetup';

const BENEFITS = [
    'Protects tenders and supplier data from stolen passwords',
    'Works with Google Authenticator, Microsoft Authenticator or Authy',
    'Takes about two minutes to set up',
];

/** Blocking sheet shown while 2FA is enforced and the account has not enabled it. */
export default function TwoFactorEnforcementPopup({ onCompliance }) {
    const [setupOpen, setSetupOpen] = useState(false);

    if (setupOpen) {
        return (
            <TwoFactorSetup
                onClose={() => {
                    setSetupOpen(false);
                    onCompliance?.();
                }}
            />
        );
    }

    return createPortal(
        <div className="ui-scrim">
            <div className="ui-dialog ui-dialog--confirm" role="alertdialog" aria-modal="true" aria-labelledby="enforce-title">
                <div className="ui-confirm__icon">
                    <LockKey size={22} weight="fill" />
                </div>
                <h2 id="enforce-title" className="ui-confirm__title">Turn on two-factor authentication</h2>
                <p className="ui-confirm__body">Two-factor authentication is required for every account.</p>
                <ul className="enforce-list">
                    {BENEFITS.map((text) => (
                        <li key={text}>
                            <Check size={16} weight="bold" />
                            {text}
                        </li>
                    ))}
                </ul>
                <div className="ui-confirm__actions">
                    <Button variant="secondary" icon={<SignOut size={16} />} onClick={signOut}>
                        Sign out
                    </Button>
                    <Button variant="primary" onClick={() => setSetupOpen(true)}>
                        Set up now
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

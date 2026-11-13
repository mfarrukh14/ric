import { useCallback, useEffect, useState } from 'react';
import { apiUrl, authHeaders } from '../../config/api';
import { LoadingBlock } from '../../ui';
import TwoFactorEnforcementPopup from './TwoFactorEnforcementPopup/TwoFactorEnforcementPopup';

/**
 * When the administrator enforces 2FA, staff without it see the app behind a
 * setup sheet until they comply. Checked once when the workspace mounts.
 * (Enforcement is a UI policy; it fails open when the check cannot run.)
 */
export default function TwoFactorEnforcementWrapper({ children }) {
    const [status, setStatus] = useState(null);
    const [state, setState] = useState('loading'); // loading | ready | error

    const check = useCallback(async () => {
        setState('loading');
        try {
            const response = await fetch(`${apiUrl}/2fa-enforcement/compliance`, { headers: authHeaders() });
            if (response.status === 404) {
                setStatus({ enforced: false, compliant: true });
            } else if (response.ok) {
                setStatus(await response.json());
            } else {
                throw new Error('compliance check failed');
            }
            setState('ready');
        } catch {
            setState('error');
        }
    }, []);

    useEffect(() => {
        check();
    }, [check]);

    if (state === 'loading' && !status) return <LoadingBlock label="Checking security requirements…" />;

    // If the check itself fails (server unreachable), don't lock people out of the
    // whole workspace; the pages show their own connection errors.
    return (
        <>
            {children}
            {status?.enforced && !status?.compliant && <TwoFactorEnforcementPopup onCompliance={check} />}
        </>
    );
}

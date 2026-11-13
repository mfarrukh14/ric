import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeSlash } from '@phosphor-icons/react';
import { apiUrl, complete2FALogin, completeSupplier2FALogin, FINANCE_API_URL, FINANCE_FRONTEND_URL, login } from '../../config/api';
import { beginSupplierRegistration, pendingRegistration, signInStaff, signInSupplier, signOut } from '../../lib/session';
import { homePathFor } from '../../app/navigation';
import { play } from '../../lib/sound';
import { toast } from '../../lib/notify';
import { Button, Segmented } from '../../ui';
import SupplierRegistrationProcess from '../../components/auth/SupplierRegistrationProcess';
import './login.css';

const postJson = async (path, body) => {
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'Request failed.');
    return data;
};

/** Signs a Finance-only account in to the Finance app and sends the browser there. */
async function handOffToFinance({ username, password }) {
    const response = await fetch(`${FINANCE_API_URL}/auth/cross-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, fullName: username, department: 'eProcurement' }),
    });
    if (!response.ok) throw new Error('Could not sign in to the Finance module.');
    const finance = await response.json();
    // localStorage is per-origin, so the session travels in the URL.
    const user = btoa(unescape(encodeURIComponent(JSON.stringify(finance.user))));
    window.location.href = `${FINANCE_FRONTEND_URL}/login?token=${encodeURIComponent(finance.token)}&user=${encodeURIComponent(user)}`;
}

function PasswordInput({ id, value, onChange, autoComplete = 'current-password' }) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="login-password">
            <input
                id={id}
                className="ui-input"
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                autoComplete={autoComplete}
                required
            />
            <button type="button" className="login-password__toggle" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
                {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
        </div>
    );
}

function FormError({ message }) {
    return <p className="login-error" role="alert">{message}</p>;
}

export default function LoginPage() {
    const navigate = useNavigate();
    const [audience, setAudience] = useState('staff'); // staff | supplier
    const [supplierMode, setSupplierMode] = useState('signin'); // signin | register
    const [form, setForm] = useState({ username: '', password: '', email: '', confirm: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [challenge, setChallenge] = useState(null); // { token, audience } while a 2FA code is pending
    const [code, setCode] = useState('');
    const [useBackupCode, setUseBackupCode] = useState(false);
    // { supplierId, isResubmission } while the registration wizard is open; reopened after a reload.
    const [registration, setRegistration] = useState(pendingRegistration);

    const field = (name) => ({ value: form[name], onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })) });

    const run = (task) => async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            await task();
        } catch (err) {
            setError(err?.error || err?.message || 'Sign in failed.');
            play('error');
        } finally {
            setLoading(false);
        }
    };

    const finishStaff = (token, user) => {
        signInStaff(token, user);
        play('success');
        navigate(homePathFor(user), { replace: true });
    };

    const finishSupplier = (token, supplier) => {
        signInSupplier(token, supplier);
        play('success');
        navigate('/supplier/overview', { replace: true });
    };

    const askForCode = (token, who) => {
        setChallenge({ token, audience: who });
        play('open');
    };

    const signInAsStaff = run(async () => {
        const username = form.username.trim();
        const result = await login(username, form.password);
        if (result.isFinanceUser) return handOffToFinance({ username, password: form.password });
        if (result.requires2FA) return askForCode(result.challenge, 'staff');
        return finishStaff(result.token, result.user);
    });

    const signInAsSupplier = run(async () => {
        const data = await postJson('/suppliers/login', { usernameOrEmail: form.username.trim(), password: form.password });
        if (data.requiresRegistration || data.requiresEmailVerification) {
            beginSupplierRegistration(data.token, data.supplier, Boolean(data.isResubmission));
            setRegistration({ supplierId: data.supplier.id, isResubmission: Boolean(data.isResubmission) });
            return;
        }
        if (data.requires2FA) return askForCode(data.challenge, 'supplier');
        finishSupplier(data.token, data.supplier);
    });

    const verifySecondFactor = run(async () => {
        if (challenge.audience === 'supplier') {
            const result = await completeSupplier2FALogin(challenge.token, code.trim(), useBackupCode);
            return finishSupplier(result.token, result.supplier);
        }
        const result = await complete2FALogin(challenge.token, code.trim(), useBackupCode);
        return finishStaff(result.token, result.user);
    });

    const registerSupplier = run(async () => {
        if (form.password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (form.password !== form.confirm) throw new Error('Passwords do not match.');
        const data = await postJson('/suppliers/register', { username: form.username.trim(), businessEmail: form.email.trim(), password: form.password });
        beginSupplierRegistration(data.token, data.supplier);
        setRegistration({ supplierId: data.supplier.id, isResubmission: false });
    });

    const leaveRegistration = (message) => {
        signOut();
        setRegistration(null);
        setAudience('supplier');
        setSupplierMode('signin');
        if (message) toast.info(message);
    };

    if (registration) {
        return (
            <div className="login-registration">
                <SupplierRegistrationProcess
                    supplierId={registration.supplierId}
                    isResubmission={registration.isResubmission}
                    onExit={leaveRegistration}
                    onComplete={() => {
                        leaveRegistration();
                        toast.success('Application submitted. You will get an email once it is reviewed.');
                    }}
                />
            </div>
        );
    }

    const switchAudience = (next) => {
        setAudience(next);
        setError('');
        play('tap');
    };

    const switchSupplierMode = (next) => {
        setSupplierMode(next);
        setError('');
    };

    const codeLength = useBackupCode ? 8 : 6;

    return (
        <main className="login">
            <div className="login-card">
                <header className="login-card__brand">
                    <span className="login-logo"><img src="/images/logo.jpg" alt="Rawalpindi Institute of Cardiology" width="64" height="64" /></span>
                    <h1 className="login-card__product">RIC e-Tender</h1>
                    <p className="login-card__org">Rawalpindi Institute of Cardiology</p>
                </header>

                {challenge ? (
                    <form className="login-form" onSubmit={verifySecondFactor} key="2fa">
                        <label className="ui-field">
                            <span className="ui-label">{useBackupCode ? 'Backup code' : 'Authenticator code'}</span>
                            <input
                                className="ui-input login-code"
                                value={code}
                                onChange={(e) => setCode(useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode={useBackupCode ? 'text' : 'numeric'}
                                autoComplete="one-time-code"
                                maxLength={codeLength}
                                autoFocus
                                required
                            />
                        </label>
                        {error && <FormError message={error} />}
                        <Button type="submit" variant="primary" loading={loading} disabled={code.length < codeLength}>
                            Verify
                        </Button>
                        <div className="login-row">
                            <button type="button" className="login-link" onClick={() => { setChallenge(null); setCode(''); setError(''); }}>
                                <ArrowLeft size={14} /> Back
                            </button>
                            <button type="button" className="login-link" onClick={() => { setUseBackupCode((v) => !v); setCode(''); }}>
                                {useBackupCode ? 'Use authenticator code' : 'Use a backup code'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <>
                        <Segmented
                            label="Account type"
                            value={audience}
                            onChange={switchAudience}
                            options={[
                                { value: 'staff', label: 'Staff' },
                                { value: 'supplier', label: 'Supplier' },
                            ]}
                        />

                        {audience === 'staff' && (
                            <form className="login-form" onSubmit={signInAsStaff} key="staff">
                                <label className="ui-field">
                                    <span className="ui-label">Username</span>
                                    <input className="ui-input" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus {...field('username')} />
                                </label>
                                <label className="ui-field">
                                    <span className="ui-label">Password</span>
                                    <PasswordInput {...field('password')} />
                                </label>
                                {error && <FormError message={error} />}
                                <Button type="submit" variant="primary" loading={loading}>Sign in</Button>
                            </form>
                        )}

                        {audience === 'supplier' && supplierMode === 'signin' && (
                            <form className="login-form" onSubmit={signInAsSupplier} key="supplier">
                                <label className="ui-field">
                                    <span className="ui-label">Username or email</span>
                                    <input className="ui-input" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus {...field('username')} />
                                </label>
                                <label className="ui-field">
                                    <span className="ui-label">Password</span>
                                    <PasswordInput {...field('password')} />
                                </label>
                                {error && <FormError message={error} />}
                                <Button type="submit" variant="primary" loading={loading}>Sign in</Button>
                                <button type="button" className="login-link login-switch" onClick={() => switchSupplierMode('register')}>
                                    Register a new supplier
                                </button>
                            </form>
                        )}

                        {audience === 'supplier' && supplierMode === 'register' && (
                            <form className="login-form" onSubmit={registerSupplier} key="register">
                                <label className="ui-field">
                                    <span className="ui-label">Username</span>
                                    <input className="ui-input" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus {...field('username')} />
                                </label>
                                <label className="ui-field">
                                    <span className="ui-label">Business email</span>
                                    <input className="ui-input" type="email" autoComplete="email" required {...field('email')} />
                                </label>
                                <label className="ui-field">
                                    <span className="ui-label">Password</span>
                                    <PasswordInput autoComplete="new-password" {...field('password')} />
                                </label>
                                <label className="ui-field">
                                    <span className="ui-label">Confirm password</span>
                                    <PasswordInput autoComplete="new-password" {...field('confirm')} />
                                </label>
                                {error && <FormError message={error} />}
                                <Button type="submit" variant="primary" loading={loading}>Create account</Button>
                                <button type="button" className="login-link login-switch" onClick={() => switchSupplierMode('signin')}>
                                    I already have an account
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}

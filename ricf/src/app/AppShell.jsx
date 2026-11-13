import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { List } from '@phosphor-icons/react';
import { Sidebar } from './Sidebar';
import { BrandMark } from './BrandMark';
import { LoadingBlock } from '../ui';
import TwoFactorEnforcementWrapper from '../components/auth/TwoFactorEnforcementWrapper';

/** Sidebar + content frame for everyone who is signed in. */
export function AppShell({ user }) {
    const [navOpen, setNavOpen] = useState(false);
    const { pathname } = useLocation();

    // Each new page starts at the top, like turning a page.
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [pathname]);

    // Keyed by path so every navigation replays the page's entrance.
    const page = (
        <div key={pathname} className="shell-page">
            <Suspense fallback={<LoadingBlock label="Loading page…" />}>
                <Outlet />
            </Suspense>
        </div>
    );

    return (
        <div className="shell">
            <a href="#main" className="shell-skip">Skip to content</a>

            <header className="shell-topbar">
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-expanded={navOpen}>
                    <List size={22} />
                </button>
                <BrandMark size={28} />
                <span className="shell-topbar__title">RIC e-Tender</span>
            </header>

            {navOpen && <div className="shell-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
            <Sidebar user={user} open={navOpen} onNavigate={() => setNavOpen(false)} />

            <main id="main" className="shell-main">
                {/* Staff compliance is checked once per session, not on every page. */}
                {user.role === 'supplier' ? page : <TwoFactorEnforcementWrapper>{page}</TwoFactorEnforcementWrapper>}
            </main>
        </div>
    );
}

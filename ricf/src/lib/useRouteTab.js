import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

/**
 * A dashboard's "active tab" kept in the URL (/purchase/tender-opening) instead
 * of component state, so the sidebar can drive it, links are shareable and the
 * back button works. Drop-in for `useState(defaultTab)`.
 *
 * @param {Record<string,string>} slugToTab  URL slug → internal tab id
 * @param {string} fallbackTab               tab used when the slug is missing/unknown
 */
export function useRouteTab(slugToTab, fallbackTab) {
    const { tab: slug } = useParams();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const tabToSlug = useMemo(() => Object.fromEntries(Object.entries(slugToTab).map(([s, t]) => [t, s])), [slugToTab]);
    const active = slugToTab[slug] ?? fallbackTab;

    const setActive = useCallback(
        (tab) => {
            const base = `/${pathname.split('/')[1]}`;
            navigate(`${base}/${tabToSlug[tab] ?? tab}`);
        },
        [navigate, pathname, tabToSlug]
    );

    return [active, setActive];
}

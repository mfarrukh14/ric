import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Desktop, Moon, Plus, SpeakerHigh, SpeakerSlash, Sun } from '@phosphor-icons/react';
import { navigationFor, capabilitiesOf } from './navigation';
import { AccountMenu } from './AccountMenu';
import { BrandMark } from './BrandMark';
import { useNavBadges } from '../lib/navBadges';
import { useTheme } from '../lib/theme';
import { isSoundEnabled, play, setSoundEnabled, subscribeSound } from '../lib/sound';
import { Segmented } from '../ui';

function useSoundEnabled() {
    return useSyncExternalStore(subscribeSound, isSoundEnabled);
}

export function Sidebar({ user, open, onNavigate }) {
    const groups = navigationFor(user);
    const can = capabilitiesOf(user);
    const badges = useNavBadges();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { preference, setPreference } = useTheme();
    const soundOn = useSoundEnabled();

    // One highlight that glides to whichever item is current.
    const navRef = useRef(null);
    const [indicator, setIndicator] = useState(null);
    useLayoutEffect(() => {
        const measure = () => {
            const active = navRef.current?.querySelector('a[aria-current="page"]');
            setIndicator(active ? { top: active.offsetTop, height: active.offsetHeight } : null);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [pathname, groups.length]);

    const go = () => {
        play('tap');
        onNavigate();
    };

    return (
        <aside className="shell-sidebar" data-open={open}>
            <div className="shell-brand">
                <BrandMark size={38} />
                <div className="shell-brand__text">
                    <span className="shell-brand__name">RIC e-Tender</span>
                    <span className="shell-brand__org">Rawalpindi Institute of Cardiology</span>
                </div>
            </div>

            {can.canCreateDemand && (
                <button
                    type="button"
                    className="ui-btn ui-btn--primary shell-compose"
                    onClick={() => {
                        go();
                        navigate('/create-demand');
                    }}
                >
                    <Plus size={16} weight="bold" />
                    New demand
                </button>
            )}

            <nav ref={navRef} className="shell-nav" aria-label="Main">
                {indicator && <span className="shell-nav__indicator" style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }} aria-hidden="true" />}
                {groups.map((group) => (
                    <div key={group.label} className="shell-nav__group">
                        <p className="shell-nav__label">{group.label}</p>
                        {group.items.map(({ to, label, icon: Icon, badge }) => {
                            const count = badge ? badges[badge] : 0;
                            return (
                                <NavLink key={to} to={to} className="shell-nav__item" onClick={go}>
                                    {({ isActive }) => (
                                        <>
                                            <Icon size={19} weight={isActive ? 'fill' : 'regular'} className="shell-nav__icon" />
                                            <span className="shell-nav__text">{label}</span>
                                            {count > 0 && (
                                                <span className="shell-nav__count numeric" title={`${count} waiting`}>
                                                    {count > 99 ? '99+' : count}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="shell-footer">
                <AccountMenu user={user} />
                <div className="shell-footer__controls">
                    <Segmented
                        label="Colour theme"
                        size="sm"
                        iconOnly
                        value={preference}
                        onChange={(next) => {
                            setPreference(next);
                            play('toggle');
                        }}
                        options={[
                            { value: 'system', label: 'Match system', icon: <Desktop size={15} /> },
                            { value: 'light', label: 'Light', icon: <Sun size={15} /> },
                            { value: 'dark', label: 'Dark', icon: <Moon size={15} /> },
                        ]}
                    />
                    <button
                        type="button"
                        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                        onClick={() => setSoundEnabled(!soundOn)}
                        aria-pressed={soundOn}
                        aria-label={soundOn ? 'Mute interface sounds' : 'Turn on interface sounds'}
                        title={soundOn ? 'Sounds on' : 'Sounds off'}
                    >
                        {soundOn ? <SpeakerHigh size={17} /> : <SpeakerSlash size={17} />}
                    </button>
                </div>
            </div>
        </aside>
    );
}

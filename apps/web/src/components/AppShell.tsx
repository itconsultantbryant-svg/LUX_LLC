import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { webConfig } from '../config';
import { Brand } from './Brand';
import { InstallApp } from './InstallApp';
import { useDemo } from '../features/demo';
import { useAuth } from '../features/auth-context';
import { NetworkNotice } from './Feedback';
import { EnvironmentBanner } from './EnvironmentBanner';
import { Icon, type IconName } from './icons/Icon';
import './AppShell.css';

const links: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/pay', label: 'Pay for Care', icon: 'credit-card' },
  { to: '/save', label: 'Save', icon: 'heart' },
  { to: '/support', label: 'Get Support', icon: 'user' },
  { to: '/history', label: 'History', icon: 'activity' },
];

export function AppShell() {
  const location = useLocation();
  const { state, dispatch } = useDemo();
  const { signedIn, profile, signOut } = useAuth();
  const secondary = useRef<HTMLDetailsElement>(null);
  const main = useRef<HTMLElement>(null);
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    if (secondary.current) secondary.current.open = false;
    const title = links.find((link) => link.to === location.pathname)?.label ?? 'HealthWallet';
    document.title = `${title} · HealthWallet Liberia | LUX AI`;
    if (lastPath.current !== location.pathname) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
      lastPath.current = location.pathname;
    }
  }, [location.pathname]);
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <EnvironmentBanner />
      <header className="shell__header">
        <NavLink to="/" className="shell__brand" aria-label="LUX AI HealthWallet Liberia home">
          <Brand />
        </NavLink>
        <nav className="shell__nav" aria-label="Primary">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'}>
              <Icon name={link.icon} size={19} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <details
          className="secondary-menu"
          ref={secondary}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}
        >
          <summary aria-label="Profile and more options">
            More <span aria-hidden="true">⌄</span>
          </summary>
          <nav aria-label="Secondary">
            <NavLink to="/account">
              <Icon name="user" size={18} />{' '}
              {signedIn ? `Signed in · ${profile?.phone ?? 'Account'}` : 'Profile & sign in'}
            </NavLink>
            {signedIn && (
              <button
                type="button"
                onClick={() => {
                  void signOut();
                  if (secondary.current) secondary.current.open = false;
                }}
              >
                Sign out
              </button>
            )}
            <NavLink to="/account/security">
              <Icon name="shield" size={18} /> Security & organization access
            </NavLink>
            <NavLink to="/assistant">
              <Icon name="message-circle" size={18} /> LUX assistant
            </NavLink>
            <NavLink to="/institutional">
              <Icon name="building" size={18} /> Institutional access
            </NavLink>
            <NavLink to="/institutional/reviews">
              <Icon name="check-circle" size={18} /> Review queue
            </NavLink>
            <NavLink to="/institutional/metrics">
              <Icon name="activity" size={18} /> Journey metrics
            </NavLink>
            <NavLink to="/status">
              <Icon name="settings" size={18} /> Service status
            </NavLink>
            {state.active && (
              <button
                onClick={() => {
                  dispatch({ type: 'exit' });
                  if (secondary.current) secondary.current.open = false;
                }}
              >
                Exit demo & reset
              </button>
            )}
          </nav>
        </details>
      </header>
      <NetworkNotice />
      {state.active && (
        <div className="demo-session" role="status">
          Demo wallet · synthetic data only · resets on exit or reload
        </div>
      )}
      <main ref={main} id="main-content" tabIndex={-1} className="shell__main">
        <Outlet />
      </main>
      <footer className="shell__footer">
        <div className="shell__footer-top">
          <Brand compact />
          <InstallApp />
        </div>
        <p>Healthcare confidence. Powered by {webConfig.aiEngine}.</p>
        <small>
          Operated by {webConfig.operator}. Healthcare funding services are subject to availability.
        </small>
      </footer>
    </div>
  );
}

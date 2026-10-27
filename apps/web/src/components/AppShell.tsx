import { useEffect, useMemo, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Brand } from './Brand';
import { ChatWidget } from './ChatWidget';
import { InstallApp } from './InstallApp';
import { NotificationBell } from './NotificationBell';
import { useDemo } from '../features/demo';
import { useAuth } from '../features/auth-context';
import { hasAnyRole, hasInstitutionalRole, institutionalRoles } from '../features/roles';
import { NetworkNotice } from './Feedback';
import { EnvironmentBanner } from './EnvironmentBanner';
import { Icon, type IconName } from './icons/Icon';
import './AppShell.css';

type NavItem = { to: string; label: string; icon: IconName };

const customerLinks: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/customer/save', label: 'Save for Health', icon: 'heart' },
  { to: '/customer/pay', label: 'Pay Provider', icon: 'credit-card' },
  { to: '/customer/receive', label: 'Receive Funds', icon: 'users' },
  { to: '/customer/insurance', label: 'Insurance Claims', icon: 'shield-check' },
  { to: '/customer/providers', label: 'Providers', icon: 'hospital' },
  { to: '/customer/transactions', label: 'Transactions', icon: 'activity' },
  { to: '/customer/ussd', label: 'USSD Access', icon: 'smartphone' },
  { to: '/customer/orange-money', label: 'Orange Money', icon: 'smartphone' },
  { to: '/customer/profile', label: 'Profile', icon: 'user' },
];

const roleLinks: Record<string, NavItem[]> = {
  platform_admin: [
    { to: '/operations/dashboard', label: 'Overview', icon: 'home' },
    {
      to: '/operations/reviews',
      label: 'Human Review',
      icon: 'check-circle',
    },
    {
      to: '/operations/providers',
      label: 'Provider Verification',
      icon: 'hospital',
    },
    { to: '/operations/admin', label: 'Operational controls', icon: 'alert-triangle' },
    {
      to: '/operations/reviews',
      label: 'Payment Validation',
      icon: 'shield-check',
    },
    { to: '/services/insurance', label: 'Insurance Claims', icon: 'shield-check' },
    { to: '/receipts', label: 'Transactions', icon: 'activity' },
    { to: '/admin?section=receipts', label: 'Issued Receipts', icon: 'file-text' },
  ],
  reviewer: [
    { to: '/operations/dashboard', label: 'Overview', icon: 'home' },
    {
      to: '/operations/reviews',
      label: 'Human Review',
      icon: 'check-circle',
    },
    { to: '/services/insurance', label: 'Insurance Claims', icon: 'shield-check' },
    { to: '/receipts', label: 'Transactions', icon: 'activity' },
  ],
  provider_staff: [
    { to: '/provider/dashboard', label: 'Dashboard', icon: 'home' },
    { to: '/provider/verify-patient', label: 'Verify Patient', icon: 'user-check' },
    { to: '/provider/payments', label: 'Payments', icon: 'credit-card' },
    { to: '/services/insurance', label: 'Claims', icon: 'shield-check' },
    { to: '/receipts', label: 'Payouts', icon: 'wallet' },
    { to: '/provider/profile', label: 'Profile', icon: 'user' },
  ],
  provider_manager: [
    { to: '/provider/dashboard', label: 'Dashboard', icon: 'home' },
    {
      to: '/provider/verify-patient',
      label: 'Verify Patient',
      icon: 'user-check',
    },
    { to: '/provider/payments', label: 'Payments', icon: 'credit-card' },
    { to: '/services/insurance', label: 'Claims', icon: 'shield-check' },
    { to: '/receipts', label: 'Payouts', icon: 'wallet' },
    { to: '/provider/profile', label: 'Profile', icon: 'user' },
  ],
  provider_admin: [
    { to: '/provider/dashboard', label: 'Dashboard', icon: 'home' },
    {
      to: '/provider/verify-patient',
      label: 'Verify Patient',
      icon: 'user-check',
    },
    { to: '/provider/payments', label: 'Payments', icon: 'credit-card' },
    { to: '/services/insurance', label: 'Claims', icon: 'shield-check' },
    { to: '/receipts', label: 'Payouts', icon: 'wallet' },
    { to: '/provider/profile', label: 'Profile', icon: 'user' },
  ],
  employer_admin: [
    { to: '/employer/dashboard', label: 'Dashboard', icon: 'home' },
    { to: '/employer/employees', label: 'Employees', icon: 'users' },
    { to: '/employer/contribute', label: 'Contribute', icon: 'credit-card' },
    { to: '/employer/transactions', label: 'Transactions', icon: 'activity' },
  ],
  sponsor_admin: [
    { to: '/sponsor/dashboard', label: 'Dashboard', icon: 'home' },
    { to: '/sponsor/programs', label: 'Programs', icon: 'gift' },
    { to: '/sponsor/beneficiaries', label: 'Beneficiaries', icon: 'users' },
    { to: '/sponsor/transactions', label: 'Transactions', icon: 'activity' },
  ],
  partner_officer: [
    { to: '/bank/dashboard', label: 'Dashboard', icon: 'home' },
    { to: '/bank/funding', label: 'Funding', icon: 'wallet' },
    { to: '/bank/reconcile', label: 'Reconcile', icon: 'refresh' },
    { to: '/bank/transactions', label: 'Transactions', icon: 'activity' },
  ],
};

const workspaceLinks: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/institutional', label: 'Workspaces', icon: 'building' },
  { to: '/assistant', label: 'LUX assistant', icon: 'message-circle' },
  { to: '/receipts', label: 'Receipts', icon: 'receipt' },
];
export function AppShell() {
  const location = useLocation();
  const { state, dispatch } = useDemo();
  const { signedIn, profile, signOut } = useAuth();
  const canAccessAdmin = hasAnyRole(profile?.roles, ['platform_admin']);
  const canAccessReviews = hasAnyRole(profile?.roles, ['platform_admin', 'reviewer']);
  const hasInstitutionalAccess = hasInstitutionalRole(profile?.roles);
  const links = useMemo(
    () =>
      institutionalRoles
        .filter((role) => profile?.roles.includes(role as never))
        .map((role) => roleLinks[role])
        .find((items): items is NavItem[] => Boolean(items)) ?? customerLinks,
    [profile?.roles],
  );
  const mobileLinks = links;
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
  }, [location.pathname, links]);
  const navClass =
    (link: NavItem) =>
    ({ isActive }: { isActive: boolean }) => {
      if (link.to.includes('?'))
        return location.pathname + location.search === link.to ? 'active' : undefined;
      return isActive ? 'active' : undefined;
    };
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <EnvironmentBanner />
      <header className="shell__header">
        <div className="shell__header-inner">
          <NavLink to="/" className="shell__product" aria-label="HealthWallet dashboard">
            <img className="shell__brand-logo" src="/lux-ai-brand.png" alt="LUX AI" />
            <span>
              <strong>HealthWallet</strong>
              <small>LUX HealthTrust</small>
            </span>
          </NavLink>
          <div className="shell__utilities">
            <span className="shell__mode">
              <i aria-hidden="true" /> Sandbox
            </span>
            <NotificationBell />
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
                <Icon name="user" size={17} />
              </summary>
              <nav aria-label="Secondary">
                <NavLink to={signedIn ? '/customer/profile' : '/login'}>
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
                <NavLink to="/notifications">
                  <Icon name="bell" size={18} /> Notifications
                </NavLink>
                {canAccessAdmin && (
                  <NavLink to="/admin">
                    <Icon name="shield" size={18} /> Admin console
                  </NavLink>
                )}
                {canAccessReviews && (
                  <NavLink to="/institutional/reviews">
                    <Icon name="check-circle" size={18} /> Review queue
                  </NavLink>
                )}
                {canAccessAdmin && (
                  <NavLink to="/institutional/metrics">
                    <Icon name="activity" size={18} /> Journey metrics
                  </NavLink>
                )}
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
          </div>
        </div>
      </header>
      <div className="shell__layout">
        <aside className="shell__sidebar" aria-label="Application navigation">
          <nav className="shell__nav" aria-label="Primary">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'} className={navClass(link)}>
                <Icon name={link.icon} size={19} />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="shell__sidebar-section">
            <span>Tools</span>
            <nav className="shell__workspace-nav" aria-label="Workspace tools">
              {workspaceLinks
                .filter((link) => link.to !== '/institutional' || hasInstitutionalAccess)
                .map((link) => (
                  <NavLink key={link.to} to={link.to}>
                    <Icon name={link.icon} size={17} /> {link.label}
                  </NavLink>
                ))}
            </nav>
          </div>
          <NavLink
            className="shell__sidebar-account"
            to={signedIn ? '/customer/profile' : '/login'}
          >
            <span className="shell__avatar" aria-hidden="true">
              <Icon name="user" size={18} />
            </span>
            <span>
              <strong>{signedIn ? 'Signed in' : 'Your account'}</strong>
              <small>{profile?.phone ?? 'Sign in to continue'}</small>
            </span>
            <Icon name="chevron-right" size={17} />
          </NavLink>
        </aside>
        <div className="shell__surface">
          <NetworkNotice />
          {state.active && (
            <div className="demo-session" role="status">
              Demo wallet · synthetic data only · resets on exit or reload
            </div>
          )}
          <main ref={main} id="main-content" tabIndex={-1} className="shell__main">
            <Outlet />
          </main>
          <ChatWidget />
          <footer className="shell__footer">
            <div className="shell__footer-top">
              <Brand compact />
              <InstallApp />
            </div>
          </footer>
          <nav className="shell__mobile-nav" aria-label="Mobile primary">
            {mobileLinks.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'} className={navClass(link)}>
                <Icon name={link.icon} size={20} />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

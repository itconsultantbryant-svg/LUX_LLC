import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../components/icons/Icon';
import { useAuth } from '../features/auth-context';
import './ReferencePortal.css';

type Screen = {
  title: string;
  subtitle: string;
  metrics: string[];
  section: string;
  rows: string[];
};

const screens: Record<string, Screen> = {
  provider: {
    title: 'Provider Portal',
    subtitle: 'Authorized healthcare payment workspace',
    metrics: ['Pending Balance', 'Settled Balance', 'Total Payouts'],
    section: 'Recent Payment Requests',
    rows: ['Payment requests are available only for your verified facility.'],
  },
  providerVerification: {
    title: 'Provider Verification',
    subtitle: 'Review provider registration and verification status',
    metrics: ['Pending review', 'Verified providers', 'Suspended'],
    section: 'Providers',
    rows: ['Verified provider records', 'Pending provider review'],
  },
  review: {
    title: 'Human Review Queue',
    subtitle: 'Transactions requiring authorized LUX Admin attention',
    metrics: ['Queue items', 'High risk', 'Claims'],
    section: 'Review queue',
    rows: ['Payment requiring review', 'Claim requiring review'],
  },
  admin: {
    title: 'LUX Operations',
    subtitle: 'LUX HealthTrust command center',
    metrics: [
      'Transactions today',
      'Human Review queue',
      'High-risk alerts',
      'Provider verification',
    ],
    section: 'Decision distribution',
    rows: ['Operational metrics are restricted to LUX-authorized staff.'],
  },
  employer: {
    title: 'Employer Portal',
    subtitle: 'Your organization HealthWallet workspace',
    metrics: ['Employees', 'Total Contributed (LRD)', 'Total Contributed (USD)'],
    section: 'Registered Employees',
    rows: ['Employee information is available only to authorized organization administrators.'],
  },
  sponsor: {
    title: 'Sponsor Portal',
    subtitle: 'Create and fund voucher programs',
    metrics: ['Active', 'Pending', 'Partially Used', 'Total Programs'],
    section: 'Recent Programs',
    rows: ['Voucher program records are limited to your organization.'],
  },
  bank: {
    title: 'Bank Portal',
    subtitle: 'Verify funding, credit wallets & reconcile transactions',
    metrics: ['Pending', 'Verified', 'Credited', 'Reconciled'],
    section: 'Recent Funding Requests',
    rows: ['Funding and settlement records are limited to your institution.'],
  },
  transactions: {
    title: 'Transactions',
    subtitle: 'Authorized activity history',
    metrics: [],
    section: 'Transaction history',
    rows: ['No cross-workspace transactions are displayed.'],
  },
};

function screenFor(pathname: string, search: string, roles: string[] | undefined) {
  const view = new URLSearchParams(search).get('screen');
  if (view === 'verify-patient')
    return {
      ...screens.provider,
      title: 'Verify Patient',
      subtitle: 'Search HealthWallet customers by ID, phone, or name',
      section: 'Patient verification',
      rows: ['Use a wallet ID, phone number, or customer name to begin verification.'],
    };
  if (view === 'payments')
    return {
      ...screens.provider,
      title: 'Payment Requests',
      subtitle: 'Create and track healthcare payment requests',
      section: 'All Payment Requests',
    };
  if (view === 'profile')
    return {
      ...screens.provider,
      title: 'Provider Profile',
      subtitle: 'Facility information and verification status',
      section: 'Provider information',
    };
  if (view === 'payment-validation')
    return {
      ...screens.review,
      title: 'Payment Validation',
      subtitle: 'Inspect payment decisions and the full LUX pipeline',
      section: 'Payment decisions',
    };
  if (view === 'employees')
    return {
      ...screens.employer,
      title: 'Employees',
      subtitle: 'View and manage registered employees',
      section: 'Registered Employees',
      rows: ['Employee directory records are restricted to your organization.'],
    };
  if (view === 'contribute')
    return {
      ...screens.employer,
      title: 'Send Contribution',
      subtitle: 'Fund an employee HealthWallet directly',
      section: 'Contribution request',
      rows: ['Select an employee and enter an approved contribution amount.'],
    };
  if (view === 'programs')
    return {
      ...screens.sponsor,
      title: 'Voucher Programs',
      subtitle: 'Create, fund, and manage voucher programs',
      section: 'Voucher programs',
      rows: ['Programs created by your sponsor organization.'],
    };
  if (view === 'beneficiaries')
    return {
      ...screens.sponsor,
      title: 'Beneficiaries',
      subtitle: 'View voucher program beneficiaries',
      section: 'Program beneficiaries',
      rows: ['Beneficiary details are scoped to your programs.'],
    };
  if (view === 'funding')
    return {
      ...screens.bank,
      title: 'Funding Management',
      subtitle: 'Verify, credit, and track funding requests',
      section: 'Funding requests',
      rows: ['Funding requests assigned to your financial institution.'],
    };
  if (view === 'reconcile')
    return {
      ...screens.bank,
      title: 'Reconciliation',
      subtitle: 'Review credited and reconciled transactions',
      section: 'Reconciled transactions',
      rows: ['Reconciliation records are scoped to your financial institution.'],
    };
  if (pathname.includes('provider-verification')) return screens.providerVerification;
  if (pathname.includes('reviews')) return screens.review;
  if (pathname.includes('admin')) return screens.admin;
  if (pathname.includes('receipts')) return screens.transactions;
  if (pathname.includes('provider')) return screens.provider;
  if (pathname.includes('employer')) return screens.employer;
  if (pathname.includes('sponsor')) return screens.sponsor;
  if (pathname.includes('partner')) return screens.bank;
  if (roles?.includes('employer_admin')) return screens.employer;
  if (roles?.includes('sponsor_admin')) return screens.sponsor;
  if (roles?.includes('partner_officer')) return screens.bank;
  if (roles?.some((role) => role.startsWith('provider_'))) return screens.provider;
  return screens.transactions;
}

export function ReferenceWorkspacePage() {
  const location = useLocation();
  const { profile } = useAuth();
  const screen = screenFor(location.pathname, location.search, profile?.roles);
  return (
    <section className="reference-portal reference-workspace">
      <Link to="/dashboard" className="reference-back">
        ← Back
      </Link>
      <header className="reference-portal__heading">
        <span className="reference-portal__heading-icon">
          <Icon name="building" size={16} />
        </span>
        <div>
          <h1>{screen.title}</h1>
          <p>{screen.subtitle}</p>
        </div>
      </header>
      {screen.metrics.length > 0 && (
        <div className="reference-stat-grid">
          {screen.metrics.map((metric, index) => (
            <article className={`reference-stat reference-stat--${index}`} key={metric}>
              <strong>—</strong>
              <span>{metric}</span>
            </article>
          ))}
        </div>
      )}
      <article className="reference-card reference-workspace__table">
        <div className="reference-card__title">
          <h2>{screen.section}</h2>
          <Link className="reference-action" to="/account/security">
            Organization access
          </Link>
        </div>
        <div className="reference-search">
          <Icon name="search" size={14} />
          <input
            aria-label={`Search ${screen.section}`}
            placeholder="Search by name, reference, or status…"
          />
        </div>
        <div className="reference-rows">
          {screen.rows.map((row) => (
            <div key={row}>
              <span>
                <strong>{row}</strong>
                <small>Visible only to your authorized workspace</small>
              </span>
              <b className="reference-tag reference-tag--success">AUTHORIZED</b>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

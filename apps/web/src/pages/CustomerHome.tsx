import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons/Icon';
import { useAuth } from '../features/auth-context';
import { apiGet } from '../lib/api';
import { formatMinor } from '../lib/money';
import type { WalletData } from '../components/WalletBalance';
import './ReferencePortal.css';

type Receipt = {
  id: string;
  kind: string;
  amountMinor: string;
  currency: string;
  status: string;
  issuedAt: string;
  from: { label: string };
  to: { label: string };
};

export function CustomerHome() {
  const { profile } = useAuth();
  const institutionalRole = [
    'platform_admin',
    'reviewer',
    'provider_admin',
    'provider_manager',
    'provider_staff',
    'employer_admin',
    'sponsor_admin',
    'partner_officer',
  ].find((role) => profile?.roles.includes(role as never));
  const [wallet, setWallet] = useState<WalletData>();
  const [walletError, setWalletError] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>();
  const [receiptsError, setReceiptsError] = useState(false);
  useEffect(() => {
    let current = true;
    void apiGet<WalletData>('/api/wallet')
      .then((data) => {
        if (current) setWallet(data);
      })
      .catch(() => {
        if (current) setWalletError(true);
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    void apiGet<{ receipts: Receipt[] }>('/api/receipts?limit=4')
      .then((data) => {
        if (current) setReceipts(data.receipts);
      })
      .catch(() => {
        if (current) setReceiptsError(true);
      });
    return () => {
      current = false;
    };
  }, []);
  if (institutionalRole) return <InstitutionDashboard role={institutionalRole} />;
  const name = profile?.phone ? `Account ${profile.phone.slice(-4)}` : 'Customer';
  const balance = (currency: string) => {
    const item = wallet?.currencies.find((entry) => entry.currency === currency);
    return item ? formatMinor(item.balances.available, currency) : '—';
  };
  return (
    <section className="reference-portal" aria-label="Customer dashboard">
      <header className="reference-portal__heading">
        <span className="reference-portal__heading-icon">
          <Icon name="wallet" size={16} />
        </span>
        <div>
          <h1>Welcome, {name}</h1>
          <p>Your HealthWallet overview</p>
        </div>
      </header>
      <div className="reference-balance-grid">
        <article className="reference-balance reference-balance--lrd">
          <small>LRD Balance</small>
          <strong>{balance('LRD')}</strong>
          <span>Liberian Dollar</span>
        </article>
        <article className="reference-balance reference-balance--usd">
          <small>USD Balance</small>
          <strong>{balance('USD')}</strong>
          <span>US Dollar</span>
        </article>
      </div>
      <p className="reference-notice">
        <Icon name="shield" size={13} /> HealthWallet funds are reserved for verified healthcare
        services.
      </p>
      {walletError && (
        <p className="reference-error" role="alert">
          Wallet data is unavailable. Retry from your dashboard after reconnecting.
        </p>
      )}
      <div className="reference-action-grid">
        <Link to="/save">
          <Icon name="heart" size={18} />
          <span>
            <strong>Deposit Funds</strong>
            <small>From bank or Orange Money</small>
          </span>
        </Link>
        <Link to="/pay">
          <Icon name="credit-card" size={18} />
          <span>
            <strong>Pay Provider</strong>
            <small>Healthcare payment</small>
          </span>
        </Link>
        <Link to="/services/ussd">
          <Icon name="smartphone" size={18} />
          <span>
            <strong>USSD Access</strong>
            <small>No internet? Dial *155*9#</small>
          </span>
        </Link>
      </div>
      <div className="reference-two-column">
        <article className="reference-card">
          <h2>
            <Icon name="shield-check" size={15} /> Insurance Status
          </h2>
          <dl>
            <dt>Active Policy</dt>
            <dd>Coverage is shown only when verified.</dd>
            <dt>Insurer</dt>
            <dd>Check your claim workspace.</dd>
          </dl>
          <Link to="/services/insurance">View insurance claims</Link>
        </article>
        <article className="reference-card">
          <h2>
            <Icon name="wallet" size={15} /> Wallet Information
          </h2>
          <dl>
            <dt>Wallet ID</dt>
            <dd>{profile?.id ?? 'Available after sign in'}</dd>
            <dt>Status</dt>
            <dd>
              <b className="reference-tag reference-tag--success">ACTIVE</b>
            </dd>
          </dl>
          <Link to="/account">Manage profile</Link>
        </article>
      </div>
      <article className="reference-card reference-card--transactions">
        <div className="reference-card__title">
          <h2>Recent Transactions</h2>
          <Link to="/history">View all →</Link>
        </div>
        {receiptsError ? (
          <p className="reference-error" role="alert">
            Recent activity could not be loaded.
          </p>
        ) : !receipts ? (
          <p className="reference-empty">Loading activity…</p>
        ) : receipts.length === 0 ? (
          <p className="reference-empty">No confirmed funding or healthcare payments yet.</p>
        ) : (
          <div className="reference-receipts">
            {receipts.map((receipt) => (
              <div key={receipt.id}>
                <span>
                  <strong>{receipt.kind.replaceAll('_', ' ')}</strong>
                  <small>
                    {receipt.from.label} → {receipt.to.label} ·{' '}
                    {new Date(receipt.issuedAt).toLocaleDateString()}
                  </small>
                </span>
                <span>
                  <b>{formatMinor(receipt.amountMinor, receipt.currency)}</b>
                  <em
                    className={`reference-tag reference-tag--${receipt.status === 'completed' ? 'success' : 'warning'}`}
                  >
                    {receipt.status}
                  </em>
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

const institutionalDashboards: Record<
  string,
  { title: string; subtitle: string; stats: string[]; actions: string[] }
> = {
  employer_admin: {
    title: 'Employer Portal',
    subtitle: 'Your organization HealthWallet workspace',
    stats: ['Employees', 'Total Contributed (LRD)', 'Total Contributed (USD)'],
    actions: ['View Employees', 'Send Contribution'],
  },
  sponsor_admin: {
    title: 'Sponsor Portal',
    subtitle: 'Create and fund voucher programs',
    stats: ['Active', 'Pending', 'Partially Used', 'Total Programs'],
    actions: ['Voucher Programs', 'Transactions'],
  },
  partner_officer: {
    title: 'Bank Portal',
    subtitle: 'Verify funding, credit wallets & reconcile transactions',
    stats: ['Pending', 'Verified', 'Credited', 'Reconciled'],
    actions: ['Manage Funding', 'Reconcile Transactions'],
  },
  provider_staff: {
    title: 'Provider Portal',
    subtitle: 'Authorized healthcare payment workspace',
    stats: ['Pending Balance', 'Settled Balance', 'Total Payouts'],
    actions: ['Verify Patient', 'Payment Requests', 'Payouts', 'Claims'],
  },
  provider_manager: {
    title: 'Provider Portal',
    subtitle: 'Authorized healthcare payment workspace',
    stats: ['Pending Balance', 'Settled Balance', 'Total Payouts'],
    actions: ['Verify Patient', 'Payment Requests', 'Payouts', 'Claims'],
  },
  provider_admin: {
    title: 'Provider Portal',
    subtitle: 'Authorized healthcare payment workspace',
    stats: ['Pending Balance', 'Settled Balance', 'Total Payouts'],
    actions: ['Verify Patient', 'Payment Requests', 'Payouts', 'Claims'],
  },
  reviewer: {
    title: 'LUX Operations',
    subtitle: 'LUX HealthTrust command center',
    stats: [
      'Transactions today',
      'Human Review queue',
      'High-risk alerts',
      'Provider verification',
    ],
    actions: ['Human Review', 'Insurance Claims'],
  },
  platform_admin: {
    title: 'LUX Operations',
    subtitle: 'LUX HealthTrust command center',
    stats: [
      'Transactions today',
      'Human Review queue',
      'High-risk alerts',
      'Provider verification',
    ],
    actions: ['Human Review', 'Provider Verification', 'Fraud & Risk', 'Payment Validation'],
  },
};

function InstitutionDashboard({ role }: { role: string }) {
  const item = institutionalDashboards[role] ?? institutionalDashboards.reviewer;
  return (
    <section className="reference-portal" aria-label={item.title}>
      <header className="reference-portal__heading">
        <span className="reference-portal__heading-icon">
          <Icon name="building" size={16} />
        </span>
        <div>
          <h1>{item.title}</h1>
          <p>{item.subtitle}</p>
        </div>
      </header>
      <div className="reference-stat-grid">
        {item.stats.map((stat, index) => (
          <article className={`reference-stat reference-stat--${index}`} key={stat}>
            <strong>—</strong>
            <span>{stat}</span>
          </article>
        ))}
      </div>
      <div className="reference-action-grid reference-action-grid--institution">
        {item.actions.map((action) => (
          <article key={action}>
            <Icon name="activity" size={18} />
            <span>
              <strong>{action}</strong>
              <small>Open your authorized workspace</small>
            </span>
          </article>
        ))}
      </div>
      <article className="reference-card reference-card--transactions">
        <div className="reference-card__title">
          <h2>Recent Activity</h2>
        </div>
        <p className="reference-empty">
          Only records authorized for your organization are shown here.
        </p>
      </article>
    </section>
  );
}

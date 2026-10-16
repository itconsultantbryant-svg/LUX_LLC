import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, ApiError } from '../lib/api';
import { formatMinor } from '../lib/money';
import { DashboardCard } from './DashboardCard';
import { Icon } from './icons/Icon';

const sourceNames: Record<string, string> = {
  personal_savings: 'Personal savings',
  family_contributions: 'Family contributions',
  employer_benefits: 'Employer benefits',
  sponsor_vouchers: 'Sponsor vouchers',
  rewards: 'Rewards',
  partner_credit: 'Partner credit',
};
type Balances = Record<'available' | 'reserved' | 'pending' | 'restricted', string>;
type Allocation = {
  id: string;
  source: string;
  balances: Balances;
  expiresAt: string | null;
  allowedCategories: string[];
  allowedProviderIds: string[];
  dependentId: string | null;
  programId: string | null;
  status: string;
  maxPerPaymentMinor: string | null;
};
export type WalletData = {
  currencies: Array<{ currency: string; balances: Balances; allocations: Allocation[] }>;
  balanceBasis: 'platform_ledger';
  partnerFundsVerified: false;
};

export function WalletDetails({ data }: { data: WalletData }) {
  return (
    <>
      {data.currencies.length === 0 && (
        <p>No funds have been recorded yet. Your funding sources will appear here.</p>
      )}
      {data.currencies.map((group) => (
        <section key={group.currency} aria-label={`${group.currency} healthcare funds`}>
          <p className="eyebrow">Available for eligible care · {group.currency}</p>
          <p className="balance">{formatMinor(group.balances.available, group.currency)}</p>
          <div className="stat-card">
            <div>
              <div className="stat-card__label">Reserved</div>
              <div className="stat-card__value">
                {formatMinor(group.balances.reserved, group.currency)}
              </div>
              <div className="stat-card__meta">Held for a payment. Not included above.</div>
            </div>
            <div className="stat-card__icon">
              <Icon name="clock" size={18} />
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-card__label">Pending</div>
              <div className="stat-card__value">
                {formatMinor(group.balances.pending, group.currency)}
              </div>
              <div className="stat-card__meta">Awaiting confirmation. Not included above.</div>
            </div>
            <div className="stat-card__icon">
              <Icon name="clock" size={18} />
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-card__label">Restricted</div>
              <div className="stat-card__value">
                {formatMinor(group.balances.restricted, group.currency)}
              </div>
              <div className="stat-card__meta">
                Subject to restrictions or unavailable. Not included above.
              </div>
            </div>
            <div className="stat-card__icon">
              <Icon name="shield" size={18} />
            </div>
          </div>
          <details style={{ marginTop: '1rem' }}>
            <summary>Where your funds come from · {group.currency}</summary>
            <ul className="activity-list">
              {group.allocations.map((allocation) => (
                <li key={allocation.id}>
                  <div>
                    <strong>{sourceNames[allocation.source] ?? 'Healthcare funding'}</strong>
                    {allocation.dependentId && <small>For an authorized dependent only.</small>}
                    {allocation.allowedCategories.length > 0 && (
                      <small>Eligible care: {allocation.allowedCategories.join(', ')}</small>
                    )}
                    {allocation.allowedProviderIds.length > 0 && (
                      <small>Participating providers only.</small>
                    )}
                    {allocation.programId && <small>Program rules apply at payment review.</small>}
                    {allocation.maxPerPaymentMinor && (
                      <small>
                        Per-payment limit:{' '}
                        {formatMinor(allocation.maxPerPaymentMinor, group.currency)}
                      </small>
                    )}
                    {allocation.expiresAt && (
                      <small>Expires {new Date(allocation.expiresAt).toLocaleDateString()}</small>
                    )}
                  </div>
                  <div>
                    {(Object.keys(allocation.balances) as Array<keyof Balances>).map((bucket) => (
                      <small key={bucket}>
                        {bucket[0].toUpperCase() + bucket.slice(1)}:{' '}
                        {formatMinor(allocation.balances[bucket], group.currency)}
                      </small>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ))}
      <p className="muted" style={{ marginTop: '1rem' }}>
        These are HealthWallet records. They do not confirm money held by a payment partner. Partner
        settlement is tracked separately.
      </p>
    </>
  );
}

export function WalletBalance() {
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSignedOut(false);
    setData(null);
    void apiGet<WalletData>('/api/wallet')
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) setSignedOut(true);
        else setError(reason instanceof Error ? reason.message : 'Unable to load your wallet.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <DashboardCard
      title="Your HealthWallet"
      description="Sign in to see your healthcare funds"
      icon="wallet"
      className="balance-panel"
      action={
        <Link className="btn btn--primary" to="/pay">
          Pay for Care <span aria-hidden="true">→</span>
        </Link>
      }
    >
      {loading && (
        <div role="status">
          <p className="balance">LRD —</p>
          <p>Loading your funds…</p>
        </div>
      )}
      {signedOut && (
        <p>
          Sign in to see your healthcare funds. <Link to="/account">Customer sign in</Link>
        </p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className="btn btn--ghost" onClick={() => setAttempt((n) => n + 1)}>
            Retry wallet
          </button>
        </div>
      )}
      {data && <WalletDetails data={data} />}
      <div className="action-pair" style={{ marginTop: '1rem' }}>
        <Link className="btn btn--ghost" to="/save">
          <Icon name="heart" size={18} /> Save Money
        </Link>
        <Link className="btn btn--ghost" to="/support">
          <Icon name="credit-card" size={18} /> Get Support
        </Link>
      </div>
    </DashboardCard>
  );
}

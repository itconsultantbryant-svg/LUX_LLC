import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Icon } from '../components/icons/Icon';
import { useAuth } from '../features/auth-context';
import { institutionalRoles } from '../features/roles';
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
  const institutionalRole = institutionalRoles.find((role) => profile?.roles.includes(role));
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
  if (institutionalRole)
    return (
      <Navigate
        to={
          institutionalRole === 'employer_admin'
            ? '/employer/dashboard'
            : institutionalRole === 'sponsor_admin'
              ? '/sponsor/dashboard'
              : institutionalRole === 'partner_officer'
                ? '/bank/dashboard'
                : institutionalRole.startsWith('provider_')
                  ? '/provider/dashboard'
                  : institutionalRole === 'platform_admin'
                    ? '/admin'
                    : '/institutional/reviews'
        }
        replace
      />
    );
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
          <p>HealthWallet overview</p>
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
      {walletError && (
        <p className="reference-error" role="alert">
          Wallet data is unavailable. Retry from your dashboard after reconnecting.
        </p>
      )}
      <div className="reference-action-grid">
        <Link to="/receipts">
          <Icon name="wallet" size={18} />
          <span>
            <strong>Wallet &amp; transactions</strong>
            <small>View your records</small>
          </span>
        </Link>
        <Link to="/customer/profile">
          <Icon name="user" size={18} />
          <span>
            <strong>Profile</strong>
            <small>Manage your account</small>
          </span>
        </Link>
      </div>
      <article className="reference-card reference-card--transactions">
        <div className="reference-card__title">
          <h2>Recent Transactions</h2>
          <Link to="/receipts">View all →</Link>
        </div>
        {receiptsError ? (
          <p className="reference-error" role="alert">
            Recent activity could not be loaded.
          </p>
        ) : !receipts ? (
          <p className="reference-empty">Loading activity…</p>
        ) : receipts.length === 0 ? (
          <p className="reference-empty">No transactions yet.</p>
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

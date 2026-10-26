import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons/Icon';
import { apiGet } from '../lib/api';
import { formatMinor } from '../lib/money';
import './ReferencePortal.css';

type Settlement = {
  id: string;
  direction: string;
  amount_minor: string;
  currency: string;
  status: string;
  adapter_mode: string;
  partner_reference: string | null;
  confirmed_at: string | null;
  created_at: string;
  organization_name: string;
};

export function BankPage() {
  const [searchParams] = useSearchParams();
  const [settlements, setSettlements] = useState<Settlement[]>();
  const [error, setError] = useState('');
  const screen = searchParams.get('screen') ?? 'dashboard';
  useEffect(() => {
    let active = true;
    void apiGet<{ settlements: Settlement[] }>('/api/partners/settlements')
      .then((data) => active && setSettlements(data.settlements))
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, []);
  const metrics = useMemo(() => {
    const rows = settlements ?? [];
    return [
      ['Expected', rows.filter((row) => row.status === 'expected').length],
      ['Submitted', rows.filter((row) => row.status === 'submitted').length],
      ['Confirmed', rows.filter((row) => row.status === 'confirmed').length],
      ['Exceptions', rows.filter((row) => ['failed', 'disputed'].includes(row.status)).length],
    ] as const;
  }, [settlements]);
  const title =
    screen === 'funding'
      ? 'Funding management'
      : screen === 'reconcile'
        ? 'Settlement reconciliation'
        : screen === 'transactions'
          ? 'Settlement history'
          : 'Financial institution portal';
  const subtitle =
    screen === 'reconcile'
      ? 'Confirmation requires partner reference and recorded evidence.'
      : 'Institution-scoped settlement records in sandbox mode.';
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
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      {screen === 'dashboard' && (
        <div className="reference-stat-grid">
          {metrics.map(([label, value], index) => (
            <article className={`reference-stat reference-stat--${index}`} key={label}>
              <strong>{settlements ? value : '—'}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      )}
      <article className="reference-card reference-workspace__table">
        <div className="reference-card__title">
          <h2>{screen === 'reconcile' ? 'Settlement evidence status' : 'Partner settlements'}</h2>
        </div>
        {error ? (
          <p className="reference-error" role="alert">
            {error}
          </p>
        ) : !settlements ? (
          <p className="reference-empty">Loading authorized settlements…</p>
        ) : settlements.length === 0 ? (
          <p className="reference-empty">No settlement records are assigned to your institution.</p>
        ) : (
          <div className="reference-rows">
            {settlements.map((settlement) => (
              <div key={settlement.id}>
                <span>
                  <strong>
                    {settlement.organization_name} · {settlement.direction}
                  </strong>
                  <small>
                    {settlement.partner_reference
                      ? `Reference ${settlement.partner_reference}`
                      : 'No external reference recorded'}{' '}
                    · {new Date(settlement.created_at).toLocaleDateString()} ·{' '}
                    {settlement.adapter_mode}
                  </small>
                </span>
                <span>
                  <b>{formatMinor(settlement.amount_minor, settlement.currency)}</b>
                  <em
                    className={`reference-tag reference-tag--${settlement.status === 'confirmed' ? 'success' : 'warning'}`}
                  >
                    {settlement.status}
                  </em>
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
      <p className="reference-notice">
        <Icon name="shield-check" size={14} /> A confirmed status reflects recorded partner
        evidence. This view does not credit funds or establish external settlement.
      </p>
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet } from '../lib/api';

type Settlement = {
  id: string;
  status: string;
  amount_minor: string;
  currency: string;
  organization_name: string;
};

export function PartnerWorkspacePage() {
  const [settlements, setSettlements] = useState<Settlement[]>();
  const [error, setError] = useState('');
  const refresh = async () =>
    setSettlements(
      (await apiGet<{ settlements: Settlement[] }>('/api/partners/settlements')).settlements,
    );
  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, []);
  const counts = useMemo(
    () => ({
      expected: settlements?.filter((row) => row.status === 'expected').length ?? 0,
      submitted: settlements?.filter((row) => row.status === 'submitted').length ?? 0,
      confirmed: settlements?.filter((row) => row.status === 'confirmed').length ?? 0,
    }),
    [settlements],
  );

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="building" size={15} /> Financial institution
          </p>
          <h1>Bank Portal</h1>
          <p>Institution-scoped settlement activity.</p>
        </div>
      </header>
      {error && (
        <Feedback kind="error" title={error}>
          <button className="btn btn--ghost" onClick={() => void refresh()}>
            Retry
          </button>
        </Feedback>
      )}
      {!settlements ? (
        <Feedback kind="loading" title="Loading settlement activity…" />
      ) : (
        <>
          <div className="reference-stat-grid">
            <article className="reference-stat reference-stat--0">
              <strong>{counts.expected}</strong>
              <span>Expected</span>
            </article>
            <article className="reference-stat reference-stat--1">
              <strong>{counts.submitted}</strong>
              <span>Submitted</span>
            </article>
            <article className="reference-stat reference-stat--2">
              <strong>{counts.confirmed}</strong>
              <span>Confirmed</span>
            </article>
          </div>
          <div className="reference-action-grid">
            <Link to="/bank/funding">
              <Icon name="wallet" size={18} />
              <span>
                <strong>Funding</strong>
                <small>Review settlement funding</small>
              </span>
            </Link>
            <Link to="/bank/reconcile">
              <Icon name="refresh" size={18} />
              <span>
                <strong>Reconcile</strong>
                <small>Confirm settlement records</small>
              </span>
            </Link>
            <Link to="/bank/transactions">
              <Icon name="activity" size={18} />
              <span>
                <strong>Transactions</strong>
                <small>View settlement history</small>
              </span>
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { useAuth } from '../features/auth-context';
import { apiGet } from '../lib/api';

type Metrics = {
  counts: {
    bills: Array<{ count: number }>;
    reviewCases: Array<{ count: number }>;
    payments: Array<{ count: number }>;
  };
  generatedAt: string;
};

export function OperationsWorkspacePage() {
  const { profile } = useAuth();
  const isPlatformAdmin = profile?.roles.includes('platform_admin') ?? false;
  const [metrics, setMetrics] = useState<Metrics>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isPlatformAdmin) return;
    void apiGet<Metrics>('/api/admin/metrics')
      .then(setMetrics)
      .catch((reason: Error) => setError(reason.message));
  }, [isPlatformAdmin]);
  const sum = (rows: Array<{ count: number }> | undefined) =>
    rows?.reduce((total, row) => total + row.count, 0) ?? 0;

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="shield-check" size={15} /> LUX operations
          </p>
          <h1>Operations</h1>
          <p>Authorized operational workspace.</p>
        </div>
      </header>
      {error && <Feedback kind="error" title={error} />}
      {isPlatformAdmin && !metrics ? (
        <Feedback kind="loading" title="Loading operations metrics…" />
      ) : (
        <>
          {isPlatformAdmin && metrics && (
            <div className="reference-stat-grid">
              <article className="reference-stat reference-stat--0">
                <strong>{sum(metrics.counts.reviewCases)}</strong>
                <span>Review cases</span>
              </article>
              <article className="reference-stat reference-stat--1">
                <strong>{sum(metrics.counts.bills)}</strong>
                <span>Bills</span>
              </article>
              <article className="reference-stat reference-stat--2">
                <strong>{sum(metrics.counts.payments)}</strong>
                <span>Payments</span>
              </article>
            </div>
          )}
          <div className="reference-action-grid">
            <Link to="/operations/reviews">
              <Icon name="check-circle" size={18} />
              <span>
                <strong>Review queue</strong>
                <small>Review authorized cases</small>
              </span>
            </Link>
            {isPlatformAdmin && (
              <>
                <Link to="/operations/providers">
                  <Icon name="hospital" size={18} />
                  <span>
                    <strong>Provider verification</strong>
                    <small>Review provider evidence</small>
                  </span>
                </Link>
                <Link to="/operations/admin">
                  <Icon name="settings" size={18} />
                  <span>
                    <strong>Controls</strong>
                    <small>Manage platform controls</small>
                  </span>
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

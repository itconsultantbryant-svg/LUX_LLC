import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, ApiError } from '../lib/api';
import { formatMinor } from '../lib/money';
import { Feedback } from './Feedback';
import { DashboardCard } from './DashboardCard';

type Activity = {
  payments: { id: string; kind: string; currency: string; amountMinor: string; status: string }[];
  links: { id: string; expires_at: string; revoked_at: string | null }[];
};

export function FundingActivity() {
  const [data, setData] = useState<Activity>();
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setData(undefined);
    apiGet<Activity>('/api/funding')
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (!active) return;
        setSignedOut(e instanceof ApiError && e.status === 401);
        setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version]);
  return (
    <DashboardCard
      title="Funding requests and recent activity"
      description="Track deposits, contributions, and active support links"
      icon="activity"
      action={
        <div className="button-row">
          <Link className="text-link" to="/history">
            View funding history
          </Link>
          <Link className="text-link" to="/support">
            Manage support links
          </Link>
        </div>
      }
    >
      {error ? (
        <Feedback kind={signedOut ? 'unavailable' : 'error'} title={error}>
          {signedOut ? (
            <Link className="text-link" to="/account">
              Sign in to view funding
            </Link>
          ) : (
            <button className="btn btn--ghost" onClick={() => setVersion((v) => v + 1)}>
              Retry
            </button>
          )}
        </Feedback>
      ) : !data ? (
        <Feedback kind="loading" title="Loading funding activity…" />
      ) : (
        <>
          <p>
            {data.payments.filter((p) => p.status === 'pending').length} pending payments ·{' '}
            {
              data.links.filter(
                (l) => !l.revoked_at && new Date(l.expires_at).getTime() > Date.now(),
              ).length
            }{' '}
            active support links
          </p>
          {data.payments.length ? (
            <ul className="activity-list">
              {data.payments.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <span>
                    {p.kind} · {formatMinor(p.amountMinor, p.currency)}
                  </span>
                  <span
                    className={`badge badge--${p.status === 'confirmed' ? 'success' : 'pending'}`}
                  >
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No deposits or contributions yet.</p>
          )}
        </>
      )}
    </DashboardCard>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet } from '../lib/api';

type Program = { id: string; name: string; status: string; organization_name: string };

export function SponsorWorkspacePage() {
  const [programs, setPrograms] = useState<Program[]>();
  const [error, setError] = useState('');
  const refresh = async () =>
    setPrograms((await apiGet<{ programs: Program[] }>('/api/sponsor/portal')).programs);
  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, []);
  const counts = useMemo(
    () => ({
      active: programs?.filter((program) => program.status === 'active').length ?? 0,
      pending: programs?.filter((program) => program.status.includes('pending')).length ?? 0,
      total: programs?.length ?? 0,
    }),
    [programs],
  );

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="gift" size={15} /> Sponsor organization
          </p>
          <h1>Sponsor Portal</h1>
          <p>Authorized healthcare voucher programs.</p>
        </div>
      </header>
      {error && (
        <Feedback kind="error" title={error}>
          <button className="btn btn--ghost" onClick={() => void refresh()}>
            Retry
          </button>
        </Feedback>
      )}
      {!programs ? (
        <Feedback kind="loading" title="Loading sponsor programs…" />
      ) : (
        <>
          <div className="reference-stat-grid">
            <article className="reference-stat reference-stat--0">
              <strong>{counts.active}</strong>
              <span>Active</span>
            </article>
            <article className="reference-stat reference-stat--1">
              <strong>{counts.pending}</strong>
              <span>Pending</span>
            </article>
            <article className="reference-stat reference-stat--2">
              <strong>{counts.total}</strong>
              <span>Programs</span>
            </article>
          </div>
          <div className="reference-action-grid">
            <Link to="/sponsor/programs">
              <Icon name="gift" size={18} />
              <span>
                <strong>Programs</strong>
                <small>Manage voucher programs</small>
              </span>
            </Link>
            <Link to="/sponsor/beneficiaries">
              <Icon name="users" size={18} />
              <span>
                <strong>Beneficiaries</strong>
                <small>Authorized program access</small>
              </span>
            </Link>
            <Link to="/sponsor/transactions">
              <Icon name="activity" size={18} />
              <span>
                <strong>Transactions</strong>
                <small>Program funding history</small>
              </span>
            </Link>
          </div>
          <article className="panel">
            <h2>Programs</h2>
            {!programs.length ? (
              <p className="muted">No authorized programs yet.</p>
            ) : (
              <ul className="activity-list">
                {programs.slice(0, 5).map((program) => (
                  <li key={program.id}>
                    <div>
                      <strong>{program.name}</strong>
                      <small>{program.organization_name}</small>
                    </div>
                    <span className="badge badge--success">{program.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </>
      )}
    </section>
  );
}

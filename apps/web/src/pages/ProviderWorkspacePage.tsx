import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet } from '../lib/api';

type Organization = { id: string; name: string; role: string };
type Provider = {
  id: string;
  organization_id: string;
  legal_name: string;
  license_number: string;
  status: string;
  address: { line?: string; phone?: string };
};
type Portal = { organizations: Organization[]; providers: Provider[] };

export function ProviderWorkspacePage() {
  const [portal, setPortal] = useState<Portal>();
  const [error, setError] = useState('');
  const refresh = async () => setPortal(await apiGet<Portal>('/api/provider/portal'));
  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="hospital" size={15} /> Healthcare provider
          </p>
          <h1>Provider Portal</h1>
          <p>Verified organization access and payment workspaces.</p>
        </div>
      </header>
      {error && (
        <Feedback kind="error" title={error}>
          <button className="btn btn--ghost" onClick={() => void refresh()}>
            Retry
          </button>
        </Feedback>
      )}
      {!portal ? (
        <Feedback kind="loading" title="Loading provider workspace…" />
      ) : !portal.organizations.length ? (
        <Feedback kind="unavailable" title="No provider organization assigned" />
      ) : (
        <>
          <div className="reference-stat-grid">
            <article className="reference-stat reference-stat--0">
              <strong>{portal.organizations.length}</strong>
              <span>Organizations</span>
            </article>
            <article className="reference-stat reference-stat--1">
              <strong>{portal.providers.length}</strong>
              <span>Provider profiles</span>
            </article>
            <article className="reference-stat reference-stat--2">
              <strong>
                {portal.providers.filter((provider) => provider.status === 'verified').length}
              </strong>
              <span>Verified</span>
            </article>
          </div>
          <div className="reference-action-grid">
            <Link to="/provider/verify-patient">
              <Icon name="user-check" size={18} />
              <span>
                <strong>Verify patient</strong>
                <small>Use a customer code</small>
              </span>
            </Link>
            <Link to="/provider/payments">
              <Icon name="credit-card" size={18} />
              <span>
                <strong>Payments</strong>
                <small>Review provider bills</small>
              </span>
            </Link>
            <Link to="/provider/profile">
              <Icon name="user" size={18} />
              <span>
                <strong>Profile</strong>
                <small>Manage organization profile</small>
              </span>
            </Link>
          </div>
          <article className="panel">
            <h2>Authorized organizations</h2>
            <ul className="activity-list">
              {portal.organizations.map((organization) => (
                <li key={organization.id}>
                  <strong>{organization.name}</strong>
                  <span className="badge badge--success">
                    {organization.role.replaceAll('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </>
      )}
    </section>
  );
}

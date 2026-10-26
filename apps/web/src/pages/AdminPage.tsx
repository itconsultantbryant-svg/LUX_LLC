import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiPut } from '../lib/api';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { useAuth } from '../features/auth-context';
import './AdminPage.css';

type Overview = {
  customers: number;
  pendingOrganizations: number;
  approvedOrganizations: number;
  pendingProviders: number;
  verifiedProviders: number;
  openDisputes: number;
  receipts: number;
  confirmedDeposits: number;
  flags: Array<{ key: string; label: string; enabled: boolean; reason: string | null }>;
};
type Organization = { id: string; name: string; kind: string; status: string; created_at: string };
type Provider = {
  id: string;
  legal_name: string;
  license_number: string;
  organization_name: string;
  organization_status: string;
  self_owned: boolean;
  status: string;
  created_at: string;
};
type Receipt = {
  id: string;
  number: string;
  kind: string;
  direction: string;
  status: string;
  from: { label: string };
  to: { label: string };
  amountMinor: string;
  currency: string;
  revocationReason?: string | null;
  issuedAt: string;
};

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'activity' },
  { id: 'organizations', label: 'Organizations', icon: 'building' },
  { id: 'providers', label: 'Providers', icon: 'check-circle' },
  { id: 'receipts', label: 'Receipts', icon: 'file-text' },
  { id: 'flags', label: 'Feature switches', icon: 'settings' },
] as const;

export function AdminPage() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const initialSection = SECTIONS.some((item) => item.id === requestedSection)
    ? (requestedSection as (typeof SECTIONS)[number]['id'])
    : 'overview';
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>(initialSection);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [validDays, setValidDays] = useState('30');

  const isAdmin = profile?.roles.includes('platform_admin') ?? false;

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const refresh = useCallback(async () => {
    setError('');
    const [o, org, prov, rec] = await Promise.all([
      apiGet<Overview>('/api/admin/overview'),
      apiGet<{ organizations: Organization[] }>('/api/admin/onboarding'),
      apiGet<{ providers: Provider[] }>('/api/admin/providers'),
      apiGet<{ receipts: Receipt[] }>('/api/admin/receipts?limit=100'),
    ]);
    setOverview(o);
    setOrganizations(org.organizations);
    setProviders(prov.providers);
    setReceipts(rec.receipts);
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    refresh()
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load the admin console.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, refresh]);

  // Keep the console live: newly submitted providers and organization reviews
  // appear without a manual reload. Mutations still refresh immediately.
  useEffect(() => {
    if (!isAdmin) return;
    const timer = setInterval(() => {
      void refresh().catch(() => {
        /* transient; the next poll and manual actions recover */
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [isAdmin, refresh]);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <section className="workspace">
        <Feedback kind="unavailable" title="Platform administrator access required">
          <p>Sign in with an administrator account to open the operations console.</p>
          <Link className="btn btn--primary" to="/account">
            Administrator sign-in
          </Link>
        </Feedback>
      </section>
    );
  }

  return (
    <section className="workspace admin">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="shield" size={15} /> Platform operations
          </p>
          <h1>Administrator console</h1>
          <p>Manage onboarding, payments oversight, receipts and runtime switches.</p>
        </div>
      </div>
      <div aria-live="polite">
        {notice && <Feedback kind="success" title={notice} />}
        {error && <Feedback kind="error" title={error} />}
        {loading && <Feedback kind="loading" title="Loading the console…" />}
      </div>
      <div className="admin__layout">
        <nav className="admin__sidebar" aria-label="Admin sections">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? 'is-active' : ''}
              aria-current={section === item.id ? 'true' : undefined}
              onClick={() => setSection(item.id)}
            >
              <Icon name={item.icon} size={17} /> {item.label}
            </button>
          ))}
        </nav>
        <div className="admin__content">
          {section === 'overview' && overview && (
            <div className="dashboard-grid">
              {(
                [
                  ['Customers', overview.customers],
                  ['Pending organizations', overview.pendingOrganizations],
                  ['Approved organizations', overview.approvedOrganizations],
                  ['Providers awaiting review', overview.pendingProviders],
                  ['Verified providers', overview.verifiedProviders],
                  ['Open disputes', overview.openDisputes],
                  ['Receipts issued', overview.receipts],
                  ['Confirmed deposits', overview.confirmedDeposits],
                ] as Array<[string, number]>
              ).map(([label, value]) => (
                <article className="panel admin__stat" key={label}>
                  <span className="admin__stat-value">{value}</span>
                  <span className="admin__stat-label">{label}</span>
                </article>
              ))}
            </div>
          )}

          {section === 'organizations' && (
            <article className="panel">
              <h2>Organization onboarding</h2>
              <p>Approve, reject or suspend organizations. You cannot review your own.</p>
              <ul className="activity-list">
                {organizations.map((org) => (
                  <li key={org.id}>
                    <div>
                      <strong>{org.name}</strong>
                      <p>
                        {org.kind} · {org.status} · {new Date(org.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {org.status !== 'approved' && (
                      <div className="button-row">
                        <button
                          className="btn btn--primary"
                          disabled={busy || note.trim().length < 5}
                          onClick={() =>
                            void act(async () => {
                              await apiPost(`/api/admin/organizations/${org.id}/reviews`, {
                                status: 'approved',
                                note,
                              });
                              setNote('');
                              await refresh();
                              setNotice(`${org.name} approved.`);
                            })
                          }
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn--ghost"
                          disabled={busy || note.trim().length < 5}
                          onClick={() =>
                            void act(async () => {
                              await apiPost(`/api/admin/organizations/${org.id}/reviews`, {
                                status: 'rejected',
                                note,
                              });
                              setNote('');
                              await refresh();
                              setNotice(`${org.name} rejected.`);
                            })
                          }
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="app-form">
                <label htmlFor="org-note">Review note (required for a decision)</label>
                <input
                  id="org-note"
                  minLength={5}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </article>
          )}

          {section === 'providers' && (
            <article className="panel">
              <h2>Provider verification</h2>
              <p>
                Verification requires registry evidence and an expiry, and the provider’s
                organization must already be approved so customers can see it. You cannot verify
                providers you own.
              </p>
              <ul className="activity-list">
                {providers.map((provider) => {
                  const orgApproved = provider.organization_status === 'approved';
                  const decisionReady =
                    note.trim().length >= 8 &&
                    !provider.self_owned &&
                    Number.isInteger(Number(validDays)) &&
                    Number(validDays) >= 1 &&
                    Number(validDays) <= 365;
                  return (
                    <li key={provider.id}>
                      <div>
                        <strong>{provider.legal_name}</strong>
                        <p>
                          {provider.organization_name} · organization {provider.organization_status}{' '}
                          · licence {provider.license_number} · {provider.status}
                        </p>
                        {!orgApproved && (
                          <small>
                            Approve the organization in the Organizations section before verifying.
                          </small>
                        )}
                        {provider.self_owned && (
                          <small>
                            An independent verifier must review an organization you own.
                          </small>
                        )}
                      </div>
                      {provider.status !== 'verified' && (
                        <div className="button-row">
                          <button
                            className="btn btn--primary"
                            disabled={busy || !decisionReady || !orgApproved}
                            onClick={() =>
                              void act(async () => {
                                await apiPost(`/api/admin/providers/${provider.id}/reviews`, {
                                  status: 'verified',
                                  note,
                                  evidenceReference: `registry-${provider.id.slice(0, 8)}`,
                                  validDays: Number(validDays),
                                });
                                setNote('');
                                await refresh();
                                setNotice(`${provider.legal_name} verified.`);
                              })
                            }
                          >
                            Verify
                          </button>
                          <button
                            className="btn btn--ghost"
                            disabled={busy || !decisionReady}
                            onClick={() =>
                              void act(async () => {
                                await apiPost(`/api/admin/providers/${provider.id}/reviews`, {
                                  status: 'rejected',
                                  note,
                                  evidenceReference: `registry-${provider.id.slice(0, 8)}`,
                                  validDays: Number(validDays),
                                });
                                setNote('');
                                await refresh();
                                setNotice(`${provider.legal_name} rejected.`);
                              })
                            }
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="app-form">
                <label htmlFor="prov-note">Review note (at least 8 characters)</label>
                <input
                  id="prov-note"
                  minLength={8}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <label htmlFor="valid-days">Verification valid for (1–365 days)</label>
                <input
                  id="valid-days"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  min={1}
                  max={365}
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
              </div>
            </article>
          )}

          {section === 'receipts' && (
            <article className="panel">
              <h2>Transaction receipts</h2>
              <p>
                Every money movement is receipted. Revoke to cancel standing; reverse to record the
                opposite movement.
              </p>
              <div className="app-form">
                <label htmlFor="receipt-reason">Reason (required to revoke or reverse)</label>
                <input
                  id="receipt-reason"
                  minLength={8}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <ul className="activity-list">
                {receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <div>
                      <strong>{receipt.number}</strong>
                      <p>
                        {receipt.kind} · {receipt.direction} · {receipt.status}
                      </p>
                      <p>
                        {receipt.from.label} → {receipt.to.label} · {receipt.currency}{' '}
                        {receipt.amountMinor}
                      </p>
                      <small>{new Date(receipt.issuedAt).toLocaleString()}</small>
                    </div>
                    {receipt.status === 'completed' && (
                      <div className="button-row">
                        <button
                          className="btn btn--ghost"
                          disabled={busy || reason.trim().length < 8}
                          onClick={() =>
                            void act(async () => {
                              await apiPost(`/api/admin/receipts/${receipt.id}/revoke`, { reason });
                              setReason('');
                              await refresh();
                              setNotice(`${receipt.number} revoked.`);
                            })
                          }
                        >
                          Revoke
                        </button>
                        <button
                          className="btn btn--ghost"
                          disabled={busy || reason.trim().length < 8}
                          onClick={() =>
                            void act(async () => {
                              await apiPost(`/api/admin/receipts/${receipt.id}/reverse`, {
                                reason,
                              });
                              setReason('');
                              await refresh();
                              setNotice(`${receipt.number} reversed.`);
                            })
                          }
                        >
                          Reverse
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          )}

          {section === 'flags' && overview && (
            <article className="panel">
              <h2>Runtime feature switches</h2>
              {(overview.flags ?? []).map((flag) => (
                <div key={flag.key} className="admin__flag">
                  <div>
                    <strong>{flag.label}</strong>
                    <p>
                      {flag.key} · {flag.enabled ? 'enabled' : 'disabled'}
                    </p>
                  </div>
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await apiPut(`/api/admin/flags/${flag.key}`, {
                          enabled: !flag.enabled,
                          reason: 'Changed from the administrator console',
                        });
                        await refresh();
                        setNotice(`${flag.key} ${flag.enabled ? 'disabled' : 'enabled'}.`);
                      })
                    }
                  >
                    {flag.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { formatMinor } from '../lib/money';
import type { Provider } from '../lib/provider';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { BillWorkspace } from '../components/BillWorkspace';
import { ProviderQr } from '../components/ProviderQr';
type Organization = { id: string; name: string; role: string };
type Bill = {
  id: string;
  reference: string | null;
  currency: string;
  total_amount_minor: number;
  status: string;
  revision: number | null;
};
export function ProviderPage({ screen: screenOverride }: { screen?: string } = {}) {
  const [searchParams] = useSearchParams();
  const [portal, setPortal] = useState<{ organizations: Organization[]; providers: Provider[] }>();
  const [organization, setOrganization] = useState('');
  const [selected, setSelected] = useState('');
  const [bills, setBills] = useState<Bill[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [license, setLicense] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [association, setAssociation] = useState('');
  const keys = useRef(new Map<string, string>());
  const lock = useRef(false);
  const p = portal?.providers.find((p) => p.organization_id === organization);
  const providerId = p?.id;
  const canManage = portal?.organizations.some(
    (o) => o.id === organization && ['organization_admin', 'provider_manager'].includes(o.role),
  );
  const screen = screenOverride ?? searchParams.get('screen') ?? 'dashboard';
  const showProfile = screen === 'dashboard' || screen === 'profile';
  const showPayments = screen === 'dashboard' || screen === 'payments';
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiGet<NonNullable<typeof portal>>('/api/provider/portal')
      .then((d) => {
        if (active) {
          setPortal(d);
          setOrganization((v) => v || d.organizations[0]?.id || '');
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);
  useEffect(() => {
    setName(p?.legal_name ?? '');
    setLicense(p?.license_number ?? '');
    setAddress(p?.address.line ?? '');
    setPhone(p?.address.phone ?? '');
    setSelected('');
  }, [p?.id, p?.legal_name, p?.license_number, p?.address.line, p?.address.phone, organization]);
  useEffect(() => {
    let active = true;
    setBills([]);
    if (providerId)
      apiGet<{ bills: Bill[] }>(`/api/provider/profiles/${providerId}/bills`)
        .then((d) => {
          if (active) setBills(d.bills);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [providerId, version]);
  async function act(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section className="workspace flow-layout">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="hospital" size={15} /> Institutional access
          </p>
          <h1>
            {screen === 'verify-patient'
              ? 'Verify patient authorization'
              : screen === 'payments'
                ? 'Payment requests'
                : screen === 'profile'
                  ? 'Provider profile'
                  : 'Healthcare provider portal'}
          </h1>
          <p>
            Organization membership and a recently verified authenticator are required. Every bill
            remains associated with its customer.
          </p>
        </div>
      </div>
      {loading && <Feedback kind="loading" title="Loading provider access…" />}
      {error && (
        <Feedback kind="error" title={error}>
          <Link className="text-link" to="/account/security">
            Sign in, accept an invitation, or verify MFA
          </Link>
          <button className="btn btn--ghost" onClick={() => setVersion((v) => v + 1)}>
            Retry portal
          </button>
        </Feedback>
      )}
      {notice && <Feedback kind="success" title={notice} />}{' '}
      {busy && <Feedback kind="loading" title="Saving…" />}
      {portal && !portal.organizations.length && (
        <Feedback title="No authorized provider organizations">
          <p>
            Submit organization onboarding or accept an invitation through your security profile.
            Selecting this portal does not grant access.
          </p>
          <Link className="text-link" to="/account/security">
            Organization onboarding and invitations
          </Link>
        </Feedback>
      )}
      {!!portal?.organizations.length && (
        <>
          <label htmlFor="provider-organization">Organization</label>
          <select
            id="provider-organization"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
          >
            {[...new Map(portal.organizations.map((o) => [o.id, o])).values()].map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {screen === 'verify-patient' && (
            <Feedback title="Patient authorization is required">
              <p>
                Ask the customer to select this verified facility in Pay Provider and provide their
                one-use association code. The portal does not support name-only patient lookup or
                disclose balances.
              </p>
            </Feedback>
          )}
          {showProfile && (
            <>
              <article className="panel">
                <h2>Organizational provider profile</h2>
                <p>
                  Verification: <strong>{p?.status ?? 'Profile not submitted'}</strong>. Only
                  current evidence-based verification permits live payment.
                </p>
                {canManage ? (
                  <form
                    className="app-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        await apiPost('/api/provider/profiles', {
                          organizationId: organization,
                          legalName: name,
                          licenseNumber: license,
                          address: { line: address, phone },
                        });
                        setNotice(
                          'Profile saved. Licensed detail changes require a new verification review.',
                        );
                      });
                    }}
                  >
                    <label htmlFor="provider-name">Licensed provider name</label>
                    <input
                      id="provider-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <label htmlFor="provider-license">License or registration number</label>
                    <input
                      id="provider-license"
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                      required
                    />
                    <label htmlFor="provider-address">Public practice address</label>
                    <input
                      id="provider-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                    />
                    <label htmlFor="provider-phone">
                      Public contact phone (international format)
                    </label>
                    <input
                      id="provider-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                    <button className="btn btn--primary" disabled={busy}>
                      Save profile for verification
                    </button>
                  </form>
                ) : (
                  <p>
                    {p?.legal_name} · {p?.address.line}
                  </p>
                )}
                {p && <ProviderQr id={p.id} />}
              </article>
              {canManage && (
                <StaffManager
                  key={organization}
                  organization={organization}
                  role={
                    portal.organizations.some(
                      (o) => o.id === organization && o.role === 'organization_admin',
                    )
                      ? 'organization_admin'
                      : 'provider_manager'
                  }
                />
              )}
            </>
          )}
          {p && showPayments && (
            <>
              <article className="panel">
                <h2>Create an itemized customer bill</h2>
                <label htmlFor="association-code">Customer's one-use association code</label>
                <input
                  id="association-code"
                  value={association}
                  onChange={(e) => setAssociation(e.target.value.trim())}
                  autoComplete="off"
                />
                <p>
                  Ask the customer to choose your verified provider profile in Pay for Care and
                  generate this code. Do not use someone else's code.
                </p>
                <InvoiceEditor
                  busy={busy}
                  onSubmit={(invoice) =>
                    void act(async () => {
                      const body = { providerId: p.id, associationToken: association, invoice };
                      const signature = JSON.stringify(body);
                      let key = keys.current.get(signature);
                      if (!key) {
                        key = crypto.randomUUID();
                        keys.current.set(signature, key);
                      }
                      const r = await apiPost<{ billId: string }>('/api/provider/bills', {
                        ...body,
                        key,
                      });
                      keys.current.delete(signature);
                      setSelected(r.billId);
                      setAssociation('');
                      setNotice(
                        'Bill created for the customer who authorized the association. Attach supporting evidence below.',
                      );
                    })
                  }
                />
              </article>
              <article className="panel">
                <h2>Bills and payment status</h2>
                {!bills.length && <p>No bills for this organization yet.</p>}
                {bills.map((b) => (
                  <p key={b.id}>
                    <button className="btn btn--ghost" onClick={() => setSelected(b.id)}>
                      {b.reference ?? 'Legacy bill'} ·{' '}
                      {formatMinor(String(b.total_amount_minor), b.currency)} · {b.status}
                    </button>
                  </p>
                ))}
              </article>
              {selected && (
                <BillWorkspace
                  key={selected}
                  id={selected}
                  institution
                  onChange={() => setVersion((v) => v + 1)}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function StaffManager({ organization, role }: { organization: string; role: string }) {
  const [members, setMembers] = useState<
    { id: string; user_id: string; role: string; status: string }[]
  >([]);
  const [version, setVersion] = useState(0);
  const [phone, setPhone] = useState('');
  const [chosen, setChosen] = useState('provider_staff');
  const [invite, setInvite] = useState<{ id: string; token?: string; invitationToken?: string }>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    apiGet<{ members: typeof members }>(`/api/organizations/${organization}/members`)
      .then((d) => {
        if (active) setMembers(d.members);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [organization, version]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel">
      <h2>Authorized staff</h2>
      {error && <Feedback kind="error" title={error} />}{' '}
      {notice && <Feedback kind="success" title={notice} />}
      <form
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            setInvite(
              await apiPost(`/api/organizations/${organization}/invitations`, {
                phone,
                role: chosen,
              }),
            );
            setNotice(
              'Invitation created. Share the private token directly with the intended colleague.',
            );
          });
        }}
      >
        <label htmlFor="staff-phone">Colleague's phone</label>
        <input
          id="staff-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <label htmlFor="staff-role">Role to invite</label>
        <select id="staff-role" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="provider_staff">Provider staff</option>
          {role === 'organization_admin' && (
            <>
              <option value="provider_manager">Provider manager</option>
              <option value="organization_admin">Organization administrator</option>
            </>
          )}
        </select>
        <button className="btn btn--primary" disabled={busy}>
          Create staff invitation
        </button>
      </form>
      {invite && (
        <p>
          Private invitation token: <code>{invite.token ?? invite.invitationToken}</code>
        </p>
      )}
      {members.map((m) => (
        <div key={m.id}>
          <p>
            {m.user_id} · {m.role} · {m.status}
          </p>
          {(role === 'organization_admin' || m.role === 'provider_staff') && (
            <div className="button-row">
              {['suspended', 'revoked', 'active']
                .filter((status) => status !== m.status)
                .map((status) => (
                  <button
                    key={status}
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await apiPatch(`/api/organizations/${organization}/members/${m.id}`, {
                          status,
                        });
                        setNotice(
                          `Membership ${status}. Existing sessions and invitations are revoked by the server.`,
                        );
                      })
                    }
                  >
                    {status === 'active'
                      ? 'Restore membership'
                      : status === 'revoked'
                        ? 'Revoke access'
                        : 'Suspend access'}
                  </button>
                ))}
            </div>
          )}
        </div>
      ))}
    </article>
  );
}

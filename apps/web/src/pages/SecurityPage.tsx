import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
type Session = {
  userId: string;
  authMethod: string;
  mfaVerifiedUntil: string | null;
  memberships: Array<{ id: string; organization_id: string; role: string; name: string }>;
};
type Customer = {
  profile: { display_name: string | null; verification_status: string };
  reviews: Array<{ status: string; note: string; created_at: string }>;
};
export function SecurityPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [oldPhone, setOldPhone] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [invite, setInvite] = useState('');
  const [organization, setOrganization] = useState('');
  const [kind, setKind] = useState('provider');
  const [registration, setRegistration] = useState('');
  const [dependentName, setDependentName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [caregiver, setCaregiver] = useState('');
  const [dependentId, setDependentId] = useState('');
  const [documents, setDocuments] = useState(false);
  const [dependents, setDependents] = useState<Array<{ id: string; display_name: string }>>([]);
  const [grants, setGrants] = useState<
    Array<{ id: string; caregiver_user_id: string; revoked_at: string | null }>
  >([]);
  const refresh = useCallback(async () => {
    const [s, c, d, g] = await Promise.all([
      apiGet<Session>('/api/security/session'),
      apiGet<Customer>('/api/customers/me'),
      apiGet<{ dependents: typeof dependents }>('/api/dependents'),
      apiGet<{ authorizations: typeof grants }>('/api/care-authorizations'),
    ]);
    setSession(s);
    setCustomer(c);
    setDisplayName(c.profile.display_name ?? '');
    setDependents(d.dependents);
    setGrants(g.authorizations);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void apiGet<Session>('/api/security/session')
      .then(async () => {
        if (active) await refresh();
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : 'Unable to load account security.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry, refresh]);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete the action. Try again.');
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent, work: () => Promise<void>) {
    event.preventDefault();
    void perform(work);
  }
  return (
    <section className="workspace">
      <div>
        <p className="eyebrow">
          <Icon name="shield" size={15} /> Your account
        </p>
        <h1>Profile, security & access</h1>
        <p>Permissions are checked by the server. Demo previews never grant access.</p>
        <Link className="text-link" to="/account">
          ← Sign-in & consent records
        </Link>
      </div>
      <div aria-live="polite">{notice && <Feedback kind="success" title={notice} />}</div>
      {error && <Feedback kind="error" title={error} />}{' '}
      {loading ? (
        <Feedback kind="loading" title="Loading your account…" />
      ) : !session ? (
        <Feedback kind="unavailable" title="Sign in to manage account access">
          <Link className="btn btn--primary" to="/account">
            Sign in
          </Link>
          <button className="btn btn--ghost" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </Feedback>
      ) : (
        <>
          <div className="dashboard-grid">
            <article className="panel">
              <h2>Customer profile</h2>
              <p>
                Verification: <strong>{customer?.profile.verification_status}</strong>
              </p>
              <p className="muted">
                Account ID: <span className="account-id">{session.userId}</span>
              </p>
              <form
                className="app-form"
                onSubmit={(event) =>
                  submit(event, async () => {
                    await apiPatch('/api/customers/me', { displayName, preferredLanguage: 'en' });
                    await refresh();
                    setNotice('Profile updated.');
                  })
                }
              >
                <label htmlFor="display-name">Display name</label>
                <input
                  id="display-name"
                  required
                  maxLength={200}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <button className="btn btn--primary" disabled={busy}>
                  Save profile
                </button>
              </form>
              {customer?.reviews.map((review, index) => (
                <p key={index}>
                  {review.status} · {review.note}
                </p>
              ))}
            </article>
            <article className="panel">
              <h2>Authenticator</h2>
              <p>Institutional access requires a phone session and a recent authenticator code.</p>
              <p>
                {session.mfaVerifiedUntil && new Date(session.mfaVerifiedUntil) > new Date()
                  ? `Verified until ${new Date(session.mfaVerifiedUntil).toLocaleTimeString()}`
                  : 'Authenticator verification required for institutional actions.'}
              </p>
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const result = await apiPost<{ secret: string }>(
                      '/api/security/mfa/enroll',
                      {},
                    );
                    setSecret(result.secret);
                    setNotice(
                      'Add this setup key to your authenticator, then verify a code within ten minutes.',
                    );
                  })
                }
              >
                Set up authenticator
              </button>
              {secret && (
                <p className="security-secret">
                  Setup key: <code>{secret}</code>
                </p>
              )}
              <form
                className="app-form"
                onSubmit={(event) =>
                  submit(event, async () => {
                    await apiPost('/api/security/mfa/verify', { code });
                    setCode('');
                    setSecret('');
                    await refresh();
                    setNotice('Authenticator verified for 15 minutes.');
                  })
                }
              >
                <label htmlFor="authenticator-code">Six-digit authenticator code</label>
                <input
                  id="authenticator-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button className="btn btn--primary" disabled={busy}>
                  Verify authenticator
                </button>
              </form>
            </article>
          </div>
          <article className="panel">
            <h2>Recovery & sessions</h2>
            <p>
              Sign in again before changing security settings. Save recovery codes offline; each
              works once. Generating a new set revokes the previous set.
            </p>
            <div className="button-row">
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const result = await apiPost<{ codes: string[] }>(
                      '/api/security/recovery-codes',
                      {},
                    );
                    setRecoveryCodes(result.codes);
                    setNotice('Recovery codes generated. Save them now; they are not shown again.');
                  })
                }
              >
                Generate recovery codes
              </button>
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await apiPost('/api/security/sessions/revoke', {});
                    setSession(null);
                    setSecret('');
                    setRecoveryCodes([]);
                    setNotice('All sessions revoked. Sign in again to continue.');
                  })
                }
              >
                Sign out on all devices
              </button>
            </div>
            {recoveryCodes.length > 0 && (
              <div className="security-secret">
                <ul>
                  {recoveryCodes.map((value) => (
                    <li key={value}>
                      <code>{value}</code>
                    </li>
                  ))}
                </ul>
                <button className="btn btn--ghost" onClick={() => setRecoveryCodes([])}>
                  I saved these codes · hide
                </button>
              </div>
            )}
            <details>
              <summary>Recover an account after losing a phone number</summary>
              <p>
                First sign in with your new phone number. Use a fresh account without existing
                records, then provide one recovery code from your old account. All existing sessions
                will be revoked; authenticator requirements stay in place.
              </p>
              <form
                className="app-form"
                onSubmit={(event) =>
                  submit(event, async () => {
                    await apiPost('/api/security/recover', { oldPhone, recoveryCode });
                    setRecoveryCode('');
                    setSession(null);
                    setNotice('Account recovered. Sign in with your new number.');
                  })
                }
              >
                <label htmlFor="old-phone">Previous phone number</label>
                <input
                  id="old-phone"
                  type="tel"
                  required
                  pattern="\+[1-9][0-9]{7,14}"
                  value={oldPhone}
                  onChange={(e) => setOldPhone(e.target.value)}
                />
                <label htmlFor="recovery-code">Recovery code</label>
                <input
                  id="recovery-code"
                  type="password"
                  required
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  autoComplete="off"
                />
                <button className="btn btn--primary" disabled={busy}>
                  Recover account
                </button>
              </form>
            </details>
            <details>
              <summary>Lost your authenticator?</summary>
              <form
                className="app-form"
                onSubmit={(event) =>
                  submit(event, async () => {
                    await apiPost('/api/security/mfa/reset', { recoveryCode });
                    setRecoveryCode('');
                    setSession(null);
                    setNotice('Authenticator reset. Sign in and enroll a new authenticator.');
                  })
                }
              >
                <label htmlFor="mfa-recovery">One unused recovery code</label>
                <input
                  id="mfa-recovery"
                  required
                  type="password"
                  autoComplete="off"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                />
                <button className="btn btn--ghost" disabled={busy}>
                  Reset authenticator & revoke sessions
                </button>
              </form>
            </details>
          </article>
          <div className="dashboard-grid">
            <article className="panel">
              <h2>Dependents</h2>
              <form
                className="app-form"
                onSubmit={(event) =>
                  submit(event, async () => {
                    await apiPost('/api/dependents', {
                      displayName: dependentName,
                      relationship,
                      guardianAttestation: true,
                    });
                    setDependentName('');
                    await refresh();
                    setNotice('Dependent added to your account.');
                  })
                }
              >
                <label htmlFor="dependent-name">Dependent name</label>
                <input
                  id="dependent-name"
                  required
                  maxLength={200}
                  value={dependentName}
                  onChange={(e) => setDependentName(e.target.value)}
                />
                <label htmlFor="relationship">Your relationship</label>
                <input
                  id="relationship"
                  required
                  maxLength={80}
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                />
                <label className="account__check">
                  <input type="checkbox" required />I am authorized to act as this dependent’s
                  guardian.
                </label>
                <button className="btn btn--primary" disabled={busy}>
                  Add dependent
                </button>
              </form>
            </article>
            <article className="panel">
              <h2>Caregiver authorization</h2>
              <p>
                Share only the selected subject’s records. Medical document access needs a separate
                explicit choice. Grants expire after 30 days and can be revoked sooner.
              </p>
              <form
                className="app-form"
                onSubmit={(event) =>
                  submit(event, async () => {
                    await apiPost('/api/care-authorizations', {
                      caregiverUserId: caregiver,
                      dependentId: dependentId || null,
                      scopes: documents ? ['records:read', 'documents:read'] : ['records:read'],
                      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
                    });
                    await refresh();
                    setNotice('Caregiver authorization recorded.');
                  })
                }
              >
                <label htmlFor="caregiver-id">Caregiver’s account ID</label>
                <input
                  id="caregiver-id"
                  required
                  value={caregiver}
                  onChange={(e) => setCaregiver(e.target.value)}
                />
                <label htmlFor="care-subject">Whose records may be viewed?</label>
                <select
                  id="care-subject"
                  value={dependentId}
                  onChange={(e) => setDependentId(e.target.value)}
                >
                  <option value="">My records only</option>
                  {dependents.map((dependent) => (
                    <option value={dependent.id} key={dependent.id}>
                      {dependent.display_name}
                    </option>
                  ))}
                </select>
                <label className="account__check">
                  <input
                    type="checkbox"
                    checked={documents}
                    onChange={(e) => setDocuments(e.target.checked)}
                  />
                  Also allow medical document downloads
                </label>
                <button className="btn btn--primary" disabled={busy}>
                  Authorize for 30 days
                </button>
              </form>
              <ul className="activity-list">
                {grants
                  .filter((grant) => !grant.revoked_at)
                  .map((grant) => (
                    <li key={grant.id}>
                      <span className="account-id">Caregiver {grant.caregiver_user_id}</span>
                      <button
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await apiDelete(`/api/care-authorizations/${grant.id}`);
                            await refresh();
                            setNotice('Authorization revoked.');
                          })
                        }
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
              </ul>
            </article>
          </div>
          <article className="panel">
            <h2>Institutional access</h2>
            <ul>
              {session.memberships.map((member) => (
                <li key={member.id}>
                  {member.name} · {member.role}
                </li>
              ))}
            </ul>
            <form
              className="app-form"
              onSubmit={(event) =>
                submit(event, async () => {
                  await apiPost('/api/invitations/accept', { token: invite });
                  setInvite('');
                  await refresh();
                  setNotice('Invitation accepted. Membership is now active.');
                })
              }
            >
              <label htmlFor="invitation">Private organization invitation token</label>
              <input
                id="invitation"
                type="password"
                autoComplete="off"
                required
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
              />
              <button className="btn btn--primary" disabled={busy}>
                Accept invitation
              </button>
            </form>
            <details>
              <summary>Apply for organization or provider onboarding</summary>
              <p>
                Applications require independent verification. Submitting an application does not
                grant staff or administrator permissions.
              </p>
              <form
                className="app-form"
                onSubmit={(event) =>
                  submit(event, async () => {
                    await apiPost('/api/organizations', {
                      name: organization,
                      kind,
                      registrationNumber: registration,
                    });
                    setNotice(
                      'Application submitted for verification. No institutional role has been granted.',
                    );
                  })
                }
              >
                <label htmlFor="organization-name">Registered organization name</label>
                <input
                  id="organization-name"
                  required
                  maxLength={200}
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                />
                <label htmlFor="organization-kind">Organization type</label>
                <select
                  id="organization-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="provider">Healthcare provider</option>
                  <option value="sponsor">Organization / sponsor</option>
                  <option value="partner">Partner</option>
                </select>
                <label htmlFor="registration">Registration or license number</label>
                <input
                  id="registration"
                  required
                  maxLength={100}
                  value={registration}
                  onChange={(e) => setRegistration(e.target.value)}
                />
                <button className="btn btn--primary" disabled={busy}>
                  Submit for verification
                </button>
              </form>
            </details>
          </article>
        </>
      )}
      {busy && <Feedback kind="loading" title="Saving your request…" />}
    </section>
  );
}

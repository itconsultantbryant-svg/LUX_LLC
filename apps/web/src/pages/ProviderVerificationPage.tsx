import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import type { Provider } from '../lib/provider';
import { Feedback } from '../components/Feedback';
export function ProviderVerificationPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('verified');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [days, setDays] = useState('90');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    apiGet<{ providers: Provider[] }>('/api/admin/providers')
      .then((d) => {
        if (active) {
          setProviders(d.providers);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version]);
  return (
    <section className="workspace flow-layout">
      <h1>Provider verification review</h1>
      <p>
        Platform administrator access and recent MFA are required. Verify registration against
        independent external evidence. Never approve from an AI guess or review your own
        organization.
      </p>
      {error && (
        <Feedback kind="error" title={error}>
          <Link className="text-link" to="/account/security">
            Verify access and MFA
          </Link>
          <button className="btn btn--ghost" onClick={() => setVersion((v) => v + 1)}>
            Retry
          </button>
        </Feedback>
      )}
      {message && <Feedback kind="success" title={message} />}
      <form
        className="panel app-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            await apiPost(`/api/admin/providers/${selected}/reviews`, {
              status,
              note,
              evidenceReference: reference,
              validDays: Number(days),
            });
            setMessage('Independent verification review recorded with its evidence and expiry.');
            setVersion((v) => v + 1);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="review-provider">Provider to review</label>
        <select
          id="review-provider"
          required
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Select a provider</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.legal_name} · {p.license_number} · {p.status}
            </option>
          ))}
        </select>
        <label htmlFor="verification-decision">Decision</label>
        <select
          id="verification-decision"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="verified">Verified from independent evidence</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
        <label htmlFor="verification-evidence">
          Registry reference or external evidence reference
        </label>
        <input
          id="verification-evidence"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          minLength={8}
          maxLength={500}
          required
        />
        <label htmlFor="verification-note">Verification checks and findings</label>
        <textarea
          id="verification-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          minLength={8}
          maxLength={2000}
          required
        />
        <label htmlFor="verification-days">Validity (days, maximum 365)</label>
        <input
          id="verification-days"
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          required
        />
        <label>
          <input type="checkbox" required /> I personally checked the external evidence and am
          independent of this provider.
        </label>
        <button className="btn btn--primary" disabled={busy || !selected}>
          {busy ? 'Recording review…' : 'Record verification decision'}
        </button>
      </form>
    </section>
  );
}

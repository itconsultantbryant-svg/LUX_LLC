import { useEffect, useState, type FormEvent } from 'react';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet, apiPost } from '../lib/api';

type LinkRecord = {
  id: string;
  beneficiary_label: string;
  currencies: string[];
  categories: string[];
  expires_at: string;
  revoked_at: string | null;
};

type FundingSnapshot = { links: LinkRecord[] };

export function CustomerReceiveFundsPage() {
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [label, setLabel] = useState('My HealthWallet');
  const [days, setDays] = useState('30');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const data = await apiGet<FundingSnapshot>('/api/funding');
    setLinks(data.links);
  };

  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiPost<{ token: string; expires_at: string }>('/api/funding/links', {
        key: crypto.randomUUID(),
        label: label.trim(),
        currencies: ['LRD', 'USD'],
        categories: ['consultation', 'medication', 'diagnostics', 'general'],
        expiresInDays: Number(days),
      });
      const shareUrl = `${window.location.origin}/contribute#${result.token}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        setMessage('Contribution link created and copied.');
      } catch {
        setMessage(`Contribution link created: ${shareUrl}`);
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create a contribution link.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      await apiPost(`/api/funding/links/${id}/revoke`, {});
      await refresh();
      setMessage('Contribution link revoked.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not revoke this link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="users" size={15} /> Customer wallet
          </p>
          <h1>Receive Funds</h1>
          <p>Create a private link for approved contributors.</p>
        </div>
      </header>
      {message && <Feedback kind="success" title={message} />}
      {error && <Feedback kind="error" title={error} />}
      <form className="panel app-form" onSubmit={create}>
        <h2>New contribution link</h2>
        <label htmlFor="contribution-label">Label</label>
        <input
          id="contribution-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={30}
          required
        />
        <label htmlFor="contribution-expiry">Expires in</label>
        <select
          id="contribution-expiry"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        >
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create link'}
        </button>
      </form>
      <article className="panel">
        <h2>Your contribution links</h2>
        {!links.length ? (
          <p className="muted">No contribution links yet.</p>
        ) : (
          <ul className="activity-list">
            {links.map((link) => (
              <li key={link.id}>
                <div>
                  <strong>{link.beneficiary_label}</strong>
                  <small>
                    {link.currencies.join(', ')} · expires{' '}
                    {new Date(link.expires_at).toLocaleDateString()}
                  </small>
                </div>
                {link.revoked_at ? (
                  <span className="badge badge--pending">revoked</span>
                ) : (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => void revoke(link.id)}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { formatMinor } from '../lib/money';
import { Feedback } from '../components/Feedback';

type Finding = { code: string; severity: string; message: string; field: string | null };
type ReviewCase = {
  id: string;
  bill_id: string | null;
  provider_legal_name: string | null;
  bill_provider: string | null;
  currency: string | null;
  total_amount_minor: number | null;
  status: string;
  reason: string;
  decision: string | null;
  created_at: string;
  resolved_at: string | null;
  findings: Finding[];
};
type Reviews = { cases: ReviewCase[]; mode: string };

export function InstitutionalReviewsPage() {
  const [data, setData] = useState<Reviews>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiGet<Reviews>('/api/admin/reviews')
      .then((value) => {
        if (active) setData(value);
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
  }, [reload]);
  async function decide(id: string, decision: 'approve' | 'reject' | 'return', note: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiPost(`/api/admin/reviews/${id}/${decision}`, { note });
      setMessage(`Review marked ${decision}.`);
      setReload((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be recorded.');
    } finally {
      setBusy(false);
    }
  }
  const open = data?.cases.filter((c) => c.status === 'open') ?? [];
  const resolved = data?.cases.filter((c) => c.status === 'resolved') ?? [];
  return (
    <section className="workspace flow-layout">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Institutional console</p>
          <h1>Review queue</h1>
          <p>
            Documents the AI read and could not fully confirm. Decide to validate the bill, reject
            it, or return it for correction. Requires an authorized reviewer with MFA.
          </p>
        </div>
      </div>
      {loading && <Feedback kind="loading" title="Loading review queue…" />}
      {error && (
        <Feedback kind="error" title={error}>
          <div className="button-row">
            <button className="btn btn--ghost" onClick={() => setReload((v) => v + 1)}>
              Reload reviews
            </button>
            <Link className="text-link" to="/account/security">
              Security &amp; organization access
            </Link>
          </div>
        </Feedback>
      )}
      {message && <Feedback kind="success" title={message} />}
      {data && (
        <>
          <aside className="panel">
            Extraction mode <strong>{data.mode}</strong>. Sandbox findings are simulated; they never
            assert a live partner result.
          </aside>
          {open.length === 0 && !error && (
            <Feedback title="No open reviews">
              <p>Every extracted document has been decided.</p>
            </Feedback>
          )}
          {open.map((c) => (
            <ReviewCard key={c.id} c={c} busy={busy} decide={decide} />
          ))}
          {resolved.length > 0 && (
            <details>
              <summary>Resolved reviews ({resolved.length})</summary>
              {resolved.map((c) => (
                <article key={c.id} className="panel">
                  <h2>
                    Review {c.id.slice(0, 8)} · {c.decision}
                  </h2>
                  <p>
                    Reason: {c.reason}. Resolved {new Date(c.resolved_at ?? '').toLocaleString()}.
                  </p>
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}

function ReviewCard({
  c,
  busy,
  decide,
}: {
  c: ReviewCase;
  busy: boolean;
  decide: (id: string, decision: 'approve' | 'reject' | 'return', note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <article className="panel">
      <h2>Review {c.id.slice(0, 8)}</h2>
      <dl className="review-list">
        <div>
          <dt>Provider</dt>
          <dd>{c.provider_legal_name ?? c.bill_provider ?? 'Not associated'}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>
            {c.total_amount_minor === null
              ? '—'
              : formatMinor(String(c.total_amount_minor), c.currency ?? 'LRD')}
          </dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{c.reason}</dd>
        </div>
        <div>
          <dt>Opened</dt>
          <dd>{new Date(c.created_at).toLocaleString()}</dd>
        </div>
      </dl>
      <h3>Findings</h3>
      {c.findings.length === 0 && <p>No findings recorded for this case.</p>}
      <ul>
        {c.findings.map((f, i) => (
          <li key={i}>
            <strong>{f.code}</strong> ({f.severity}){f.field ? ` · ${f.field}` : ''} — {f.message}
          </li>
        ))}
      </ul>
      <label htmlFor={`note-${c.id}`}>Reviewer note</label>
      <textarea
        id={`note-${c.id}`}
        rows={2}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="button-row">
        <button
          className="btn btn--primary"
          disabled={busy}
          onClick={() => decide(c.id, 'approve', note)}
        >
          Approve bill
        </button>
        <button
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => decide(c.id, 'return', note)}
        >
          Return for correction
        </button>
        <button
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => decide(c.id, 'reject', note)}
        >
          Reject
        </button>
      </div>
    </article>
  );
}

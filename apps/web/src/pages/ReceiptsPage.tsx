import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { formatMinor } from '../lib/money';

type Receipt = {
  id: string;
  number: string;
  kind: string;
  direction: string;
  status: string;
  from: { userId: string | null; label: string };
  to: { userId: string | null; label: string };
  amountMinor: string;
  currency: string;
  reference: string | null;
  reversalOfId: string | null;
  reversedById: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  issuedAt: string;
};

export function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await apiGet<{ receipts: Receipt[] }>('/api/receipts?limit=100');
    setReceipts(data.receipts);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load receipts.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="receipt" size={15} /> Receipts
          </p>
          <h1>Transaction receipts</h1>
        </div>
      </div>
      {loading && <Feedback kind="loading" title="Loading your receipts…" />}
      {error && <Feedback kind="error" title={error} />}
      {!loading && !error && receipts.length === 0 && (
        <Feedback kind="unavailable" title="No receipts yet">
          <p>Your completed transactions will appear here.</p>
        </Feedback>
      )}
      {receipts.length > 0 && (
        <div className="dashboard-grid">
          <article className="panel">
            <h2>All receipts</h2>
            <ul className="activity-list">
              {receipts.map((receipt) => (
                <li key={receipt.id}>
                  <div>
                    <strong>{receipt.number}</strong>
                    <p>
                      {receipt.from.label} → {receipt.to.label}
                    </p>
                    <small>
                      {new Date(receipt.issuedAt).toLocaleString()} · {receipt.status}
                    </small>
                  </div>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setSelected(receipt)}
                  >
                    Track
                  </button>
                </li>
              ))}
            </ul>
          </article>
          {selected && (
            <article className="panel">
              <h2>Receipt {selected.number}</h2>
              <dl>
                <dt>Type</dt>
                <dd>
                  {selected.kind} · {selected.direction}
                </dd>
                <dt>Status</dt>
                <dd>{selected.status}</dd>
                <dt>From</dt>
                <dd>{selected.from.label}</dd>
                <dt>To</dt>
                <dd>{selected.to.label}</dd>
                <dt>Amount</dt>
                <dd>{formatMinor(selected.amountMinor, selected.currency)}</dd>
                {selected.reference && (
                  <>
                    <dt>Reference</dt>
                    <dd>{selected.reference}</dd>
                  </>
                )}
                <dt>Issued</dt>
                <dd>{new Date(selected.issuedAt).toLocaleString()}</dd>
                {selected.revokedAt && (
                  <>
                    <dt>Revoked</dt>
                    <dd>
                      {new Date(selected.revokedAt).toLocaleString()} · {selected.revokeReason}
                    </dd>
                  </>
                )}
              </dl>
              <button className="btn btn--ghost" type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </article>
          )}
        </div>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import type { Provider } from '../lib/provider';
import { formatMinor } from '../lib/money';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { ProviderScanner } from '../components/ProviderQr';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { BillWorkspace } from '../components/BillWorkspace';
export function CarePage() {
  const [params] = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState(params.get('provider') ?? '');
  const [bills, setBills] = useState<
    {
      id: string;
      provider_name: string;
      total_amount_minor: number;
      currency: string;
      reference: string;
    }[]
  >([]);
  const [selected, setSelected] = useState('');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<{ token: string; expiresAt: string }>();
  const keys = useRef(new Map<string, string>());
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiGet<{ providers: Provider[] }>('/api/providers/directory'),
      apiGet<{ bills: typeof bills }>('/api/care/bills'),
    ])
      .then(([p, b]) => {
        if (active) {
          setProviders(p.providers);
          setBills(b.bills);
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
  // Keep the provider directory live so a newly verified provider appears
  // without a manual reload, without disturbing the selected provider or bills.
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      void Promise.all([
        apiGet<{ providers: Provider[] }>('/api/providers/directory'),
        apiGet<{ bills: typeof bills }>('/api/care/bills'),
      ])
        .then(([p, b]) => {
          if (active) {
            setProviders(p.providers);
            setBills(b.bills);
          }
        })
        .catch(() => {
          /* transient; the next poll recovers */
        });
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const p = providers.find((p) => p.id === providerId);
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
            <Icon name="receipt" size={15} /> Healthcare bills
          </p>
          <h1>Pay for Care</h1>
          <p>
            Select a verified provider, review your bill, and confirm the amount before requesting
            payment.
          </p>
        </div>
      </div>
      {loading && <Feedback kind="loading" title="Checking providers and bills…" />}
      {error && (
        <Feedback kind="error" title={error}>
          <Link className="text-link" to="/account" state={{ returnTo: '/pay' }}>
            Customer sign in
          </Link>
          <button className="btn btn--ghost" onClick={() => setVersion((v) => v + 1)}>
            Retry
          </button>
        </Feedback>
      )}
      {notice && <Feedback kind="success" title={notice} />}{' '}
      {busy && <Feedback kind="loading" title="Saving your request…" />}
      <ProviderScanner
        onSelect={(id) => {
          setProviderId(id);
          setCode(undefined);
          setNotice('QR read. Check the provider name and current verification below.');
        }}
      />
      <article className="panel">
        <h2>Verified provider directory</h2>
        {!loading && !providers.length && (
          <Feedback title="No currently verified providers">
            <p>
              Verification requires an independent authorized review. A QR code or AI guess cannot
              grant verified status.
            </p>
          </Feedback>
        )}
        <label htmlFor="care-provider">Provider</label>
        <select
          id="care-provider"
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value);
            setCode(undefined);
          }}
        >
          <option value="">Choose a verified provider</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.legal_name}
            </option>
          ))}
        </select>
        {providerId && !p && !loading && (
          <Feedback kind="unavailable" title="This provider is not currently eligible">
            <p>Do not continue with this QR code. Select a currently verified provider.</p>
          </Feedback>
        )}
        {p && (
          <>
            <h3>{p.legal_name}</h3>
            <p>
              License {p.license_number} · {p.address.line} · {p.address.phone}
            </p>
            <p>
              Verification valid until{' '}
              {p.valid_until && new Date(p.valid_until).toLocaleDateString()}.
            </p>
            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  setCode(await apiPost('/api/care/association', { providerId: p.id }));
                  setNotice(
                    'Association code created for this provider only. Share it privately with their staff.',
                  );
                })
              }
            >
              Let this provider create my bill
            </button>
            {code && (
              <div>
                <p>One-use code, expires {new Date(code.expiresAt).toLocaleTimeString()}:</p>
                <input
                  readOnly
                  aria-label="Private customer association code"
                  value={code.token}
                  onFocus={(e) => e.target.select()}
                />
                <p>This authorizes one bill association, not a payment.</p>
              </div>
            )}
          </>
        )}
      </article>
      {p && (
        <article className="panel">
          <h2>Photograph or upload your own bill</h2>
          <p>
            First enter the printed bill details below. Then attach a photo or document, review the
            provider and total, and ask the provider to confirm authenticity. No AI extraction is
            treated as verified.
          </p>
          <InvoiceEditor
            key={p.id}
            busy={busy}
            label="Save details and attach bill"
            onSubmit={(invoice) =>
              void act(async () => {
                const body = { providerId: p.id, invoice };
                const signature = JSON.stringify(body);
                let key = keys.current.get(signature);
                if (!key) {
                  key = crypto.randomUUID();
                  keys.current.set(signature, key);
                }
                const result = await apiPost<{ billId: string }>('/api/care/intake', {
                  ...body,
                  key,
                });
                keys.current.delete(signature);
                setSelected(result.billId);
                setNotice(
                  'Bill details saved. Attach the photograph or PDF below before continuing.',
                );
              })
            }
          />
        </article>
      )}
      <article className="panel">
        <h2>Your bills</h2>
        {!bills.length && !loading && <p>No bills yet.</p>}
        {bills.map((b) => (
          <p key={b.id}>
            <button className="btn btn--ghost" onClick={() => setSelected(b.id)}>
              {b.reference ?? b.provider_name} ·{' '}
              {formatMinor(String(b.total_amount_minor), b.currency)}
            </button>
          </p>
        ))}
      </article>
      {selected && (
        <BillWorkspace key={selected} id={selected} onChange={() => setVersion((v) => v + 1)} />
      )}
    </section>
  );
}

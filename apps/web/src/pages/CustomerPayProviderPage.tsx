import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BillWorkspace } from '../components/BillWorkspace';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet, apiPost } from '../lib/api';
import type { Provider } from '../lib/provider';

type Bill = {
  id: string;
  provider_name: string;
  reference: string | null;
  currency: string;
  total_amount_minor: number;
};
type Association = { token: string; expiresAt: string };

export function CustomerPayProviderPage() {
  const [params] = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>();
  const [bills, setBills] = useState<Bill[]>([]);
  const [providerId, setProviderId] = useState(params.get('provider') ?? '');
  const [association, setAssociation] = useState<Association>();
  const [selectedBill, setSelectedBill] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [directory, customerBills] = await Promise.all([
      apiGet<{ providers: Provider[] }>('/api/providers/directory'),
      apiGet<{ bills: Bill[] }>('/api/care/bills'),
    ]);
    setProviders(directory.providers);
    setBills(customerBills.bills);
  };

  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  async function createAssociation() {
    if (!providerId) return;
    setBusy(true);
    setError('');
    try {
      setAssociation(await apiPost<Association>('/api/care/association', { providerId }));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not create the provider authorization.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="credit-card" size={15} /> Customer care
          </p>
          <h1>Pay Provider</h1>
          <p>Select a verified provider and review your bill before payment.</p>
        </div>
      </header>
      {error && <Feedback kind="error" title={error} />}
      <article className="panel app-form">
        <h2>Choose provider</h2>
        <label htmlFor="pay-provider">Verified provider</label>
        <select
          id="pay-provider"
          value={providerId}
          onChange={(event) => {
            setProviderId(event.target.value);
            setAssociation(undefined);
          }}
        >
          <option value="">Select a provider</option>
          {providers?.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.legal_name}
            </option>
          ))}
        </select>
        <button
          className="btn btn--primary"
          disabled={busy || !providerId}
          onClick={() => void createAssociation()}
        >
          {busy ? 'Creating…' : 'Create provider code'}
        </button>
        {association && (
          <Feedback kind="success" title="Provider code ready">
            <p>
              Share this one-use code only with the selected provider. It expires{' '}
              {new Date(association.expiresAt).toLocaleTimeString()}.
            </p>
            <input
              readOnly
              aria-label="Provider authorization code"
              value={association.token}
              onFocus={(event) => event.currentTarget.select()}
            />
          </Feedback>
        )}
      </article>
      <article className="panel">
        <h2>Your bills</h2>
        {!bills.length ? (
          <p className="muted">No bills are ready for review.</p>
        ) : (
          <ul className="activity-list">
            {bills.map((bill) => (
              <li key={bill.id}>
                <div>
                  <strong>{bill.reference ?? bill.provider_name}</strong>
                  <small>{bill.provider_name}</small>
                </div>
                <button className="btn btn--ghost" onClick={() => setSelectedBill(bill.id)}>
                  Review
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>
      {selectedBill && (
        <BillWorkspace key={selectedBill} id={selectedBill} onChange={() => void refresh()} />
      )}
    </section>
  );
}

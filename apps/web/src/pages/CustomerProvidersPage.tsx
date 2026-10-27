import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet } from '../lib/api';
import type { Provider } from '../lib/provider';

export function CustomerProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiGet<{ providers: Provider[] }>('/api/providers/directory')
      .then((data) => active && setProviders(data.providers))
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return providers ?? [];
    return (providers ?? []).filter((provider) =>
      [provider.legal_name, provider.address.line, provider.address.phone]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [providers, query]);

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="hospital" size={15} /> Customer care
          </p>
          <h1>Providers</h1>
          <p>Verified providers available through HealthWallet.</p>
        </div>
      </header>
      {error && <Feedback kind="error" title={error} />}
      <article className="panel">
        <label htmlFor="provider-search">Search providers</label>
        <input
          id="provider-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or location"
        />
      </article>
      {!providers ? (
        <Feedback kind="loading" title="Loading providers…" />
      ) : !visible.length ? (
        <Feedback kind="unavailable" title="No verified providers found" />
      ) : (
        <article className="panel">
          <ul className="activity-list">
            {visible.map((provider) => (
              <li key={provider.id}>
                <div>
                  <strong>{provider.legal_name}</strong>
                  <small>{provider.address.line ?? 'Location not listed'}</small>
                  {provider.valid_until && (
                    <small>
                      Verified until {new Date(provider.valid_until).toLocaleDateString()}
                    </small>
                  )}
                </div>
                <Link
                  className="btn btn--ghost"
                  to={`/customer/pay?provider=${encodeURIComponent(provider.id)}`}
                >
                  Select
                </Link>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}

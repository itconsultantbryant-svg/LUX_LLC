import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import './StatusPage.css';

type Health = {
  status: string;
  appEnv: string;
  simulation: boolean;
  product: string;
  aiEngine: string;
  adapters: Record<string, { id: string; mode: string }>;
};

type Ready = {
  status: string;
  database: boolean;
  appEnv: string;
};

export function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setError(null);
    setHealth(null);
    setReady(null);
    let cancelled = false;
    async function load() {
      try {
        const [h, r] = await Promise.all([apiGet<Health>('/health'), apiGet<Ready>('/ready')]);
        if (!cancelled) {
          setHealth(h);
          setReady(r);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to reach API');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <section className="status">
      <h1>System status</h1>
      <p>Check the services supporting your HealthWallet experience.</p>
      {error ? (
        <div>
          <p className="status__error" role="alert">
            {error}
          </p>
          <button className="btn btn--ghost" onClick={() => setAttempt((value) => value + 1)}>
            Retry service check
          </button>
        </div>
      ) : null}
      {health ? (
        <div className="status__grid">
          <article>
            <h2>API</h2>
            <p>
              {health.product} · {health.status}
            </p>
            <p>
              Env <strong>{health.appEnv}</strong> · simulation{' '}
              <strong>{health.simulation ? 'yes' : 'no'}</strong>
            </p>
            <p>AI engine: {health.aiEngine}</p>
          </article>
          <article>
            <h2>Database</h2>
            <p>
              Ready: <strong>{ready?.database ? 'connected' : 'not ready'}</strong>
            </p>
          </article>
          <article>
            <h2>Adapters</h2>
            <ul>
              {Object.entries(health.adapters).map(([name, adapter]) => (
                <li key={name}>
                  <strong>{name}</strong>: {adapter.id} ({adapter.mode})
                </li>
              ))}
            </ul>
          </article>
        </div>
      ) : !error ? (
        <p role="status" aria-busy="true">
          Loading status…
        </p>
      ) : null}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/api';
import { Icon } from '../components/icons/Icon';
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

/** Live status refreshes on its own so operators never read a stale snapshot. */
const REFRESH_MS = 30_000;

export function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [h, r] = await Promise.all([apiGet<Health>('/health'), apiGet<Ready>('/ready')]);
      if (!active.current) return;
      setHealth(h);
      setReady(r);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!active.current) return;
      setError(err instanceof Error ? err.message : 'Unable to reach API');
    } finally {
      if (active.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return (
    <section className="status">
      <div className="status__head">
        <div>
          <p className="eyebrow">
            <Icon name="activity" size={15} /> Operations
          </p>
          <h1>System status</h1>
          <p>Check the services supporting your HealthWallet experience.</p>
        </div>
        <div className="status__live" role="status" aria-live="polite">
          <span className={`status__dot${error ? ' status__dot--down' : ''}`} aria-hidden="true" />
          <span>
            {error ? 'Reconnecting' : 'Live'} · every 30s
            {lastUpdated ? ` · ${lastUpdated.toLocaleTimeString()}` : ''}
          </span>
        </div>
      </div>
      {error ? (
        <div>
          <p className="status__error" role="alert">
            {error}
          </p>
          <button className="btn btn--ghost" disabled={refreshing} onClick={() => void load()}>
            Retry service check
          </button>
        </div>
      ) : null}
      {health ? (
        <div className="status__grid">
          <article>
            <h2>
              <Icon name="cpu" size={18} /> API
            </h2>
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
            <h2>
              <Icon name="wallet" size={18} /> Database
            </h2>
            <p>
              Ready: <strong>{ready?.database ? 'connected' : 'not ready'}</strong>
            </p>
          </article>
          <article>
            <h2>
              <Icon name="settings" size={18} /> Adapters
            </h2>
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

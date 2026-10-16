import { useEffect, useState, type ReactNode } from 'react';
import { webConfig } from '../config';
export function Feedback({
  kind = 'empty',
  title,
  children,
}: {
  kind?: 'loading' | 'empty' | 'success' | 'error' | 'unavailable';
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`feedback feedback--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      aria-busy={kind === 'loading'}
    >
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}
export function NetworkNotice() {
  const [online, setOnline] = useState(navigator.onLine);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setStatus('idle');
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  async function retry() {
    setStatus('loading');
    try {
      const response = await fetch(`${webConfig.apiBaseUrl}/health`, {
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      setOnline(navigator.onLine);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }
  if (online && status === 'idle') return null;
  return (
    <div className="network-notice">
      <Feedback
        kind={status === 'idle' ? 'error' : status}
        title={
          status === 'loading'
            ? 'Checking connection…'
            : status === 'success'
              ? 'Connection restored'
              : status === 'error'
                ? 'We could not reach HealthWallet.'
                : 'You are offline.'
        }
      >
        <p>
          {status === 'success'
            ? 'You can continue.'
            : 'Check your connection, then refresh payment status before retrying a submitted payment.'}
        </p>
      </Feedback>
      {status === 'success' ? (
        <button className="btn btn--ghost" onClick={() => setStatus('idle')}>
          Dismiss
        </button>
      ) : (
        <button
          className="btn btn--ghost"
          disabled={status === 'loading'}
          onClick={() => void retry()}
        >
          Retry connection
        </button>
      )}
    </div>
  );
}

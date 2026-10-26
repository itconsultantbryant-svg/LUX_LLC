import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons/Icon';
import { apiGet, apiPost } from '../lib/api';
import './LoginPage.css';

type Session = { mfaVerifiedUntil: string | null };

/** Completes an existing credential session. The authenticator code, not the
 * chosen portal, is what enables time-limited institutional actions. */
export function MfaLoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const returnTo = searchParams.get('returnTo')?.startsWith('/')
    ? searchParams.get('returnTo')!
    : '/dashboard';
  useEffect(() => {
    void apiGet<Session>('/api/security/session')
      .then((session) => {
        if (session.mfaVerifiedUntil && new Date(session.mfaVerifiedUntil) > new Date())
          navigate(returnTo, { replace: true });
      })
      .catch(() => setError('Your sign-in session is unavailable. Sign in again.'));
  }, [navigate, returnTo]);
  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const result = await apiPost<{ secret: string }>('/api/security/mfa/enroll', {});
      setSecret(result.secret);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authenticator setup is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/security/mfa/verify', { code });
      navigate(returnTo, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authenticator verification failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-page__content login-page__form" aria-labelledby="mfa-title">
        <Link className="login-page__brand" to="/login">
          <img src="/lux-ai-brand.png" alt="LUX AI" />
          <strong>HealthWallet</strong>
        </Link>
        <header className="login-page__head">
          <span className="login-role__icon">
            <Icon name="shield-check" size={21} />
          </span>
          <h1 id="mfa-title">Authenticator verification</h1>
          <p>Enter your six-digit authenticator code to continue to the authorized workspace.</p>
        </header>
        {!secret ? (
          <button type="button" onClick={() => void enroll()} disabled={busy}>
            Set up a new authenticator
          </button>
        ) : (
          <p className="role-login-form__notice">
            Add this setup key to your authenticator app, then enter its current code:{' '}
            <strong>{secret}</strong>
          </p>
        )}
        <form className="role-login-form" onSubmit={submit}>
          <label htmlFor="mfa-code">Authenticator code</label>
          <input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            required
          />
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify and continue'} <Icon name="arrow-right" size={16} />
          </button>
          {error && (
            <p className="role-login-form__notice" role="alert">
              {error}
            </p>
          )}
        </form>
        <Link className="login-page__back" to="/login">
          ← Return to sign in
        </Link>
      </section>
    </main>
  );
}

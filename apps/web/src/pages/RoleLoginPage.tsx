import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon, type IconName } from '../components/icons/Icon';
import { useAuth } from '../features/auth-context';
import { apiPost } from '../lib/api';
import './LoginPage.css';

const loginTypes: Record<
  string,
  { title: string; detail: string; icon: IconName; fields: 'phone' | 'credentials' }
> = {
  customer: {
    title: 'Customer sign in',
    detail:
      'Use your HealthWallet email or customer ID and password. Customer access is protected by verification.',
    icon: 'wallet',
    fields: 'credentials',
  },
  employer: {
    title: 'Employer sign in',
    detail:
      'Use your organization email or employer ID and password. Organization access requires 2FA.',
    icon: 'building',
    fields: 'credentials',
  },
  'healthcare-provider': {
    title: 'Healthcare Provider sign in',
    detail: 'Use your provider email or facility ID and password. Provider access requires 2FA.',
    icon: 'hospital',
    fields: 'credentials',
  },
  bank: {
    title: 'Bank sign in',
    detail: 'Use your bank or institution ID and password. Secure bank access requires 2FA.',
    icon: 'building',
    fields: 'credentials',
  },
  'charity-ngo-sponsor': {
    title: 'Sponsor sign in',
    detail: 'Use your organization email or sponsor ID and password. Sponsor access requires 2FA.',
    icon: 'gift',
    fields: 'credentials',
  },
  'lux-team': {
    title: 'LUX Team sign in',
    detail: 'Use your LUX credentials and password. LUX operations access requires 2FA.',
    icon: 'shield-check',
    fields: 'credentials',
  },
};

export function RoleLoginPage() {
  const { role } = useParams();
  const { signedIn, refresh } = useAuth();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const item = role ? loginTypes[role] : undefined;
  if (!item) return <Navigate to="/login" replace />;
  if (signedIn) return <Navigate to="/dashboard" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setSubmitted(false);
    setError('');
    try {
      const result = await apiPost<{ mfaRequired: boolean }>('/api/auth/credential-login', {
        identifier: String(form.get('identifier') ?? '')
          .trim()
          .toLowerCase(),
        password: form.get('password'),
      });
      if (result.mfaRequired) {
        navigate('/login/mfa?returnTo=/dashboard');
        return;
      }
      const profile = await refresh();
      if (!profile)
        throw new Error('Your session could not be restored. Check your connection and try again.');
      navigate('/dashboard');
    } catch (reason) {
      setSubmitted(true);
      setError(
        reason instanceof Error ? reason.message : 'We could not complete sign-in. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-page__content login-page__form" aria-labelledby="role-login-title">
        <Link className="login-page__brand" to="/login">
          <img src="/lux-ai-brand.png" alt="LUX AI" />
          <strong>HealthWallet</strong>
        </Link>
        <header className="login-page__head">
          <span className="login-role__icon">
            <Icon name={item.icon} size={21} />
          </span>
          <h1 id="role-login-title">{item.title}</h1>
          <p>{item.detail}</p>
        </header>
        {item.fields === 'credentials' && (
          <form className="role-login-form" onSubmit={submit}>
            <label htmlFor="identifier">
              {role === 'customer' ? 'Email or customer ID' : 'Organization email or ID'}
            </label>
            <input id="identifier" name="identifier" required autoComplete="username" />
            <label htmlFor="password">Password</label>
            <span className="role-login-form__password">
              <input
                id="password"
                name="password"
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              >
                <Icon name="eye" size={17} />
              </button>
            </span>
            <button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Continue to verification'}{' '}
              <Icon name="arrow-right" size={16} />
            </button>
            {submitted && (
              <p className="role-login-form__notice">
                {error ||
                  'We could not verify those credentials. Confirm your organization access and try again.'}
              </p>
            )}
          </form>
        )}
        <Link className="login-page__back" to="/login">
          ← Choose another role
        </Link>
      </section>
    </main>
  );
}

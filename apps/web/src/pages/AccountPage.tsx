import { useEffect, useState, type FormEvent } from 'react';
import {
  CONSENT_VERSION,
  ROLE_LABELS,
  type IdentityProfile,
  type OtpChallengeResponse,
} from '@healthwallet/shared';
import { ApiError, apiGet, apiPost } from '../lib/api';
import { Link, useLocation } from 'react-router-dom';
import { isDemoLike } from '../config';
import { useAuth } from '../features/auth-context';
import './AccountPage.css';

type ProfileResponse = { profile: IdentityProfile; simulation: boolean };
const CONSENT_LABELS = {
  service_terms: 'Service terms',
  health_data: 'Health-data processing',
} as const;

export function AccountPage() {
  const location = useLocation();
  const { refresh: refreshAuth } = useAuth();
  const requestedReturn: unknown = location.state?.returnTo;
  const returnTo =
    typeof requestedReturn === 'string' &&
    /^\/(pay|save|support|history|contribute#[A-Za-z0-9_-]{43})$/.test(requestedReturn)
      ? requestedReturn
      : null;
  const [authConfig, setAuthConfig] = useState({
    simulation: isDemoLike(),
    consentVersion: CONSENT_VERSION,
  });
  const [attempt, setAttempt] = useState(0);
  const [available, setAvailable] = useState(false);
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [checking, setChecking] = useState(true);
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<OtpChallengeResponse | null>(null);
  const [code, setCode] = useState('');
  const [serviceTerms, setServiceTerms] = useState(false);
  const [healthData, setHealthData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setChecking(true);
    setError(null);
    apiGet<{ simulation: boolean; consentVersion: string }>('/api/auth/config')
      .then((config) => {
        if (active) {
          setAuthConfig(config);
          setAvailable(true);
        }
        return apiGet<ProfileResponse>('/api/auth/me');
      })
      .then((data) => {
        if (active) setProfile(data.profile);
      })
      .catch((err: unknown) => {
        if (active && !(err instanceof ApiError && err.status === 401)) {
          setError(err instanceof Error ? err.message : 'Could not load your account.');
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await work();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setProfile(null);
      setError(err instanceof Error ? err.message : 'Request failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      const data = await apiPost<OtpChallengeResponse>('/api/auth/request-code', {
        phone: phone.trim(),
      });
      setChallenge(data);
      setCode('');
      setNotice(
        data.simulation
          ? 'Simulation code created. No SMS was sent.'
          : 'Verification code sent. Check your phone.',
      );
    });
  }
  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    await perform(async () => {
      const data = await apiPost<ProfileResponse>('/api/auth/verify-code', {
        challengeId: challenge.challengeId,
        code,
        serviceTerms,
        healthData,
        consentVersion: authConfig.consentVersion,
      });
      setProfile(data.profile);
      setChallenge(null);
      setCode('');
      setPhone('');
      setServiceTerms(false);
      setHealthData(false);
      setNotice(data.simulation ? 'Signed in to your sandbox account.' : 'Signed in.');
      await refreshAuth();
    });
  }

  return (
    <section className="account">
      <h1>{profile ? 'Your account' : 'Sign in to HealthWallet'}</h1>
      {authConfig.simulation && (
        <p className="account__simulation">
          SIMULATION — no SMS is sent and phone ownership is not verified. Use a test phone number
          and fictional information only.
        </p>
      )}
      {checking ? (
        <p role="status">Checking your session…</p>
      ) : !available ? (
        <div role="alert">
          <p>Sign-in is unavailable. Check your connection and try again.</p>
          <button className="btn btn--ghost" onClick={() => setAttempt((value) => value + 1)}>
            Retry sign-in
          </button>
        </div>
      ) : profile ? (
        <div>
          <dl>
            <dt>Phone</dt>
            <dd>{profile.phone}</dd>
            <dt>Roles</dt>
            <dd>
              {profile.roles.map((role) => ROLE_LABELS[role]).join(', ') || 'No roles assigned'}
            </dd>
          </dl>
          <Link className="btn btn--primary" to="/account/security">
            Profile, security & organization access
          </Link>
          {returnTo && (
            <Link className="btn btn--primary" to={returnTo}>
              Continue funding request
            </Link>
          )}
          <p>
            <Link className="text-link" to="/save">
              Manage optional financial guidance consent
            </Link>
          </p>
          <h2>Your consent records</h2>
          <p>
            These consent records apply to this account. Changing consent does not grant another
            person access to your records.
          </p>
          <ul className="account__consents">
            {profile.consents.map((consent) => (
              <li key={consent.consentType}>
                <strong>{CONSENT_LABELS[consent.consentType]}</strong>
                <span>
                  {consent.granted ? 'Granted' : 'Withdrawn'} · {consent.version}
                </span>
                <small>{new Date(consent.createdAt).toLocaleString()}</small>
                {profile.roles.some((role) => role !== 'partner_readonly' && role !== 'system') ? (
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    type="button"
                    onClick={() =>
                      void perform(async () => {
                        const data = await apiPost<ProfileResponse>('/api/auth/consent', {
                          consentType: consent.consentType,
                          granted: !consent.granted,
                          version: authConfig.consentVersion,
                        });
                        setProfile(data.profile);
                        setNotice('Your consent choice has been recorded.');
                      })
                    }
                  >
                    {consent.granted ? 'Withdraw consent' : 'Grant consent'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            className="btn btn--primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await apiPost('/api/auth/logout', {});
                setProfile(null);
                setNotice('You are signed out.');
                await refreshAuth();
              })
            }
          >
            Sign out
          </button>
        </div>
      ) : challenge ? (
        <form onSubmit={(event) => void verifyCode(event)}>
          <p>
            Phone number: <strong>{phone.trim()}</strong>
          </p>
          <p className="account__code">
            {challenge.simulation ? (
              <>
                Simulation code: <strong>{challenge.sandboxCode}</strong>
              </>
            ) : (
              'Enter the verification code sent to your phone.'
            )}
            <br />
            <small>
              Expires at {new Date(challenge.expiresAt).toLocaleTimeString()}. You have up to five
              attempts.
            </small>
          </p>
          <label htmlFor="otp">Six-digit code</label>
          <input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
          />
          <fieldset disabled={busy}>
            <legend>Consent · {authConfig.consentVersion}</legend>
            <p>
              We store your phone number, session, and consent history. You can review and withdraw
              consent after signing in.{' '}
              {authConfig.simulation ? 'Use fictional information in this sandbox.' : ''}
            </p>
            <label className="account__check">
              <input
                type="checkbox"
                required
                checked={serviceTerms}
                onChange={(event) => setServiceTerms(event.target.checked)}
              />
              {authConfig.simulation
                ? 'I agree to use this sandbox for simulation only, with no real money or verified phone identity.'
                : 'I accept the current service terms.'}
            </label>
            <label className="account__check">
              <input
                type="checkbox"
                required
                checked={healthData}
                onChange={(event) => setHealthData(event.target.checked)}
              />
              {authConfig.simulation
                ? 'I consent to storing and processing fictional health-bill information for this demonstration.'
                : 'I consent to processing my health-bill information for the requested healthcare service.'}
            </label>
          </fieldset>
          <button className="btn btn--primary" disabled={busy} type="submit">
            {busy ? 'Please wait…' : 'Verify and sign in'}
          </button>
          <button
            className="btn btn--ghost"
            disabled={busy}
            type="button"
            onClick={() => {
              setChallenge(null);
              setCode('');
              setError(null);
              setNotice('');
            }}
          >
            Use another number or request a new code
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void requestCode(event)}>
          <label htmlFor="phone">
            {authConfig.simulation ? 'Test phone number' : 'Phone number'}
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+231770000000"
            pattern="\+[1-9][0-9]{7,14}"
            maxLength={16}
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={busy}
            aria-describedby="phone-help"
          />
          <p id="phone-help">
            Include the country code. Codes last five minutes; wait at least one minute between
            requests.
          </p>
          <button className="btn btn--primary" disabled={busy} type="submit">
            {busy
              ? 'Sending code…'
              : authConfig.simulation
                ? 'Get simulation code'
                : 'Send verification code'}
          </button>
        </form>
      )}
      {error ? (
        <p role="alert" className="account__error">
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}

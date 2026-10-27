import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { useAuth } from '../features/auth-context';
import { apiGet, apiPatch } from '../lib/api';

type Customer = {
  profile: {
    id: string;
    phone: string;
    verification_status: string;
    display_name: string | null;
    preferred_language: 'en' | 'fr' | null;
  };
};

export function CustomerProfilePage() {
  const { signOut } = useAuth();
  const [customer, setCustomer] = useState<Customer>();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'en' | 'fr'>('en');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const data = await apiGet<Customer>('/api/customers/me');
    setCustomer(data);
    setName(data.profile.display_name ?? '');
    setLanguage(data.profile.preferred_language ?? 'en');
  };

  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiPatch('/api/customers/me', {
        displayName: name.trim(),
        preferredLanguage: language,
      });
      await refresh();
      setMessage('Profile updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="user" size={15} /> Customer account
          </p>
          <h1>Profile</h1>
          <p>Manage your account details and settings.</p>
        </div>
      </header>
      {message && <Feedback kind="success" title={message} />}
      {error && <Feedback kind="error" title={error} />}
      {!customer ? (
        <Feedback kind="loading" title="Loading profile…" />
      ) : (
        <>
          <article className="panel">
            <div className="reference-card__title">
              <h2>{customer.profile.display_name || 'Customer'}</h2>
              <span className="badge badge--success">{customer.profile.verification_status}</span>
            </div>
            <p className="muted">{customer.profile.phone}</p>
          </article>
          <form className="panel app-form" onSubmit={save}>
            <h2>Personal details</h2>
            <label htmlFor="profile-name">Full name</label>
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
            />
            <label htmlFor="profile-language">Language</label>
            <select
              id="profile-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'en' | 'fr')}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
            </select>
            <button className="btn btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
          <article className="panel">
            <h2>Security</h2>
            <Link className="btn btn--ghost" to="/account/security">
              Security settings
            </Link>
          </article>
          <button className="btn btn--ghost" disabled={busy} onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      )}
    </section>
  );
}

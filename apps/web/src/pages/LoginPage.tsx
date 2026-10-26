import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/icons/Icon';
import './LoginPage.css';

const roles: Array<{
  label: string;
  login: string;
  access: string;
  icon: IconName;
  tone: 'teal' | 'sky' | 'violet' | 'amber' | 'rose';
}> = [
  {
    label: 'Customer',
    login: 'Mobile Money number + OTP',
    access: 'Smartphone App + USSD',
    icon: 'wallet',
    tone: 'teal',
  },
  {
    label: 'Employer',
    login: 'Organization login + 2FA',
    access: 'Smartphone / Web Portal',
    icon: 'building',
    tone: 'amber',
  },
  {
    label: 'Healthcare Provider',
    login: 'Provider login + 2FA',
    access: 'Smartphone / Web Portal',
    icon: 'hospital',
    tone: 'violet',
  },
  {
    label: 'Bank',
    login: 'Bank / Institution ID + password + 2FA',
    access: 'Secure Web Portal',
    icon: 'building',
    tone: 'sky',
  },
  {
    label: 'Charity / NGO / Sponsor',
    login: 'Organization login + 2FA',
    access: 'Smartphone / Web Portal',
    icon: 'gift',
    tone: 'rose',
  },
  {
    label: 'LUX Team',
    login: 'LUX credentials + 2FA',
    access: 'Secure Web Portal',
    icon: 'shield-check',
    tone: 'sky',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  return (
    <main className="login-page">
      <section className="login-page__content" aria-labelledby="login-title">
        <Link className="login-page__brand" to="/" aria-label="HealthWallet home">
          <img src="/lux-ai-brand.png" alt="LUX AI" />
          <strong>HealthWallet</strong>
        </Link>
        <header className="login-page__head">
          <h1 id="login-title">Welcome to HealthWallet</h1>
          <p>Select your role to continue. Each role has its own secure access method.</p>
        </header>
        <div className="login-page__roles" aria-label="Select a role">
          {roles.map((role) => (
            <button
              key={role.label}
              type="button"
              className={`login-role login-role--${role.tone}`}
              onClick={() =>
                navigate(`/login/${role.label.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`)
              }
            >
              <span className="login-role__icon">
                <Icon name={role.icon} size={21} />
              </span>
              <span className="login-role__copy">
                <strong>{role.label}</strong>
                <small>{role.login}</small>
                <em>{role.access}</em>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          ))}
        </div>
        <p className="login-page__note">
          <Icon name="lock" size={14} /> Secure role-based access
        </p>
        <section className="login-page__ussd" aria-labelledby="ussd-access-title">
          <span className="login-page__ussd-icon">
            <Icon name="smartphone" size={22} />
          </span>
          <div>
            <h2 id="ussd-access-title">No smartphone? No internet? Use USSD.</h2>
            <p>
              Customers can dial <strong>*155*9#</strong> from any basic phone to check balance,
              view vouchers, verify providers, and confirm healthcare payments — no internet
              required. USSD is available for customers only.
            </p>
          </div>
        </section>
        <section className="login-page__demo" aria-labelledby="demo-login-title">
          <h2 id="demo-login-title">Demo login details</h2>
          <p>
            Development sandbox only. All organization accounts use the password{' '}
            <code>HealthWalletDemo!2026</code>.
          </p>
          <div>
            <span>
              <b>Customer</b>
              <code>customer@demo.healthwallet.lr</code>
            </span>
            <span>
              <b>Employer</b>
              <code>employer.administrator@demo.healthwallet.lr</code>
            </span>
            <span>
              <b>Provider</b>
              <code>provider.administrator@demo.healthwallet.lr</code>
            </span>
            <span>
              <b>Bank</b>
              <code>bank.officer@demo.healthwallet.lr</code>
            </span>
            <span>
              <b>Sponsor</b>
              <code>sponsor.administrator@demo.healthwallet.lr</code>
            </span>
            <span>
              <b>LUX Team</b>
              <code>lux.administrator@demo.healthwallet.lr</code>
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}

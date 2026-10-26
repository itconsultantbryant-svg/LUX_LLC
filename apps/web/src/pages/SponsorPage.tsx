import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons/Icon';
import { apiGet, apiPost } from '../lib/api';
import { formatMinor } from '../lib/money';
import './ReferencePortal.css';

type Program = {
  id: string;
  name: string;
  organization_name: string;
  currency: string;
  status: string;
  budget_minor: string | null;
  max_per_payment_minor: string | null;
  expires_at: string | null;
  allowed_categories: string[];
  pendingApprovals: Array<{ id: string; change_type: string; required_role: string }>;
};
type Organization = { id: string; name: string; kind: string; status: string };

export function SponsorPage() {
  const [searchParams] = useSearchParams();
  const [programs, setPrograms] = useState<Program[]>();
  const [organizations, setOrganizations] = useState<Organization[]>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const screen = searchParams.get('screen') ?? 'dashboard';
  useEffect(() => {
    let active = true;
    void apiGet<{ programs: Program[] }>('/api/governance/programs')
      .then((data) => active && setPrograms(data.programs))
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void apiGet<{ organizations: Organization[] }>('/api/organizations')
      .then((data) => {
        if (active)
          setOrganizations(
            data.organizations.filter(
              (organization) =>
                organization.kind === 'sponsor' && organization.status === 'approved',
            ),
          );
      })
      .catch(() => active && setOrganizations([]));
    return () => {
      active = false;
    };
  }, []);
  const metrics = useMemo(() => {
    const items = programs ?? [];
    return [
      ['Active', items.filter((program) => program.status === 'active').length],
      ['Pending approval', items.filter((program) => program.status.includes('pending')).length],
      ['Paused', items.filter((program) => program.status === 'paused').length],
      ['Total programs', items.length],
    ] as const;
  }, [programs]);
  const title =
    screen === 'beneficiaries'
      ? 'Program beneficiaries'
      : screen === 'transactions'
        ? 'Program funding history'
        : screen === 'programs'
          ? 'Voucher programs'
          : 'Sponsor portal';
  const subtitle =
    screen === 'beneficiaries'
      ? 'Beneficiary details are restricted to authorized program access.'
      : screen === 'transactions'
        ? 'Program budgets and dated funding records are kept distinct.'
        : 'Create and manage restricted healthcare voucher programs.';
  async function createProgram(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const budget = String(data.get('budget') ?? '').replace(/\D/g, '');
      const maximum = String(data.get('maxPerPayment') ?? '').replace(/\D/g, '');
      await apiPost('/api/governance/programs', {
        organizationId: data.get('organizationId'),
        name: data.get('name'),
        currency: data.get('currency'),
        ...(budget ? { budgetMinor: budget } : {}),
        ...(maximum ? { maxPerPaymentMinor: maximum } : {}),
        allowedCategories: data.getAll('category'),
      });
      form.reset();
      setShowCreate(false);
      setNotice(
        'Program submitted for separate approval. It cannot fund or issue vouchers until approved.',
      );
      setPrograms((await apiGet<{ programs: Program[] }>('/api/governance/programs')).programs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The program could not be submitted.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="reference-portal reference-workspace">
      <Link to="/dashboard" className="reference-back">
        ← Back
      </Link>
      <header className="reference-portal__heading">
        <span className="reference-portal__heading-icon">
          <Icon name="gift" size={16} />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      {screen === 'dashboard' && (
        <div className="reference-stat-grid">
          {metrics.map(([label, value], index) => (
            <article className={`reference-stat reference-stat--${index}`} key={label}>
              <strong>{programs ? value : '—'}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      )}
      <article className="reference-card reference-workspace__table">
        <div className="reference-card__title">
          <h2>
            {screen === 'beneficiaries' ? 'Programs with beneficiary access' : 'Program records'}
          </h2>
          {screen !== 'beneficiaries' && (
            <button
              className="reference-action"
              type="button"
              onClick={() => setShowCreate((value) => !value)}
            >
              Create program
            </button>
          )}
        </div>
        {showCreate && (
          <form
            className="reference-program-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createProgram(event.currentTarget);
            }}
          >
            <label>
              Authorized sponsor organization
              <select name="organizationId" required defaultValue="">
                <option value="" disabled>
                  Select an organization
                </option>
                {organizations?.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Program name
              <input name="name" required maxLength={200} />
            </label>
            <label>
              Currency
              <select name="currency" defaultValue="LRD">
                <option>LRD</option>
                <option>USD</option>
              </select>
            </label>
            <label>
              Total budget (minor units)
              <input
                name="budget"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Optional until funding is confirmed"
              />
            </label>
            <label>
              Per-beneficiary maximum (minor units)
              <input name="maxPerPayment" inputMode="numeric" pattern="[0-9]*" />
            </label>
            <fieldset>
              <legend>Eligible services</legend>
              {['consultation', 'medication', 'diagnostics', 'outpatient', 'general'].map(
                (category) => (
                  <label key={category}>
                    <input name="category" type="checkbox" value={category} /> {category}
                  </label>
                ),
              )}
            </fieldset>
            <p>
              Budget changes, activation, and restrictions require separate approval. This request
              does not create spendable funds.
            </p>
            <div>
              <button className="reference-action" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit for approval'}
              </button>
              <button
                type="button"
                className="reference-cancel"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {notice && (
          <p className="reference-notice" role="status">
            {notice}
          </p>
        )}
        {error ? (
          <p className="reference-error" role="alert">
            {error}
          </p>
        ) : !programs ? (
          <p className="reference-empty">Loading authorized programs…</p>
        ) : programs.length === 0 ? (
          <p className="reference-empty">
            No voucher programs are available for your authorized organization.
          </p>
        ) : (
          <div className="reference-rows">
            {programs.map((program) => (
              <div key={program.id}>
                <span>
                  <strong>{program.name}</strong>
                  <small>
                    {program.organization_name} ·{' '}
                    {program.allowed_categories.length
                      ? program.allowed_categories.join(', ')
                      : 'No service categories configured'}
                    {program.expires_at
                      ? ` · Expires ${new Date(program.expires_at).toLocaleDateString()}`
                      : ''}
                  </small>
                </span>
                <span>
                  <b>
                    {program.budget_minor
                      ? formatMinor(program.budget_minor, program.currency)
                      : `No funded budget (${program.currency})`}
                  </b>
                  <em
                    className={`reference-tag reference-tag--${program.status === 'active' ? 'success' : 'warning'}`}
                  >
                    {program.status.replaceAll('_', ' ')}
                  </em>
                  {program.pendingApprovals.length > 0 && (
                    <small>{program.pendingApprovals.length} pending approval</small>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

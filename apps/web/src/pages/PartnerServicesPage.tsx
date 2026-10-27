import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { Feedback } from '../components/Feedback';
import { Icon, type IconName } from '../components/icons/Icon';

type Module = {
  id: string;
  label: string;
  availability: 'available' | 'simulated' | 'unavailable' | 'pending_approval';
  detail: string;
};

type Claim = {
  id: string;
  policy_number: string;
  amount_claimed_minor: string;
  currency: string;
  status: string;
  submitted_at: string | null;
  simulation_label: string | null;
};

type Coverage = {
  available: boolean;
  reason: string;
  policy?: { policyNumber?: string; insurer?: string; status?: string };
  simulationLabel?: string | null;
};

const services = {
  insurance: {
    eyebrow: 'Insurance services',
    title: 'Insurance claims',
    intro: 'Review verified coverage and follow claim preparation. Coverage is never inferred.',
    icon: 'shield-check' as IconName,
  },
  ussd: {
    eyebrow: 'Feature-phone services',
    title: 'USSD access',
    intro: 'See whether the approved feature-phone service is available for your account.',
    icon: 'smartphone' as IconName,
  },
  'orange-money': {
    eyebrow: 'Funding services',
    title: 'Orange Money',
    intro: 'Add money to HealthWallet through the configured sandbox funding flow.',
    icon: 'wallet' as IconName,
  },
} as const;

type ServiceKey = keyof typeof services;

export function PartnerServicesPage({ section: sectionOverride }: { section?: ServiceKey }) {
  const { section } = useParams();
  const requestedSection = sectionOverride ?? section;
  const key =
    requestedSection && Object.hasOwn(services, requestedSection)
      ? (requestedSection as ServiceKey)
      : null;
  const [modules, setModules] = useState<Module[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [coverage, setCoverage] = useState<Coverage>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!key) return;
    let active = true;
    setLoading(true);
    setError('');
    const requests: Promise<unknown>[] = [apiGet<{ modules: Module[] }>('/api/partners/modules')];
    if (key === 'insurance') {
      requests.push(apiGet<Coverage>('/api/partners/insurance/coverage'));
      requests.push(apiGet<{ claims: Claim[] }>('/api/partners/insurance/claims'));
    }
    Promise.all(requests)
      .then(([moduleData, coverageData, claimData]) => {
        if (!active) return;
        setModules((moduleData as { modules: Module[] }).modules);
        if (coverageData) setCoverage(coverageData as Coverage);
        if (claimData) setClaims((claimData as { claims: Claim[] }).claims);
      })
      .catch((caught) => {
        if (active)
          setError(caught instanceof Error ? caught.message : 'Could not load this service.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key]);

  if (!key) return <Navigate to="/" replace />;
  const service = services[key];
  const moduleKey = key === 'orange-money' ? undefined : key;
  const status = modules.find((item) => item.id === moduleKey);

  return (
    <section className="workspace service-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name={service.icon} size={15} /> {service.eyebrow}
          </p>
          <h1>{service.title}</h1>
          <p>{service.intro}</p>
        </div>
        {key === 'orange-money' && (
          <Link className="btn btn--primary" to="/save">
            Add money <Icon name="arrow-right" size={17} />
          </Link>
        )}
      </div>

      {loading && <Feedback kind="loading" title="Loading service details…" />}
      {error && (
        <Feedback kind="error" title={error}>
          <Link className="text-link" to="/account">
            Sign in or check your account access
          </Link>
        </Feedback>
      )}

      {!loading && !error && key === 'orange-money' && <OrangeMoneyPanel />}
      {!loading && !error && status && <AvailabilityPanel status={status} />}
      {!loading && !error && key === 'insurance' && (
        <>
          <CoveragePanel coverage={coverage} />
          <article className="panel service-page__list">
            <div className="service-page__panel-head">
              <div>
                <p className="eyebrow">Claim history</p>
                <h2>Submitted claims</h2>
              </div>
              <span className="badge badge--pending">{claims.length} records</span>
            </div>
            {claims.length === 0 ? (
              <p className="muted">No insurance claims have been prepared for this account.</p>
            ) : (
              <ul className="activity-list">
                {claims.map((claim) => (
                  <li key={claim.id}>
                    <div>
                      <strong>{claim.policy_number}</strong>
                      <small>
                        {claim.submitted_at
                          ? `Submitted ${new Date(claim.submitted_at).toLocaleString()}`
                          : 'Prepared for insurer review'}
                      </small>
                    </div>
                    <div>
                      <strong>
                        {claim.currency} {claim.amount_claimed_minor}
                      </strong>
                      <span className="badge badge--pending">{claim.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </>
      )}
      {!loading && !error && key === 'ussd' && (
        <article className="panel service-page__next-step">
          <Icon name="smartphone" size={22} />
          <div>
            <h2>Use a feature phone when available</h2>
            <p>
              USSD is offered only after an approved gateway is connected. The service status above
              reflects the current configured availability.
            </p>
          </div>
        </article>
      )}
    </section>
  );
}

function AvailabilityPanel({ status }: { status: Module }) {
  const available = status.availability === 'available';
  return (
    <article className="panel service-page__availability">
      <span className={`service-page__status-icon${available ? ' is-live' : ''}`}>
        <Icon name={available ? 'check-circle' : 'info'} size={22} />
      </span>
      <div>
        <p className="eyebrow">Service status</p>
        <h2>{status.label}</h2>
        <p>{status.detail}</p>
      </div>
      <span className={`badge badge--${available ? 'success' : 'pending'}`}>
        {status.availability}
      </span>
    </article>
  );
}

function CoveragePanel({ coverage }: { coverage: Coverage | undefined }) {
  return (
    <article className="panel service-page__availability">
      <span className={`service-page__status-icon${coverage?.available ? ' is-live' : ''}`}>
        <Icon name={coverage?.available ? 'shield-check' : 'info'} size={22} />
      </span>
      <div>
        <p className="eyebrow">Coverage status</p>
        <h2>
          {coverage?.available ? 'Verified policy on record' : 'No verified policy available'}
        </h2>
        <p>{coverage?.reason ?? 'Coverage is checked from verified records only.'}</p>
      </div>
      {coverage?.simulationLabel && <span className="badge badge--pending">Sandbox</span>}
    </article>
  );
}

function OrangeMoneyPanel() {
  return (
    <article className="panel service-page__orange">
      <span className="service-page__orange-icon">
        <Icon name="smartphone" size={26} />
      </span>
      <div>
        <p className="eyebrow">Wallet funding</p>
        <h2>Fund your healthcare wallet</h2>
        <p>
          Review an exact quote before authorizing any top-up. Sandbox funding stays visibly
          labelled and never represents a confirmed live Orange Money settlement.
        </p>
        <Link className="text-link" to="/save">
          Open funding workspace <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </article>
  );
}

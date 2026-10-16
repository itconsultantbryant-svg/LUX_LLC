import { FundingActivity } from '../components/FundingActivity';
import { WalletBalance } from '../components/WalletBalance';
import { Link } from 'react-router-dom';
import { useDemo, money } from '../features/demo';
import { Feedback } from '../components/Feedback';
import { DashboardCard } from '../components/DashboardCard';
import { Icon } from '../components/icons/Icon';

export function CustomerHome() {
  const { state, dispatch, allowed } = useDemo();
  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="heart" size={15} /> Your healthcare, planned ahead
          </p>
          <h1>{state.active ? 'Welcome to your demo wallet' : 'Your health. Your next step.'}</h1>
          <p>Prepare for care, pay with confidence, and ask for support.</p>
        </div>
        {!state.active && (
          <Link className="btn btn--ghost" to="/account">
            <Icon name="user" size={18} /> Customer sign in
          </Link>
        )}
      </div>
      {!state.active && allowed && (
        <div className="demo-entry">
          <div>
            <strong>Explore without an account</strong>
            <p>Try a fictional wallet. No real money, people, or medical information.</p>
          </div>
          <button className="btn btn--ghost" onClick={() => dispatch({ type: 'start' })}>
            Try Demo
          </button>
        </div>
      )}
      <div className="dashboard-grid">
        {!state.active ? (
          <WalletBalance />
        ) : (
          <DashboardCard
            title="Available healthcare funds"
            description="Liberian dollars · ready for simulated care payments"
            icon="wallet"
            className="balance-panel"
            action={
              <Link className="btn btn--primary" to="/pay">
                Pay for Care <span aria-hidden="true">→</span>
              </Link>
            }
          >
            <p className="balance">{money(state.available)}</p>
            <div className="action-pair">
              <Link className="btn btn--ghost" to="/save">
                <Icon name="heart" size={18} /> Save Money
              </Link>
              <Link className="btn btn--ghost" to="/support">
                <Icon name="credit-card" size={18} /> Get Support
              </Link>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <div className="stat-card">
                <div>
                  <div className="stat-card__label">Restricted</div>
                  <div className="stat-card__value">{money(state.restricted)}</div>
                  <div className="stat-card__meta">For eligible care only. Not included above.</div>
                </div>
                <div className="stat-card__icon">
                  <Icon name="shield" size={18} />
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <div className="stat-card__label">Pending</div>
                  <div className="stat-card__value">{money(state.pending)}</div>
                  <div className="stat-card__meta">Awaiting review. Not available to spend.</div>
                </div>
                <div className="stat-card__icon">
                  <Icon name="clock" size={18} />
                </div>
              </div>
            </div>
          </DashboardCard>
        )}
        {state.active && (
          <DashboardCard
            title="Pending requests"
            description={`${state.activity.filter((item) => item.status === 'Pending').length} items need attention`}
            icon="clock"
            action={
              <Link className="text-link" to="/support">
                Explore support options →
              </Link>
            }
          >
            {state.activity.filter((item) => item.status === 'Pending').length > 0 ? (
              <ul className="activity-list">
                {state.activity
                  .filter((item) => item.status === 'Pending')
                  .map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </div>
                      <div>
                        <strong>{money(item.amount)}</strong>
                        <span className="badge badge--pending">Pending review</span>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <Feedback title="No requests to show">
                <p>Your requests will appear here when your account is connected.</p>
              </Feedback>
            )}
          </DashboardCard>
        )}
      </div>
      {!state.active && <FundingActivity />}
      {state.active && (
        <DashboardCard
          title="Recent activity"
          description="Latest payments, savings, and support updates"
          icon="activity"
          action={
            <Link className="text-link" to="/history">
              View history →
            </Link>
          }
        >
          {state.activity.length > 0 ? (
            <ul className="activity-list">
              {state.activity.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <div>
                    <strong>{money(item.amount)}</strong>
                    <span
                      className={`badge badge--${item.status === 'Pending' ? 'pending' : 'success'}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Feedback title="A fresh start">
              <p>Payments, savings, and support updates will appear here.</p>
            </Feedback>
          )}
        </DashboardCard>
      )}
      <details className="panel guidance">
        <summary>
          <Icon name="trending-up" size={18} /> Optional savings guidance
        </summary>
        <h2>Start with an amount that fits your day</h2>
        <p>
          Choose a small regular amount after your essential expenses. You can review your plan
          before making any contribution.
        </p>
        <p className="muted">
          General guidance only. Personalized AI guidance is not connected yet.
        </p>
        <Link className="text-link" to="/save">
          Explore saving →
        </Link>
      </details>
      <p className="institution-entry">
        Working with a clinic or organization?{' '}
        <Link className="text-link" to="/institutional">
          Institutional access →
        </Link>
      </p>
    </section>
  );
}

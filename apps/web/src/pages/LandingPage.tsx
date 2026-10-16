import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { webConfig } from '../config';
import './LandingPage.css';

export function LandingPage() {
  return (
    <section className="landing">
      <div className="landing__hero">
        <p className="eyebrow">
          <span aria-hidden="true" />
          {webConfig.productName}
        </p>
        <h1>
          A little preparation.
          <br />
          <span>A healthier tomorrow.</span>
        </h1>
        <p className="landing__lede">
          A simpler way to prepare for healthcare costs, bring support together, and understand your
          bills. Built for Liberia. Powered by LUX HealthTrust.
        </p>
        <div className="landing__actions">
          <Link className="btn btn--primary" to="/account">
            Get started <span aria-hidden="true">↗</span>
          </Link>
          <Link className="btn btn--ghost" to="/journey">
            Explore the care journey <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="landing__sandbox">
          <span aria-hidden="true">◈</span> You're exploring our sandbox. No real money moves.
        </p>
      </div>
      <aside className="landing__companion" aria-label="Your healthcare journey">
        <div className="landing__companion-top">
          <span className="landing__logo-plate">
            <Brand compact />
          </span>
          <span className="landing__tag">YOUR CARE COMPANION</span>
        </div>
        <p className="landing__companion-title">
          More clarity.
          <br />
          Every step of the way.
        </p>
        <ol className="landing__steps">
          <li>
            <span className="landing__step-number">01</span>
            <div>
              <h2>Prepare with confidence</h2>
              <p>Plan for care and organize support.</p>
            </div>
          </li>
          <li>
            <span className="landing__step-number">02</span>
            <div>
              <h2>Understand your bill</h2>
              <p>LUX HealthTrust helps extract the details.</p>
            </div>
          </li>
          <li>
            <span className="landing__step-number">03</span>
            <div>
              <h2>Review. Then decide.</h2>
              <p>You stay in control of the next step.</p>
            </div>
          </li>
        </ol>
        <div className="landing__companion-bottom">
          <span className="landing__pulse" aria-hidden="true" />
          Designed around you, wherever you are.
        </div>
      </aside>
      <div className="landing__intro">
        <p className="eyebrow">Care, connected</p>
        <h2>One place to take the next step.</h2>
        <p>Start small. Get clarity. Keep your healthcare journey together.</p>
      </div>
      <div className="landing__features">
        <Link to="/account" className="landing__feature">
          <span className="landing__feature-number">01 / YOUR SPACE</span>
          <h3>Your account, your choices.</h3>
          <p>Explore a sandbox account and manage your consent in one place.</p>
          <span className="landing__feature-link">
            Open your account <span aria-hidden="true">↗</span>
          </span>
        </Link>
        <Link to="/journey" className="landing__feature">
          <span className="landing__feature-number">02 / YOUR CLARITY</span>
          <h3>Make sense of a bill.</h3>
          <p>Try LUX HealthTrust's simulated extraction and review the information.</p>
          <span className="landing__feature-link">
            Try the care journey <span aria-hidden="true">↗</span>
          </span>
        </Link>
        <Link to="/status" className="landing__feature">
          <span className="landing__feature-number">03 / YOUR CONFIDENCE</span>
          <h3>Know what's connected.</h3>
          <p>See service availability and which parts of the experience are simulated.</p>
          <span className="landing__feature-link">
            Check app status <span aria-hidden="true">↗</span>
          </span>
        </Link>
      </div>
      <aside className="landing__note">
        <strong>Built with purpose. Developed with care.</strong>
        <p>
          A LUX AI initiative for the Orange Summer Challenge. Orange Liberia is an intended
          integration partner; no live partnership or payment integration is claimed.
        </p>
      </aside>
    </section>
  );
}

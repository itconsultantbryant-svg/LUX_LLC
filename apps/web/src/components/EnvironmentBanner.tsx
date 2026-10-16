import { isDemoLike, webConfig } from '../config';
import './EnvironmentBanner.css';

export function EnvironmentBanner() {
  if (!isDemoLike()) return null;
  return (
    <div className="env-banner env-banner--demo" role="status">
      {webConfig.appEnv === 'demo' ? 'Demo · synthetic data only.' : 'Development sandbox.'} No real
      money moves.
    </div>
  );
}

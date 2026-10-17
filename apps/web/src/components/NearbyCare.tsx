import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NearbyProvider, StoredLocation } from '@healthwallet/shared';
import { useAuth } from '../features/auth-context';
import { fetchNearbyProviders, useGeolocation } from '../features/location';
import { DashboardCard } from './DashboardCard';
import { Icon } from './icons/Icon';
import './NearbyCare.css';

/**
 * Verified care the customer can actually reach, ranked from their shared
 * location. Emergency providers are surfaced first because in a real emergency
 * distance and readiness matter more than anything else.
 */
export function NearbyCare() {
  const { signedIn } = useAuth();
  const [emergency, setEmergency] = useState(true);
  const [providers, setProviders] = useState<NearbyProvider[]>([]);
  const [origin, setOrigin] = useState<StoredLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { request, status } = useGeolocation();

  const load = useCallback(async (isEmergency: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNearbyProviders(isEmergency, 4);
      setProviders(data.providers);
      setOrigin(data.origin);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not load nearby care.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) void load(emergency);
  }, [signedIn, emergency, load]);

  if (!signedIn) return null;

  const share = async () => {
    await request();
    await load(emergency);
  };

  return (
    <DashboardCard
      title={emergency ? 'Emergency care near you' : 'Care near you'}
      description={
        origin
          ? 'Ranked from your shared location. Verify details before you travel.'
          : 'Share your location to see verified care you can reach.'
      }
      icon="hospital"
      action={
        <Link className="text-link" to={emergency ? '/pay?nearby=emergency' : '/pay'}>
          Pay for care →
        </Link>
      }
    >
      <div className="nearby__toggle" role="group" aria-label="Filter providers">
        <button
          type="button"
          className={`chip${emergency ? ' is-active' : ''}`}
          aria-pressed={emergency}
          onClick={() => setEmergency(true)}
        >
          <Icon name="alert-triangle" size={14} /> Emergency
        </button>
        <button
          type="button"
          className={`chip${!emergency ? ' is-active' : ''}`}
          aria-pressed={!emergency}
          onClick={() => setEmergency(false)}
        >
          <Icon name="stethoscope" size={14} /> All care
        </button>
      </div>

      {!origin && status !== 'denied' && (
        <div className="nearby__prompt">
          <p>Turn on location once and I will keep the care nearest to you at the top.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void share()}
            disabled={status === 'prompting'}
          >
            <Icon name="map-pin" size={16} />
            {status === 'prompting' ? 'Locating…' : 'Share my location'}
          </button>
        </div>
      )}

      {!origin && status === 'denied' && (
        <p className="muted">
          Location is off. Enable it in your browser settings to rank care by distance.
        </p>
      )}

      {loading && <p className="muted">Finding care you can reach…</p>}
      {error && (
        <p role="alert" className="nearby__error">
          {error}
        </p>
      )}

      {!loading && !error && providers.length === 0 && origin && (
        <p className="muted">
          {emergency
            ? 'No verified emergency providers are listed near you yet.'
            : 'No verified providers are listed near you yet.'}
        </p>
      )}

      {providers.length > 0 && (
        <ul className="nearby__list">
          {providers.map((provider) => (
            <li key={provider.id} className="nearby__item">
              <div className="nearby__item-head">
                <strong>{provider.legalName}</strong>
                {emergency && provider.emergencyReady && (
                  <span className="badge badge--pending">Emergency ready</span>
                )}
              </div>
              <p className="nearby__meta">
                {provider.distanceKm != null && <span>{provider.distanceKm} km</span>}
                {provider.etaMinutes != null && <span>· about {provider.etaMinutes} min</span>}
                {provider.services.length > 0 && <span>· {provider.services.join(', ')}</span>}
              </p>
              {provider.addressLine && <p className="muted">{provider.addressLine}</p>}
              <div className="nearby__actions">
                {provider.phone && (
                  <a className="btn btn--ghost" href={`tel:${provider.phone}`}>
                    <Icon name="smartphone" size={15} /> Call
                  </a>
                )}
                <Link className="btn btn--ghost" to="/pay">
                  Pay here <span aria-hidden="true">→</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

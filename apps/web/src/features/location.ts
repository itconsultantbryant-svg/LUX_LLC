import { useCallback, useState } from 'react';
import type {
  LocationInput,
  LocationResponse,
  NearbyProvidersResponse,
} from '@healthwallet/shared';
import { apiDelete, apiGet, apiPost } from '../lib/api';

const NEARBY = (emergency: boolean, limit = 5) =>
  `/api/providers/nearby?emergency=${emergency ? 'true' : 'false'}&limit=${limit}`;

/** Ask the browser for the current position. Rejects with a friendly message. */
export function browserLocation(): Promise<LocationInput> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device cannot share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? null,
          source: 'browser',
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? 'Location permission was denied. You can still browse providers.'
              : 'We could not read your location. Try again.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  });
}

/** Read the location, save it to the account, and return it. Null when denied. */
export async function shareLocation(): Promise<LocationInput | null> {
  try {
    const location = await browserLocation();
    await apiPost('/api/customers/location', location);
    return location;
  } catch {
    return null;
  }
}

export const getStoredLocation = () => apiGet<LocationResponse>('/api/customers/location');
export const clearStoredLocation = () => apiDelete<{ cleared: boolean }>('/api/customers/location');
export const fetchNearbyProviders = (emergency = false, limit = 5) =>
  apiGet<NearbyProvidersResponse>(NEARBY(emergency, limit));

export type GeoState = 'idle' | 'prompting' | 'ready' | 'denied' | 'unsupported';

/** Small stateful helper around browser location sharing. */
export function useGeolocation() {
  const [coords, setCoords] = useState<LocationInput | null>(null);
  const [status, setStatus] = useState<GeoState>('idle');

  const request = useCallback(async () => {
    setStatus('prompting');
    const location = await shareLocation();
    if (location) {
      setCoords(location);
      setStatus('ready');
    } else {
      setStatus('denied');
    }
    return location;
  }, []);

  const disable = useCallback(async () => {
    try {
      await clearStoredLocation();
    } catch {
      /* ignore */
    }
    setCoords(null);
    setStatus('idle');
  }, []);

  return { coords, status, request, disable };
}

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { IdentityProfile } from '@healthwallet/shared';
import { ApiError, apiGet, apiPost } from '../lib/api';
import { AuthContext } from './auth-context';
import { getStoredLocation, shareLocation } from './location';

/**
 * Ask for location once per browser session after sign-in, and only when we do
 * not already hold one. Sharing is optional; declining never blocks the app.
 */
async function ensureLocation() {
  try {
    if (sessionStorage.getItem('lux:geo:asked')) return;
    sessionStorage.setItem('lux:geo:asked', '1');
  } catch {
    return;
  }
  try {
    const stored = await getStoredLocation();
    if (stored.location) return;
    await shareLocation();
  } catch {
    // Permission denied or unavailable — the customer can share later.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ profile: IdentityProfile }>('/api/auth/me');
      setProfile(data.profile);
      void ensureLocation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', {});
    } catch {
      // The session may already be gone; clear locally regardless.
    }
    setProfile(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{ profile, loading, signedIn: profile !== null, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

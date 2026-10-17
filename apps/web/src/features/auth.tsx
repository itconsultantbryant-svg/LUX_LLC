import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { IdentityProfile } from '@healthwallet/shared';
import { ApiError, apiGet, apiPost } from '../lib/api';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ profile: IdentityProfile }>('/api/auth/me');
      setProfile(data.profile);
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

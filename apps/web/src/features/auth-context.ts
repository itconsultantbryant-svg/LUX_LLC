import { createContext, useContext } from 'react';
import type { IdentityProfile } from '@healthwallet/shared';

export type AuthState = {
  profile: IdentityProfile | null;
  loading: boolean;
  signedIn: boolean;
  refresh: () => Promise<IdentityProfile | null>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState>({
  profile: null,
  loading: false,
  signedIn: false,
  refresh: async () => null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

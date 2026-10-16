import type { IdentityProfile, RoleCode } from '@healthwallet/shared';

export interface Challenge {
  id: string;
  phone: string;
  codeHash: string;
  authMethod: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}
export interface IdentityTransaction {
  lockRequest(phone: string, ipHash: string): Promise<void>;
  requestCounts(
    phone: string,
    ipHash: string,
    since: Date,
    cooldown: Date,
  ): Promise<{ phone: number; ip: number; coolingDown: boolean }>;
  createChallenge(input: Challenge & { ipHash: string; createdAt: Date }): Promise<void>;
  invalidatePhone(phone: string, now: Date): Promise<void>;
  challengeForUpdate(id: string): Promise<Challenge | null>;
  updateChallenge(id: string, attempts: number, consumedAt: Date | null): Promise<void>;
  ensureCustomer(phone: string): Promise<string>;
  recordConsent(
    userId: string,
    consentType: 'service_terms' | 'health_data',
    granted: boolean,
    version: string,
  ): Promise<void>;
  createSession(hash: string, userId: string, expiresAt: Date, authMethod?: string): Promise<void>;
  audit(userId: string, event: string): Promise<void>;
}
export interface IdentityStore {
  transaction<T>(work: (tx: IdentityTransaction) => Promise<T>): Promise<T>;
  invalidateChallenge(id: string, now: Date): Promise<void>;
  profile(sessionHash: string, now: Date): Promise<IdentityProfile | null>;
  revokeSession(hash: string): Promise<void>;
}
export function hasAnyRole(profile: IdentityProfile, allowed: readonly RoleCode[]): boolean {
  return profile.roles.some((role) => allowed.includes(role));
}

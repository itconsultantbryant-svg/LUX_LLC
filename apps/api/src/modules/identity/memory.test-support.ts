import { randomUUID } from 'node:crypto';
import type { IdentityProfile } from '@healthwallet/shared';
import type { Challenge, IdentityStore, IdentityTransaction } from './store.js';

// Test double only. Runtime routes always use PostgresIdentityStore.
export class MemoryIdentityStore implements IdentityStore {
  state = {
    challenges: new Map<string, Challenge & { ipHash: string; createdAt: Date }>(),
    users: new Map<string, IdentityProfile>(),
    sessions: new Map<string, { userId: string; expiresAt: Date }>(),
    audits: [] as string[],
  };
  failSession = false;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly clock: () => Date) {}
  async transaction<T>(work: (tx: IdentityTransaction) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const snapshot = structuredClone(this.state);
      const tx: IdentityTransaction = {
        lockRequest: async () => {},
        requestCounts: async (phone, ipHash, since, cooldown) => {
          const recent = [...this.state.challenges.values()].filter((row) => row.createdAt > since);
          return {
            phone: recent.filter((row) => row.phone === phone).length,
            ip: recent.filter((row) => row.ipHash === ipHash).length,
            coolingDown: recent.some((row) => row.phone === phone && row.createdAt > cooldown),
          };
        },
        invalidatePhone: async (phone, now) => {
          for (const row of this.state.challenges.values())
            if (row.phone === phone && !row.consumedAt) row.consumedAt = now;
        },
        createChallenge: async (input) => {
          this.state.challenges.set(input.id, input);
        },
        challengeForUpdate: async (id) => this.state.challenges.get(id) ?? null,
        updateChallenge: async (id, attempts, consumedAt) => {
          Object.assign(this.state.challenges.get(id)!, { attempts, consumedAt });
        },
        ensureCustomer: async (phone) => {
          const existing = [...this.state.users.values()].find((user) => user.phone === phone);
          if (existing) return existing.id;
          const id = randomUUID();
          this.state.users.set(id, { id, phone, roles: ['customer'], consents: [] });
          return id;
        },
        recordConsent: async (userId, consentType, granted, version) => {
          const user = this.state.users.get(userId)!;
          user.consents = user.consents.filter((consent) => consent.consentType !== consentType);
          user.consents.push({
            consentType,
            granted,
            version,
            createdAt: this.clock().toISOString(),
          });
        },
        createSession: async (hash, userId, expiresAt) => {
          if (this.failSession) throw new Error('Test session write failure');
          this.state.sessions.set(hash, { userId, expiresAt });
        },
        audit: async (_id, event) => {
          this.state.audits.push(event);
        },
      };
      try {
        return await work(tx);
      } catch (error) {
        this.state = snapshot;
        throw error;
      }
    });
    this.tail = run.catch(() => {});
    return run;
  }
  async invalidateChallenge(id: string, now: Date) {
    const row = this.state.challenges.get(id);
    if (row) row.consumedAt = now;
  }
  async profile(hash: string, now: Date) {
    const session = this.state.sessions.get(hash);
    return session && session.expiresAt > now
      ? structuredClone(this.state.users.get(session.userId) ?? null)
      : null;
  }
  async revokeSession(hash: string) {
    this.state.sessions.delete(hash);
  }
}

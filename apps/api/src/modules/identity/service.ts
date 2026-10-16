import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import {
  CONSENT_VERSION,
  type IdentityProfile,
  type OtpChallengeResponse,
} from '@healthwallet/shared';
import type { MessagingAdapter } from '../../adapters/types.js';
import type { IdentityStore } from './store.js';
import { hasAnyRole } from './store.js';

const deriveKey = promisify(scrypt);
export const SESSION_SECONDS = 8 * 60 * 60;
export class IdentityError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
async function codeHash(code: string, challengeId: string): Promise<string> {
  return ((await deriveKey(code, challengeId, 32)) as Buffer).toString('hex');
}

export class IdentityService {
  constructor(
    private readonly store: IdentityStore,
    private readonly messaging: MessagingAdapter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async requestCode(phone: string, ip: string): Promise<OtpChallengeResponse> {
    const now = this.clock();
    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ipHash = tokenHash(ip);
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    await this.store.transaction(async (tx) => {
      await tx.lockRequest(phone, ipHash);
      const counts = await tx.requestCounts(
        phone,
        ipHash,
        new Date(now.getTime() - 3_600_000),
        new Date(now.getTime() - 60_000),
      );
      if (counts.coolingDown || counts.phone >= 5 || counts.ip >= 20) {
        throw new IdentityError(429, 'Too many code requests. Wait before trying again.');
      }
      await tx.invalidatePhone(phone, now);
      await tx.createChallenge({
        id,
        phone,
        authMethod: this.messaging.mode === 'sandbox' ? 'sandbox' : 'phone',
        codeHash: await codeHash(code, id),
        ipHash,
        expiresAt,
        createdAt: now,
        attempts: 0,
        consumedAt: null,
      });
    });
    try {
      const result = await this.messaging.send({
        to: phone,
        channel: 'sms',
        body: `HealthWallet ${this.messaging.mode === 'sandbox' ? 'simulation ' : ''}code: ${code}. Expires in five minutes.`,
      });
      if (!result.accepted) throw new Error('Delivery rejected');
    } catch {
      await this.store.invalidateChallenge(id, this.clock());
      throw new IdentityError(503, 'The code could not be issued. Try again later.');
    }
    return {
      challengeId: id,
      expiresAt: expiresAt.toISOString(),
      ...(this.messaging.mode === 'sandbox' ? { sandboxCode: code } : {}),
      simulation: this.messaging.mode === 'sandbox',
    };
  }

  async verifyCode(challengeId: string, code: string, consentVersion: string = CONSENT_VERSION) {
    const token = randomBytes(32).toString('hex');
    const userId = await this.store.transaction(async (tx) => {
      const challenge = await tx.challengeForUpdate(challengeId);
      // Check time after obtaining the row lock, so a queued request cannot revive an expired code.
      const now = this.clock();
      if (
        !challenge ||
        challenge.authMethod !== (this.messaging.mode === 'sandbox' ? 'sandbox' : 'phone') ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attempts >= 5
      )
        return null;
      const hash = await codeHash(code, challengeId);
      const attempts = challenge.attempts + 1;
      if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(challenge.codeHash, 'hex'))) {
        await tx.updateChallenge(challengeId, attempts, attempts >= 5 ? now : null);
        // Return instead of throwing: the failed attempt must commit.
        return null;
      }
      await tx.updateChallenge(challengeId, attempts, now);
      const id = await tx.ensureCustomer(challenge.phone);
      await tx.recordConsent(id, 'service_terms', true, consentVersion);
      await tx.recordConsent(id, 'health_data', true, consentVersion);
      await tx.createSession(
        tokenHash(token),
        id,
        new Date(now.getTime() + SESSION_SECONDS * 1000),
        this.messaging.mode === 'sandbox' ? 'sandbox' : 'phone',
      );
      await tx.audit(
        id,
        this.messaging.mode === 'sandbox' ? 'identity.sandbox_sign_in' : 'identity.phone_sign_in',
      );
      return id;
    });
    if (!userId)
      throw new IdentityError(401, 'Invalid or expired code. Request a new code if needed.');
    return { token };
  }

  async profile(token: string | undefined): Promise<IdentityProfile> {
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new IdentityError(401, 'Sign in to continue.');
    const profile = await this.store.profile(tokenHash(token), this.clock());
    if (!profile) throw new IdentityError(401, 'Your session has expired. Sign in again.');
    return profile;
  }
  async consent(
    token: string | undefined,
    input: { consentType: 'service_terms' | 'health_data'; granted: boolean; version: string },
  ) {
    const profile = await this.profile(token);
    if (
      !hasAnyRole(profile, [
        'customer',
        'contributor',
        'provider_staff',
        'provider_manager',
        'organization_admin',
        'program_manager',
        'finance_operator',
        'partner_officer',
        'provider_admin',
        'employer_admin',
        'sponsor_admin',
        'reviewer',
        'platform_admin',
      ])
    ) {
      throw new IdentityError(403, 'Your role cannot change consent records.');
    }
    await this.store.transaction(async (tx) => {
      await tx.recordConsent(profile.id, input.consentType, input.granted, input.version);
      await tx.audit(
        profile.id,
        `identity.consent.${input.consentType}.${input.granted ? 'granted' : 'withdrawn'}`,
      );
    });
  }
  async logout(token: string | undefined) {
    if (token && /^[a-f0-9]{64}$/.test(token)) await this.store.revokeSession(tokenHash(token));
  }
}

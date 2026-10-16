import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { SandboxMessagingAdapter } from '../../adapters/messaging.sandbox.js';
import { PostgresIdentityStore } from './postgres.js';
import { IdentityService } from './service.js';

// Opt-in suite: CI runs it only after migrating its disposable PostgreSQL service.
describe.skipIf(process.env.IDENTITY_DATABASE_TESTS !== '1')(
  'PostgreSQL identity transactions',
  () => {
    let pool: pg.Pool;
    let service: IdentityService;
    const phones: string[] = [];
    const phone = () => {
      const value = `+999${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
      phones.push(value);
      return value;
    };
    beforeAll(() => {
      const url = process.env.DATABASE_URL;
      if (!url || process.env.APP_ENV !== 'test' || !new URL(url).pathname.endsWith('_test')) {
        throw new Error(
          'Database integration tests require APP_ENV=test and DATABASE_URL pointing to a dedicated *_test database.',
        );
      }
      pool = new pg.Pool({ connectionString: url });
      service = new IdentityService(new PostgresIdentityStore(pool), new SandboxMessagingAdapter());
    });
    afterAll(async () => {
      if (!pool) return;
      try {
        await pool.query(
          'DELETE FROM audit_events WHERE actor_user_id IN (SELECT id FROM users WHERE phone_e164 = ANY($1::text[]))',
          [phones],
        );
        await pool.query('DELETE FROM users WHERE phone_e164 = ANY($1::text[])', [phones]);
        await pool.query('DELETE FROM otp_challenges WHERE phone = ANY($1::text[])', [phones]);
      } finally {
        await pool.end();
      }
    });
    it('allows only one concurrent verification and persists identity, consent, and revocation', async () => {
      const challenge = await service.requestCode(phone(), randomUUID());
      const results = await Promise.allSettled([
        service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
        service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
      ]);
      const successes = results.filter((result) => result.status === 'fulfilled');
      expect(successes).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const { token } = successes[0].value;
      const profile = await service.profile(token);
      expect(profile.roles).toEqual(['customer']);
      expect(profile.consents).toHaveLength(2);
      const sessions = await pool.query('SELECT token_hash FROM auth_sessions WHERE user_id = $1', [
        profile.id,
      ]);
      expect(sessions.rowCount).toBe(1);
      expect(sessions.rows[0].token_hash).not.toBe(token);
      await service.logout(token);
      await expect(service.profile(token)).rejects.toMatchObject({ statusCode: 401 });
    });
    it('serializes concurrent code requests by phone', async () => {
      const number = phone();
      const results = await Promise.allSettled([
        service.requestCode(number, randomUUID()),
        service.requestCode(number, randomUUID()),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const failures = results.filter((result) => result.status === 'rejected');
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toMatchObject({ statusCode: 429 });
    });
    it('persists failed attempts and locks out the correct code after five failures', async () => {
      const challenge = await service.requestCode(phone(), randomUUID());
      const wrong = challenge.sandboxCode! === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++)
        await expect(service.verifyCode(challenge.challengeId, wrong)).rejects.toMatchObject({
          statusCode: 401,
        });
      const result = await pool.query(
        'SELECT attempts, consumed_at FROM otp_challenges WHERE id = $1',
        [challenge.challengeId],
      );
      expect(result.rows[0].attempts).toBe(5);
      expect(result.rows[0].consumed_at).not.toBeNull();
      await expect(
        service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  },
);

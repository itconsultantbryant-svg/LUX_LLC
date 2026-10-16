import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, LIVE_CONSENT_VERSION } from '@healthwallet/shared';
import { SandboxMessagingAdapter } from '../../adapters/messaging.sandbox.js';
import { IdentityService, SESSION_SECONDS, tokenHash } from './service.js';
import { MemoryIdentityStore } from './memory.test-support.js';

function setup() {
  let time = Date.parse('2026-10-09T10:00:00Z');
  const clock = () => new Date(time);
  const store = new MemoryIdentityStore(clock);
  const service = new IdentityService(store, new SandboxMessagingAdapter(), clock);
  return {
    store,
    service,
    clock,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
const phone = '+231770000000';
const ip = '127.0.0.1';

describe('sandbox identity', () => {
  it('creates a least-privilege account with hashed credentials and consent, then revokes its session', async () => {
    const { service, store } = setup();
    const challenge = await service.requestCode(phone, ip);
    expect(challenge.simulation).toBe(true);
    expect(store.state.challenges.get(challenge.challengeId)!.codeHash).not.toContain(
      challenge.sandboxCode!,
    );
    const { token } = await service.verifyCode(challenge.challengeId, challenge.sandboxCode!);
    expect(store.state.sessions.has(token)).toBe(false);
    expect(store.state.sessions.has(tokenHash(token))).toBe(true);
    const profile = await service.profile(token);
    expect(profile.roles).toEqual(['customer']);
    expect(profile.phone).toBe(phone);
    expect(profile.consents).toHaveLength(2);
    expect(
      profile.consents.every((consent) => consent.granted && consent.version === CONSENT_VERSION),
    ).toBe(true);
    await service.logout(token);
    await expect(service.profile(token)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('expires codes at five minutes', async () => {
    const { service, advance } = setup();
    const challenge = await service.requestCode(phone, ip);
    advance(5 * 60_000);
    await expect(
      service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
  it('commits incorrect attempts and locks out after five attempts', async () => {
    const { service, store } = setup();
    const challenge = await service.requestCode(phone, ip);
    const wrong = challenge.sandboxCode! === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(service.verifyCode(challenge.challengeId, wrong)).rejects.toMatchObject({
        statusCode: 401,
      });
    expect(store.state.challenges.get(challenge.challengeId)!.attempts).toBe(5);
    await expect(
      service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(store.state.users.size).toBe(0);
  }, 20_000);
  it('rejects reuse including concurrent verification', async () => {
    const { service, store } = setup();
    const challenge = await service.requestCode(phone, ip);
    const results = await Promise.allSettled([
      service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
      service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(store.state.sessions.size).toBe(1);
  });
  it('enforces resend cooldown and invalidates the previous code', async () => {
    const { service, advance } = setup();
    const first = await service.requestCode(phone, ip);
    await expect(service.requestCode(phone, ip)).rejects.toMatchObject({ statusCode: 429 });
    advance(60_000);
    const second = await service.requestCode(phone, ip);
    await expect(service.verifyCode(first.challengeId, first.sandboxCode!)).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      service.verifyCode(second.challengeId, second.sandboxCode!),
    ).resolves.toHaveProperty('token');
  });
  it('limits requests per phone over an hour', async () => {
    const { service, advance } = setup();
    for (let i = 0; i < 5; i++) {
      await service.requestCode(phone, ip);
      advance(60_000);
    }
    await expect(service.requestCode(phone, 'another-ip')).rejects.toMatchObject({
      statusCode: 429,
    });
    advance(3_600_000);
    await expect(service.requestCode(phone, ip)).resolves.toHaveProperty('challengeId');
  }, 20_000);
  it('limits different numbers from the same IP', async () => {
    const { service } = setup();
    for (let i = 0; i < 20; i++)
      await service.requestCode(`+2317700000${String(i).padStart(2, '0')}`, ip);
    await expect(service.requestCode('+231880000000', ip)).rejects.toMatchObject({
      statusCode: 429,
    });
  }, 20_000);
  it('rolls back code consumption, user, consent, and audit when session creation fails', async () => {
    const { service, store } = setup();
    const challenge = await service.requestCode(phone, ip);
    store.failSession = true;
    await expect(service.verifyCode(challenge.challengeId, challenge.sandboxCode!)).rejects.toThrow(
      'Test session write failure',
    );
    expect(store.state.users.size).toBe(0);
    expect(store.state.audits).toEqual([]);
    expect(store.state.challenges.get(challenge.challengeId)!.consumedAt).toBeNull();
    store.failSession = false;
    await expect(
      service.verifyCode(challenge.challengeId, challenge.sandboxCode!),
    ).resolves.toHaveProperty('token');
  });
  it('expires sessions and does not accept arbitrary tokens', async () => {
    const { service, advance } = setup();
    const challenge = await service.requestCode(phone, ip);
    const { token } = await service.verifyCode(challenge.challengeId, challenge.sandboxCode!);
    await expect(service.profile('forged')).rejects.toMatchObject({ statusCode: 401 });
    advance(SESSION_SECONDS * 1000);
    await expect(service.profile(token)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('records withdrawal for the current user and enforces read-only roles', async () => {
    const { service, store } = setup();
    const challenge = await service.requestCode(phone, ip);
    const { token } = await service.verifyCode(challenge.challengeId, challenge.sandboxCode!);
    await service.consent(token, {
      consentType: 'health_data',
      granted: false,
      version: CONSENT_VERSION,
    });
    const profile = await service.profile(token);
    expect(profile.consents.find((item) => item.consentType === 'health_data')!.granted).toBe(
      false,
    );
    store.state.users.get(profile.id)!.roles = ['partner_readonly'];
    await expect(
      service.consent(token, {
        consentType: 'health_data',
        granted: true,
        version: CONSENT_VERSION,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('preserves existing roles and keeps profiles isolated between users', async () => {
    const { service, store, advance } = setup();
    const first = await service.requestCode(phone, ip);
    const firstSession = await service.verifyCode(first.challengeId, first.sandboxCode!);
    const firstProfile = await service.profile(firstSession.token);
    store.state.users.get(firstProfile.id)!.roles = ['reviewer'];
    const second = await service.requestCode('+231880000000', ip);
    const secondSession = await service.verifyCode(second.challengeId, second.sandboxCode!);
    const secondProfile = await service.profile(secondSession.token);
    expect(secondProfile.id).not.toBe(firstProfile.id);
    expect(secondProfile.roles).toEqual(['customer']);
    await service.consent(firstSession.token, {
      consentType: 'health_data',
      granted: false,
      version: CONSENT_VERSION,
    });
    expect(
      (await service.profile(secondSession.token)).consents.find(
        (item) => item.consentType === 'health_data',
      )!.granted,
    ).toBe(true);
    advance(60_000);
    const again = await service.requestCode(phone, ip);
    const againSession = await service.verifyCode(again.challengeId, again.sandboxCode!);
    expect((await service.profile(againSession.token)).roles).toEqual(['reviewer']);
    expect(store.state.users.size).toBe(2);
  });

  it('invalidates codes if the messaging adapter rejects delivery', async () => {
    const { store, clock } = setup();
    const service = new IdentityService(
      store,
      { id: 'reject', mode: 'sandbox', send: async () => ({ accepted: false }) },
      clock,
    );
    await expect(service.requestCode(phone, ip)).rejects.toMatchObject({ statusCode: 503 });
    expect([...store.state.challenges.values()][0].consumedAt).not.toBeNull();
  });
});

describe('live verification provider isolation', () => {
  it('never returns a live code and verifies the delivered code', async () => {
    const { store, clock } = setup();
    let delivered = '';
    const service = new IdentityService(
      store,
      {
        id: 'test.live',
        mode: 'live',
        send: async (input) => {
          delivered = input.body;
          return { accepted: true };
        },
      },
      clock,
    );
    const challenge = await service.requestCode(phone, ip);
    expect(challenge.simulation).toBe(false);
    expect(challenge).not.toHaveProperty('sandboxCode');
    const code = delivered.match(/code: (\d{6})/)![1];
    const result = await service.verifyCode(challenge.challengeId, code, LIVE_CONSENT_VERSION);
    expect((await service.profile(result.token)).roles).toEqual(['customer']);
  });
  it('rejects a sandbox challenge when verification switches to a live provider', async () => {
    const { service, store, clock } = setup();
    const challenge = await service.requestCode(phone, ip);
    const live = new IdentityService(
      store,
      { id: 'test.live', mode: 'live', send: async () => ({ accepted: true }) },
      clock,
    );
    await expect(
      live.verifyCode(challenge.challengeId, challenge.sandboxCode!, LIVE_CONSENT_VERSION),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

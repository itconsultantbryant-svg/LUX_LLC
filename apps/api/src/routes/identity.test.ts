import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { CONSENT_VERSION } from '@healthwallet/shared';
import type { Db } from '../db/client.js';
import { loadEnv } from '../config/env.js';
import { createAdapters } from '../adapters/index.js';
import { IdentityService } from '../modules/identity/service.js';
import { MemoryIdentityStore } from '../modules/identity/memory.test-support.js';
import { identityRoutes } from './identity.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup(appEnv = 'test') {
  const app = Fastify();
  apps.push(app);
  const env = loadEnv({
    APP_ENV: appEnv,
    DATABASE_URL: 'postgresql://unused',
    CORS_ORIGIN: 'http://localhost:5173,https://demo.example',
    PAYMENT_CALLBACK_SECRET: 'sandbox-payment-callback-secret',
    DOWNLOAD_LINK_SECRET: 'sandbox-download-link-secret-0000',
  });
  const adapters = createAdapters(env);
  const store = new MemoryIdentityStore(() => new Date());
  app.decorate('ctx', { env, pool: {} as pg.Pool, db: {} as Db, adapters });
  await app.register(identityRoutes, { service: new IdentityService(store, adapters.messaging) });
  return { app, store };
}
async function challenge(app: FastifyInstance) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/request-code',
    payload: { phone: '+231770000000' },
  });
  expect(response.statusCode).toBe(200);
  const data = response.json();
  return {
    challengeId: data.challengeId,
    code: data.sandboxCode,
    serviceTerms: true,
    healthData: true,
    consentVersion: CONSENT_VERSION,
  };
}

describe('identity HTTP boundary', () => {
  it('completes sign-in, session restoration, consent withdrawal, and logout with an HTTP-only cookie', async () => {
    const { app } = await setup();
    const payload = await challenge(app);
    const signedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-code',
      headers: { origin: 'https://demo.example' },
      payload,
    });
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json()).not.toHaveProperty('token');
    const setCookie = String(signedIn.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    const cookie = setCookie.split(';')[0];
    const me = await app.inject({ url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.json().profile.roles).toEqual(['customer']);
    const consent = await app.inject({
      method: 'POST',
      url: '/api/auth/consent',
      headers: { cookie },
      payload: { consentType: 'health_data', granted: false, version: CONSENT_VERSION },
    });
    expect(consent.statusCode).toBe(200);
    expect(
      consent
        .json()
        .profile.consents.find(
          (item: { consentType: string }) => item.consentType === 'health_data',
        ).granted,
    ).toBe(false);
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });
  it('requires a session and rejects caller-selected users and roles', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/api/auth/me' })).statusCode).toBe(401);
    const payload = await challenge(app);
    const escalated = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-code',
      payload: { ...payload, role: 'platform_admin' },
    });
    expect(escalated.statusCode).toBe(400);
    const impersonated = await app.inject({
      method: 'POST',
      url: '/api/auth/consent',
      payload: {
        userId: 'someone-else',
        consentType: 'health_data',
        granted: true,
        version: CONSENT_VERSION,
      },
    });
    expect(impersonated.statusCode).toBe(400);
  });
  it('rejects missing consent and stale consent versions without consuming the code', async () => {
    const { app } = await setup();
    const payload = await challenge(app);
    for (const invalid of [
      { ...payload, serviceTerms: false },
      { ...payload, healthData: false },
      { ...payload, consentVersion: 'old' },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url: '/api/auth/verify-code', payload: invalid }))
          .statusCode,
      ).toBe(400);
    }
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/verify-code', payload })).statusCode,
    ).toBe(200);
  });
  it('blocks untrusted origins and cross-site requests', async () => {
    const { app, store } = await setup();
    for (const headers of [
      { origin: 'https://attacker.example' },
      { 'sec-fetch-site': 'cross-site' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/request-code',
            headers,
            payload: { phone: '+231770000000' },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(store.state.challenges.size).toBe(0);
  });
  it('disables sandbox authentication in production', async () => {
    const { app, store } = await setup('production');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/request-code',
          payload: { phone: '+231770000000' },
        })
      ).statusCode,
    ).toBe(503);
    expect((await app.inject({ url: '/api/auth/me' })).statusCode).toBe(503);
    expect(store.state.challenges.size).toBe(0);
  });
  it('returns validation errors for malformed requests', async () => {
    const { app } = await setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/request-code',
          payload: { phone: '0770000000' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/verify-code',
          payload: { challengeId: "' OR true", code: '123456' },
        })
      ).statusCode,
    ).toBe(400);
  });
});

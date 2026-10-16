import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  RecordConsentSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
  CONSENT_VERSION,
  LIVE_CONSENT_VERSION,
} from '@healthwallet/shared';
import { IdentityError, IdentityService, SESSION_SECONDS } from '../modules/identity/service.js';
import { limit } from '../modules/security/limits.js';
import { PostgresIdentityStore } from '../modules/identity/postgres.js';

const COOKIE = 'hw_session';
export function sessionToken(request: FastifyRequest): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}
export const identityRoutes: FastifyPluginAsync<{ service?: IdentityService }> = async (
  app,
  options,
) => {
  const service =
    options.service ??
    new IdentityService(
      new PostgresIdentityStore(app.ctx.pool, app.ctx.env.APP_ENV !== 'production'),
      app.ctx.adapters.messaging,
    );
  const origins = new Set(app.ctx.env.CORS_ORIGIN.split(',').map((value) => value.trim()));
  const cookie = (request: FastifyRequest, token: string, maxAge: number) =>
    `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${app.ctx.env.APP_ENV === 'production' || request.protocol === 'https' || request.headers.origin?.startsWith('https://') ? '; Secure' : ''}`;

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (app.ctx.env.APP_ENV === 'production' && app.ctx.adapters.messaging.mode === 'sandbox') {
      return reply
        .code(503)
        .send({ message: 'Sandbox sign-in is unavailable in this environment.' });
    }
    if (
      request.method !== 'GET' &&
      request.headers.origin &&
      !origins.has(request.headers.origin)
    ) {
      return reply.code(403).send({ message: 'This request origin is not allowed.' });
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      return reply
        .code(403)
        .send({ message: 'Cross-site authentication requests are not allowed.' });
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IdentityError)
      return reply.code(error.statusCode).send({ message: error.message });
    if (
      error instanceof Error &&
      (('validation' in error && error.validation) ||
        ('statusCode' in error && error.statusCode === 400))
    )
      return reply.code(400).send({ message: 'Invalid request.' });
    // Do not log database parameters, phone numbers, codes, or cookies.
    app.log.error(
      { errorType: error instanceof Error ? error.name : 'UnknownError' },
      'Identity operation failed',
    );
    return reply
      .code(500)
      .send({ message: 'Sign-in is temporarily unavailable. Please try again later.' });
  });
  app.get('/api/auth/config', async () => ({
    simulation: app.ctx.adapters.messaging.mode === 'sandbox',
    consentVersion:
      app.ctx.adapters.messaging.mode === 'sandbox' ? CONSENT_VERSION : LIVE_CONSENT_VERSION,
    mfaConfigured: !!app.ctx.env.SECURITY_ENCRYPTION_KEY,
  }));
  app.post('/api/auth/request-code', async (request, reply) => {
    const parsed = RequestOtpSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ message: 'Enter a phone number in international format, such as +231770000000.' });
    if (!options.service) await limit(app.ctx.pool, 'otp-request-ip', request.ip, 20, 3600);
    return service.requestCode(parsed.data.phone, request.ip);
  });
  app.post('/api/auth/verify-code', async (request, reply) => {
    const parsed = VerifyOtpSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ message: 'A six-digit code and both current sandbox consents are required.' });
    if (
      parsed.data.consentVersion !==
      (app.ctx.adapters.messaging.mode === 'sandbox' ? CONSENT_VERSION : LIVE_CONSENT_VERSION)
    )
      return reply.code(400).send({ message: 'Accept the current consent version.' });
    if (!options.service) await limit(app.ctx.pool, 'otp-verify-ip', request.ip, 60, 900);
    const { token } = await service.verifyCode(
      parsed.data.challengeId,
      parsed.data.code,
      parsed.data.consentVersion,
    );
    await service.logout(sessionToken(request));
    reply.header('Set-Cookie', cookie(request, token, SESSION_SECONDS));
    return {
      simulation: app.ctx.adapters.messaging.mode === 'sandbox',
      profile: await service.profile(token),
    };
  });
  app.get('/api/auth/me', async (request) => ({
    simulation: app.ctx.adapters.messaging.mode === 'sandbox',
    profile: await service.profile(sessionToken(request)),
  }));
  app.post('/api/auth/consent', async (request, reply) => {
    const parsed = RecordConsentSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ message: 'Invalid consent type or version.' });
    if (
      parsed.data.version !==
      (app.ctx.adapters.messaging.mode === 'sandbox' ? CONSENT_VERSION : LIVE_CONSENT_VERSION)
    )
      return reply.code(400).send({ message: 'Use the current consent version.' });
    await service.consent(sessionToken(request), parsed.data);
    return {
      simulation: app.ctx.adapters.messaging.mode === 'sandbox',
      profile: await service.profile(sessionToken(request)),
    };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    await service.logout(sessionToken(request));
    reply.header('Set-Cookie', cookie(request, '', 0));
    return { signedOut: true };
  });
};

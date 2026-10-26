import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  RecordConsentSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
  CONSENT_VERSION,
  LIVE_CONSENT_VERSION,
} from '@healthwallet/shared';
import {
  IdentityError,
  IdentityService,
  SESSION_SECONDS,
  tokenHash,
} from '../modules/identity/service.js';
import { limit } from '../modules/security/limits.js';
import { PostgresIdentityStore } from '../modules/identity/postgres.js';
import { passwordMatches } from '../modules/identity/password.js';

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
  app.post('/api/auth/credential-login', async (request, reply) => {
    const body = z.object({ identifier: z.string().trim().min(3).max(320), password: z.string().min(12).max(200) }).strict().parse(request.body);
    await limit(app.ctx.pool, 'credential-login-ip', request.ip, 10, 900);
    const identifier = body.identifier.toLowerCase();
    const result = await app.ctx.pool.query<{ id: string; password_hash: string; locked_until: Date | null; failed_attempts: number }>(
      `SELECT u.id,c.password_hash,c.locked_until,c.failed_attempts FROM credential_logins c JOIN users u ON u.id=c.user_id
       WHERE c.identifier=$1 AND u.suspended_at IS NULL FOR UPDATE OF c,u`, [identifier]);
    const credential = result.rows[0];
    // Deliberately use the same response for invalid identifier and password.
    if (!credential || (credential.locked_until && credential.locked_until > new Date()) || !(await passwordMatches(body.password, credential.password_hash))) {
      if (credential) await app.ctx.pool.query(`UPDATE credential_logins SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END,updated_at=now() WHERE user_id=$1`, [credential.id]);
      throw new IdentityError(401, 'Invalid credentials or account temporarily locked.');
    }
    await app.ctx.pool.query('UPDATE credential_logins SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE user_id=$1', [credential.id]);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    await app.ctx.pool.query(
      `INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method,mfa_verified_at)
       VALUES($1,$2,$3,'password',CASE WHEN $4 THEN now() ELSE NULL END)`,
      [tokenHash(token), credential.id, expiresAt, app.ctx.env.APP_ENV !== 'production'],
    );
    await app.ctx.pool.query("INSERT INTO audit_events(actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,'auth.credential_login','user',$1,'{}')", [credential.id]);
    reply.header('Set-Cookie', cookie(request, token, SESSION_SECONDS));
    return {
      // Development/demo credentials are synthetic accounts whose sandbox session is
      // explicitly marked MFA-verified above. Production credentials still require
      // an authenticator challenge before institutional access.
      mfaRequired: app.ctx.env.APP_ENV === 'production',
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

  // Platform-admin password sign-in. This is the demo/operator convenience the
  // brief asked for; it is hard-disabled in production, where an administrator
  // signs in with a verified phone number and an authenticator code instead.
  app.post('/api/auth/admin-login', async (request, reply) => {
    if (app.ctx.env.APP_ENV === 'production')
      return reply.code(404).send({ message: 'Not found.' });
    await limit(app.ctx.pool, 'admin-login-ip', request.ip, 10, 900);
    const body = z
      .object({ password: z.string().min(1).max(200) })
      .strict()
      .parse(request.body);
    const expected = Buffer.from(app.ctx.env.ADMIN_PASSWORD, 'utf8');
    const supplied = Buffer.from(body.password, 'utf8');
    const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);
    if (!matches) throw new IdentityError(401, 'Incorrect administrator password.');
    const admin = (
      await app.ctx.pool.query<{ id: string }>(
        app.ctx.env.ADMIN_PHONE
          ? `SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id
              WHERE r.role='platform_admin' AND u.suspended_at IS NULL AND u.phone_e164=$1 LIMIT 1`
          : `SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id
              WHERE r.role='platform_admin' AND u.suspended_at IS NULL
              ORDER BY EXISTS(
                SELECT 1 FROM organizations o
                 WHERE o.created_by=u.id
                    OR EXISTS(SELECT 1 FROM organization_memberships m
                               WHERE m.organization_id=o.id AND m.user_id=u.id)
              ), u.created_at, u.id LIMIT 1`,
        app.ctx.env.ADMIN_PHONE ? [app.ctx.env.ADMIN_PHONE] : [],
      )
    ).rows[0];
    if (!admin)
      throw new IdentityError(
        503,
        'No platform administrator is provisioned for password sign-in.',
      );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    await app.ctx.pool.query(
      `INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method,mfa_verified_at)
       SELECT $1,$2,$3,'sandbox',now() WHERE EXISTS (SELECT 1 FROM users WHERE id=$2 AND suspended_at IS NULL)`,
      [tokenHash(token), admin.id, expiresAt],
    );
    await app.ctx.pool.query(
      "INSERT INTO audit_events(actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,'auth.admin_password_login','user',$1,'{}')",
      [admin.id],
    );
    reply.header('Set-Cookie', cookie(request, token, SESSION_SECONDS));
    return {
      simulation: app.ctx.adapters.messaging.mode === 'sandbox',
      profile: await service.profile(token),
    };
  });
};

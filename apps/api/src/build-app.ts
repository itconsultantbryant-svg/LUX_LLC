import cors from '@fastify/cors';
import { Readable } from 'node:stream';
import { providerRoutes } from './routes/providers.js';
import { fundingRoutes } from './routes/funding.js';
import { withSession } from './modules/security/access.js';
import { limit } from './modules/security/limits.js';
import { sessionToken } from './routes/identity.js';
import { IdentityError } from './modules/identity/service.js';
import { securityRoutes } from './routes/security.js';
import { identityRoutes } from './routes/identity.js';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Adapters } from './adapters/index.js';
import type { Env } from './config/env.js';
import type { Db } from './db/client.js';
import type pg from 'pg';
import { aiDemoRoutes } from './routes/ai.demo.js';
import { operationsRoutes } from './routes/operations.js';
import { validationRoutes } from './routes/validation.js';
import { assistanceRoutes } from './routes/assistance.js';
import { paymentsRoutes } from './routes/payments.js';
import { assistantRoutes } from './routes/assistant.js';
import { chatRoutes } from './routes/chat.js';
import { locationRoutes } from './routes/location.js';
import { pinRoutes } from './routes/pins.js';
import { receiptRoutes } from './routes/receipts.js';
import { notificationRoutes } from './routes/notifications.js';
import { governanceRoutes } from './routes/governance.js';
import { partnerRoutes } from './routes/partners.js';
import { healthRoutes } from './routes/health.js';
import { metaRoutes } from './routes/meta.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { employerRoutes } from './routes/employers.js';

/** Global mutation limiter. Registered as an onRequest hook (runs before handlers). */
function addMutationLimit(app: FastifyInstance, deps: { env: Env; pool: pg.Pool }) {
  const exempt = new Set([
    '/api/auth/request-code',
    '/api/auth/verify-code',
    '/api/auth/credential-login',
    // Provider callbacks are signature-verified; throttling them could drop legitimate events.
    '/api/payments/callback',
  ]);
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/') || request.method === 'GET' || request.method === 'HEAD') return;
    if (exempt.has(path)) return;
    try {
      await limit(
        deps.pool,
        'api-mutation',
        request.ip,
        deps.env.RATE_LIMIT_MUTATIONS,
        deps.env.RATE_LIMIT_WINDOW_SECONDS,
      );
    } catch (error) {
      reply.header('Retry-After', String(deps.env.RATE_LIMIT_WINDOW_SECONDS));
      return reply.code(429).send({
        message:
          error instanceof IdentityError
            ? error.message
            : 'Too many requests. Wait before trying again.',
      });
    }
  });
}

export async function buildApp(deps: { env: Env; pool: pg.Pool; db: Db; adapters: Adapters }) {
  const app = Fastify({
    logger: {
      level: deps.env.LOG_LEVEL,
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'req.headers["x-secret"]',
      ],
    },
  });

  app.decorate('ctx', {
    env: deps.env,
    pool: deps.pool,
    db: deps.db,
    adapters: deps.adapters,
  });

  await app.register(cors, {
    credentials: true,
    origin: deps.env.CORS_ORIGIN.split(',').map((value) => value.trim()),
  });

  const publicPaths = new Set([
    '/api/auth/config',
    '/api/auth/request-code',
    '/api/auth/verify-code',
    '/api/auth/credential-login',
    '/api/auth/admin-login',
    '/api/auth/logout',
    '/api/meta',
    '/api/fees',
    '/api/funding/resolve',
    '/api/payments/callback',
  ]);
  const origins = new Set(deps.env.CORS_ORIGIN.split(',').map((value) => value.trim()));
  // Capture the raw body of provider callbacks so signatures verify over the
  // exact bytes received (before JSON parsing).
  app.addHook('preParsing', async (request, _reply, payload) => {
    if (request.url.split('?')[0] !== '/api/payments/callback') return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload) chunks.push(Buffer.from(chunk as Buffer));
    const raw = Buffer.concat(chunks);
    (request as typeof request & { rawBody?: Buffer }).rawBody = raw;
    return Readable.from(raw);
  });
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (
      request.headers['sec-fetch-site'] === 'cross-site' ||
      (request.method !== 'GET' && request.headers.origin && !origins.has(request.headers.origin))
    )
      return reply.code(403).send({ message: 'This request origin is not allowed.' });
    if (publicPaths.has(path)) return;
    try {
      await withSession(deps.pool, deps.env, sessionToken(request), async () => true);
    } catch (error) {
      return reply.code(error instanceof IdentityError ? error.statusCode : 503).send({
        message:
          error instanceof IdentityError
            ? error.message
            : 'Authentication is temporarily unavailable.',
      });
    }
  });
  // Defense in depth: a global per-IP limit on mutating API calls, on top of the
  // module-specific limits. Public authentication routes keep their own stricter
  // limits and are exempt here so a shared NAT does not lock out sign-in.
  addMutationLimit(app, deps);
  await app.register(healthRoutes);
  await app.register(metaRoutes);
  await app.register(identityRoutes);
  await app.register(securityRoutes);
  await app.register(fundingRoutes);
  await app.register(providerRoutes);
  await app.register(aiDemoRoutes);
  await app.register(operationsRoutes);
  await app.register(validationRoutes);
  await app.register(assistanceRoutes);
  await app.register(paymentsRoutes);
  await app.register(assistantRoutes);
  await app.register(chatRoutes);
  await app.register(locationRoutes);
  await app.register(pinRoutes);
  await app.register(receiptRoutes);
  await app.register(notificationRoutes);
  await app.register(governanceRoutes);
  await app.register(partnerRoutes);
  await app.register(employerRoutes);
  await app.register(accountRoutes);
  await app.register(adminRoutes);

  return app;
}

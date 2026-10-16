import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withSession } from '../modules/security/access.js';
import { disabledError, flagEnabled } from '../modules/security/flags.js';
import { sessionToken } from './identity.js';
import { IdentityError } from '../modules/identity/service.js';

/**
 * Foundation demo for LUX HealthTrust sandbox extraction.
 * Full bill workflow arrives in Phase 1–2; this proves adapter wiring and schema validation.
 */
export const aiDemoRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/ai/sandbox-extract', async (request, reply) => {
    if (app.ctx.env.APP_ENV === 'production')
      return reply.code(404).send({ message: 'Not found.' });
    try {
      await withSession(app.ctx.pool, app.ctx.env, sessionToken(request), async (access) => {
        if (!(await flagEnabled(access.client, 'ai_extraction')))
          throw disabledError('AI extraction');
        return true;
      });
    } catch (error) {
      if (error instanceof IdentityError)
        return reply.code(error.statusCode).send({ message: error.message });
      return reply.code(500).send({ message: 'Sign in to use sandbox extraction.' });
    }
    const body = z
      .object({
        hintText: z.string().max(2000).optional(),
        contentType: z.string().default('text/plain'),
      })
      .parse(request.body ?? {});

    const bytes = Buffer.from(body.hintText ?? 'Demo healthcare bill', 'utf8');
    const stored = await app.ctx.adapters.storage.putObject({
      key: `demo/${Date.now()}-bill.txt`,
      bytes,
      contentType: body.contentType,
    });

    const extraction = await app.ctx.adapters.ai.extractFromDocument({
      storageKey: stored.key,
      contentType: stored.contentType,
      bytes,
    });

    return reply.send({
      simulation: true,
      storage: stored,
      extraction,
      metricsNote:
        'AI involvement is recorded conceptually here; durable ai_artifacts metrics land with the bill workflow.',
    });
  });
};

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { AccountService } from '../modules/account/service.js';
import { sessionToken } from './identity.js';

/**
 * Data-subject endpoints: export the caller's own data and request deletion.
 * Deletion is processed by an operator under the retention policy; financial and
 * audit records are retained.
 */
export const accountRoutes: FastifyPluginAsync = async (app) => {
  const account = new AccountService();

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Account operation failed',
    );
    return reply.code(409).send({ message: 'The account operation could not be completed.' });
  });

  const route = (
    method: 'GET' | 'POST',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r, reply) => {
        const result = await withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) =>
          work(a, r),
        );
        if (method === 'GET' && url.startsWith('/api/account/export'))
          reply
            .header('Content-Type', 'application/json')
            .header(
              'Content-Disposition',
              'attachment; filename="healthwallet-account-export.json"',
            );
        return result;
      },
    });

  route('GET', '/api/account/export', (a) => account.export(a));
  route('POST', '/api/account/deletion', async (a, r) => {
    const body = z
      .object({ reason: z.string().trim().max(2000).optional() })
      .strict()
      .parse(r.body ?? {});
    return account.requestDeletion(a, body);
  });
  route('POST', '/api/account/deletion/cancel', (a) => account.cancelDeletion(a));
};

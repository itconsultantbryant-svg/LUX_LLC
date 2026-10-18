import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { ReceiptsService, receiptView } from '../modules/receipts/service.js';
import { sessionToken } from './identity.js';

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;

/**
 * Universal transaction receipts for the signed-in customer. A receipt is
 * visible only to a party on it (payer or beneficiary).
 */
export const receiptRoutes: FastifyPluginAsync = async (app) => {
  const receipts = new ReceiptsService();
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Receipt operation failed',
    );
    return reply.code(503).send({ message: 'Receipts are temporarily unavailable.' });
  });

  const route = (
    method: 'GET',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) =>
        withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r)),
    });

  route('GET', '/api/receipts', async (a, r) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
      .parse(r.query ?? {});
    const rows = await receipts.list(a.client, a.actor.id, query.limit ?? 50);
    return { receipts: rows.map(receiptView) };
  });

  route('GET', '/api/receipts/:id', async (a, r) => ({
    receipt: receiptView(await receipts.get(a.client, a.actor.id, id(r))),
  }));
};

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import { AssistanceService } from '../modules/assistance/service.js';
import { sessionToken } from './identity.js';

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
const key = z.uuid();
const reason = z.string().trim().min(8).max(2000);
const amount = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);

export const assistanceRoutes: FastifyPluginAsync = async (app) => {
  const assistance = new AssistanceService(
    new LedgerService(app.ctx.pool),
    app.ctx.adapters.payments.mode,
    app.ctx.env.APP_ENV,
  );

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Funding assistance operation failed',
    );
    return reply
      .code(503)
      .send({ message: 'The funding assistance service is unavailable. Try again.' });
  });

  const route = (
    method: 'GET' | 'POST',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) =>
        withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r)),
    });

  route('GET', '/api/bills/:id/assistance', (a, r) => assistance.view(a, id(r)));

  route('POST', '/api/bills/:id/assistance/apply', async (a, r) => {
    const body = z
      .object({ key, allocationIds: z.array(z.uuid()).max(50).optional() })
      .strict()
      .parse(r.body);
    return assistance.applyFunds(a, id(r), body);
  });

  route('POST', '/api/bills/:id/assistance/voucher', async (a, r) => {
    const body = z.object({ key, voucherAllocationId: z.uuid() }).strict().parse(r.body);
    return assistance.applyVoucher(a, id(r), body);
  });

  route('POST', '/api/bills/:id/assistance/support', async (a, r) => {
    const body = z
      .object({
        kind: z.enum(['shortfall_support', 'help']).default('shortfall_support'),
        amountMinor: amount.optional(),
        currency: z.enum(['LRD', 'USD']).optional(),
        reason,
      })
      .strict()
      .parse(r.body);
    return assistance.requestSupport(a, id(r), body);
  });

  route('POST', '/api/bills/:id/assistance/financing', async (a, r) => {
    const body = z.object({ creditRecordId: z.uuid() }).strict().parse(r.body);
    return assistance.exploreFinancing(a, id(r), body);
  });
};

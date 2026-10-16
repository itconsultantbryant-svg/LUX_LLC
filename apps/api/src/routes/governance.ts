import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { GovernanceService } from '../modules/programs/governance.js';
import { sessionToken } from './identity.js';

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
const minor = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);

export const governanceRoutes: FastifyPluginAsync = async (app) => {
  const governance = new GovernanceService(app.ctx.pool);

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Governance operation failed',
    );
    return reply.code(409).send({ message: 'The program change could not be processed.' });
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

  route('GET', '/api/governance/programs', (a) => governance.listPrograms(a));

  route('POST', '/api/governance/programs', async (a, r) => {
    const body = z
      .object({
        organizationId: z.uuid(),
        name: z.string().trim().min(2).max(200),
        currency: z.enum(['LRD', 'USD']),
        budgetMinor: minor.optional(),
        allowedCategories: z
          .array(z.enum(['general', 'consultation', 'medication', 'diagnostics', 'outpatient']))
          .max(20)
          .optional(),
        allowedProviderIds: z.array(z.uuid()).max(200).optional(),
        maxPerPaymentMinor: minor.optional(),
        rules: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .parse(r.body);
    return governance.createProgram(a, body);
  });

  route('POST', '/api/programs/:id/changes', async (a, r) => {
    const body = z
      .object({
        changeType: z.enum(['budget', 'status', 'rules', 'restriction']),
        payload: z.record(z.string(), z.unknown()),
        note: z.string().trim().max(500).optional(),
      })
      .strict()
      .parse(r.body);
    return governance.propose(a, id(r), body);
  });

  route('POST', '/api/governance/approvals/:id/decide', async (a, r) => {
    const body = z
      .object({ approve: z.boolean(), note: z.string().trim().min(8).max(2000) })
      .strict()
      .parse(r.body);
    return governance.decide(a, id(r), body);
  });

  route('GET', '/api/governance/programs/:id/report', (a, r) => governance.report(a, id(r)));
};

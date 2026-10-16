import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import { PartnersService } from '../modules/partners/service.js';
import { disabledError, flagEnabled } from '../modules/security/flags.js';
import { sessionToken } from './identity.js';

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
const minor = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);

export const partnerRoutes: FastifyPluginAsync = async (app) => {
  const partners = new PartnersService(
    new LedgerService(app.ctx.pool),
    app.ctx.adapters,
    app.ctx.env.APP_ENV,
  );

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Partner operation failed',
    );
    return reply.code(409).send({ message: 'The partner operation could not be completed.' });
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

  route('GET', '/api/partners/modules', async (a) =>
    partners.modules(!(await flagEnabled(a.client, 'partner_modules'))),
  );

  /** Partner money-moving routes fail closed when an operator disables the modules. */
  const assertModulesEnabled = async (a: Access) => {
    if (!(await flagEnabled(a.client, 'partner_modules'))) throw disabledError('Partner modules');
  };

  route('GET', '/api/partners/credit', (a) => partners.listCredit(a));
  route('POST', '/api/partners/credit/:id/accept', (a, r) => partners.acceptCredit(a, id(r)));
  route('POST', '/api/partners/credit/:id/repayments', async (a, r) => {
    await assertModulesEnabled(a);
    const body = z.object({ amountMinor: minor }).strict().parse(r.body);
    return partners.recordRepayment(a, id(r), body);
  });
  route('POST', '/api/partners/credit/:id/appeals', async (a, r) => {
    const body = z
      .object({ reason: z.string().trim().min(8).max(2000) })
      .strict()
      .parse(r.body);
    return partners.appealCredit(a, id(r), body);
  });

  route('GET', '/api/partners/insurance/coverage', async (a, r) => {
    const query = z.object({ billId: z.uuid().optional() }).parse(r.query ?? {});
    return partners.coverage(a, query);
  });
  route('POST', '/api/partners/insurance/claims', async (a, r) => {
    await assertModulesEnabled(a);
    const body = z
      .object({ billId: z.uuid(), policyId: z.uuid(), amountMinor: minor })
      .strict()
      .parse(r.body);
    return partners.createClaim(a, body);
  });
  route('GET', '/api/partners/insurance/claims', (a) => partners.listClaims(a));

  route('GET', '/api/partners/rewards/rules', async (a, r) => {
    const query = z.object({ programId: z.uuid().optional() }).parse(r.query ?? {});
    return partners.listRewardRules(a, query.programId);
  });
  route('POST', '/api/partners/rewards/rules', async (a, r) => {
    const body = z
      .object({
        programId: z.uuid(),
        kind: z.enum(['per_transaction_bps', 'flat_per_transaction', 'campaign']),
        bps: z.number().int().min(1).max(10000).optional(),
        flatMinor: minor.optional(),
        terms: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .parse(r.body);
    return partners.createRewardRule(a, body);
  });
  route('GET', '/api/partners/rewards', (a) => partners.listRewards(a));
  route('POST', '/api/partners/rewards/accrue', async (a, r) => {
    await assertModulesEnabled(a);
    const body = z
      .object({
        ruleId: z.uuid(),
        beneficiaryUserId: z.uuid(),
        baseAmountMinor: minor,
        referenceType: z.string().trim().max(60).optional(),
        referenceId: z.uuid().optional(),
      })
      .strict()
      .parse(r.body);
    return partners.accrueReward(a, body);
  });
  route('POST', '/api/partners/rewards/entries/:id/expire', async (a, r) => {
    await assertModulesEnabled(a);
    const body = z
      .object({ reason: z.string().trim().min(8).max(500) })
      .strict()
      .parse(r.body);
    return partners.expireReward(a, id(r), body);
  });
  route('POST', '/api/partners/rewards/redeem', async (a, r) => {
    await assertModulesEnabled(a);
    const body = z
      .object({ allocationId: z.uuid(), billId: z.uuid(), amountMinor: minor })
      .strict()
      .parse(r.body);
    return partners.redeemReward(a, body);
  });

  route('POST', '/api/partners/ussd/session', async (a, r) => {
    const body = z
      .object({
        phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
        input: z.string().max(40).default(''),
        sessionCode: z.string().max(80).optional(),
      })
      .strict()
      .parse(r.body);
    return partners.ussdSession(a, body);
  });
};

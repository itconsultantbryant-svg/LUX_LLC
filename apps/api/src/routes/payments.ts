import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import { PaymentsService } from '../modules/payments/service.js';
import { disabledError, flagEnabled } from '../modules/security/flags.js';
import { sessionToken } from './identity.js';

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
const key = z.uuid();
const reason = z.string().trim().min(8).max(500);
const amount = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);

export const paymentsRoutes: FastifyPluginAsync = async (app) => {
  const payments = new PaymentsService(
    new LedgerService(app.ctx.pool),
    app.ctx.adapters.payments,
    app.ctx.env.APP_ENV,
  );

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Payment operation failed',
    );
    return reply.code(409).send({ message: 'The payment could not be completed.' });
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

  // Unauthenticated, signature-verified provider webhook.
  app.post('/api/payments/callback', async (request, reply) => {
    const raw = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!raw) return reply.code(400).send({ message: 'Raw callback body is required.' });
    const signatureHeader = request.headers['x-payment-signature'];
    const signature = Array.isArray(signatureHeader)
      ? (signatureHeader[0] ?? null)
      : (signatureHeader ?? null);
    const result = await payments.handleCallback(raw, signature);
    return reply
      .code(result.accepted ? 200 : 400)
      .send({ signatureVerified: result.reason !== 'invalid_signature', ...result });
  });

  /** Payment money-movement fails closed when an operator disables payments. */
  const assertPaymentsEnabled = async (a: Access) => {
    if (!(await flagEnabled(a.client, 'payments'))) throw disabledError('Payments');
  };

  route('POST', '/api/bills/:id/payments/initiate', async (a, r) => {
    await assertPaymentsEnabled(a);
    const body = z.object({ key }).strict().parse(r.body);
    return payments.initiate(a, id(r), body);
  });

  route('GET', '/api/payments/:id', (a, r) => payments.view(a, id(r)));

  route('POST', '/api/payments/:id/authorize', async (a, r) => {
    await assertPaymentsEnabled(a);
    const body = z.object({ key }).strict().parse(r.body);
    return payments.authorize(a, id(r), body);
  });

  route('POST', '/api/payments/:id/status', (a, r) => payments.refreshStatus(a, id(r)));

  route('POST', '/api/payments/:id/refund', async (a, r) => {
    await assertPaymentsEnabled(a);
    const body = z.object({ key, amountMinor: amount.optional(), reason }).strict().parse(r.body);
    return payments.refund(a, id(r), body);
  });

  // Sandbox-only helper: signs a callback exactly as the provider would and
  // routes it through the real verification path. Never available in production.
  //
  // The callback itself must run outside any session transaction: the capture
  // path takes FOR UPDATE on the bill while an open session transaction holds
  // FOR SHARE, which would self-deadlock. Reads are therefore each committed
  // first, mirroring the production webhook where no session is involved.
  app.post('/api/payments/:id/simulate-callback', async (r) => {
    if (app.ctx.env.APP_ENV === 'production' || app.ctx.adapters.payments.mode !== 'sandbox')
      throw new IdentityError(404, 'Not found.');
    const intentId = id(r);
    const body = z
      .object({
        status: z
          .enum(['submitted', 'pending', 'succeeded', 'failed', 'expired', 'cancelled', 'reversed'])
          .default('succeeded'),
        reason: z.string().max(500).optional(),
      })
      .strict()
      .parse(r.body ?? {});
    const sign = app.ctx.adapters.payments.signCallback;
    if (!sign) throw new IdentityError(503, 'The sandbox cannot simulate callbacks.');

    const before = await withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) =>
      payments.view(a, intentId),
    );
    const event = {
      provider: app.ctx.adapters.payments.id,
      eventId: `sim-${before.paymentIntentId}-${body.status}-${Date.now()}`,
      reference: before.paymentIntentId,
      status: body.status,
      sequence: before.lastEventSequence + 1,
      amountMinor: before.amountMinor,
      currency: before.currency,
      occurredAt: new Date().toISOString(),
      ...(body.reason ? { reason: body.reason } : {}),
    };
    const raw = Buffer.from(JSON.stringify(event), 'utf8');
    const result = await payments.handleCallback(raw, sign.call(app.ctx.adapters.payments, raw));
    const payment = await withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) =>
      payments.view(a, intentId),
    );
    return { simulated: true, ...result, payment };
  });
};

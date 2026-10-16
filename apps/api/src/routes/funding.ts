import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FundingService, restrictions, unavailable } from '../modules/funding/service.js';
import { LedgerError, LedgerService, money } from '../modules/ledger/service.js';
import { IdentityError } from '../modules/identity/service.js';
import { Access, withSession } from '../modules/security/access.js';
import { limit } from '../modules/security/limits.js';
import { sessionToken } from './identity.js';
const amount = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n);
const currency = z.enum(['LRD', 'USD']);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const key = z.string().uuid();
const categories = z.array(z.enum(['consultation', 'medication', 'diagnostics', 'general'])).max(4);
const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
export const fundingRoutes: FastifyPluginAsync = async (app) => {
  const service = new FundingService(
    new LedgerService(app.ctx.pool),
    app.ctx.adapters.funding,
    app.ctx.env.APP_ENV,
  );
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError || e instanceof LedgerError)
      return reply.code(400).send({
        message: e instanceof LedgerError ? e.message : 'Check the supplied fields and try again.',
      });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Funding operation failed',
    );
    return reply.code(503).send({
      message:
        'Funding is temporarily unavailable. Retry with the same request; duplicate credits will not be created.',
    });
  });
  const route = (
    method: 'GET' | 'POST',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) => {
        if (method === 'POST') await limit(app.ctx.pool, 'funding-mutation', r.ip, 60, 900);
        return withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r));
      },
    });
  app.post('/api/funding/resolve', async (r, reply) => {
    reply.header('Referrer-Policy', 'no-referrer');
    await limit(app.ctx.pool, 'support-resolve', r.ip, 60, 900);
    const body = z.object({ token }).strict().parse(r.body);
    const c = await app.ctx.pool.connect();
    try {
      const link = await service.link(c, body.token);
      return {
        beneficiaryLabel: link.beneficiary_label,
        currencies: link.currencies,
        categories: link.categories,
        expiresAt: link.expires_at,
        restrictions,
        capabilities: service.capabilities(),
      };
    } finally {
      c.release();
    }
  });
  route('GET', '/api/funding', async (a) => {
    const goals = (
      await a.client.query(
        `SELECT g.*,COALESCE((SELECT sum(p.amount_minor) FROM funding_payments p WHERE p.goal_id=g.id AND p.status='confirmed'),0)::text AS confirmed_minor FROM saving_goals g WHERE owner_user_id=$1 ORDER BY created_at DESC`,
        [a.actor.id],
      )
    ).rows;
    const payments = (
      await a.client.query(
        `SELECT * FROM funding_payments WHERE payer_user_id=$1 OR beneficiary_user_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [a.actor.id],
      )
    ).rows.map((p) => ({
      ...service.view(p),
      direction: p.payer_user_id === a.actor.id ? 'sent' : 'received',
    }));
    const links = (
      await a.client.query(
        'SELECT id,beneficiary_label,currencies,categories,expires_at,revoked_at FROM support_links WHERE owner_user_id=$1 ORDER BY created_at DESC',
        [a.actor.id],
      )
    ).rows;
    const consent =
      (
        await a.client.query(
          "SELECT granted FROM consents WHERE user_id=$1 AND consent_type='financial_guidance' ORDER BY created_at DESC,id DESC LIMIT 1",
          [a.actor.id],
        )
      ).rows[0]?.granted ?? false;
    const guidance = consent
      ? (
          await a.client.query(
            'SELECT id,goal_id,currency,weekly_minor,basis,status FROM saving_guidance WHERE owner_user_id=$1 ORDER BY created_at DESC LIMIT 30',
            [a.actor.id],
          )
        ).rows
      : [];
    return { goals, payments, links, consent, guidance, capabilities: service.capabilities() };
  });
  route('POST', '/api/funding/goals', async (a, r) => {
    const b = z
      .object({ key, label: z.string().trim().min(1).max(80), currency, targetMinor: amount })
      .strict()
      .parse(r.body);
    return service.once(
      a.client,
      a.actor.id,
      b.key,
      'goal',
      b,
      async () =>
        (
          await a.client.query(
            'INSERT INTO saving_goals(owner_user_id,label,currency,target_minor) VALUES($1,$2,$3,$4) RETURNING id',
            [a.actor.id, b.label, b.currency, b.targetMinor],
          )
        ).rows[0],
    );
  });
  route('POST', '/api/funding/links', async (a, r) => {
    const b = z
      .object({
        key,
        label: z
          .string()
          .trim()
          .min(1)
          .max(30)
          .regex(/^[\p{L}\p{N} .'-]+$/u),
        currencies: z.array(currency).min(1).max(2),
        categories,
        expiresInDays: z.number().int().min(1).max(90),
      })
      .strict()
      .parse(r.body);
    return service.once(a.client, a.actor.id, b.key, 'support-link', b, () =>
      service.createLink(a.client, a.actor.id, b),
    );
  });
  route('POST', '/api/funding/links/:id/revoke', async (a, r) => {
    z.object({}).strict().parse(r.body);
    const result = await a.client.query(
      'UPDATE support_links SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND owner_user_id=$2 RETURNING id',
      [id(r), a.actor.id],
    );
    if (!result.rowCount) throw unavailable();
    return { revoked: true };
  });
  route('POST', '/api/funding/quotes', async (a, r) => {
    const b = z
      .object({
        key,
        kind: z.enum(['deposit', 'contribution']),
        amountMinor: amount,
        currency,
        token: token.optional(),
        goalId: z.uuid().optional(),
        international: z.boolean().default(false),
      })
      .strict()
      .parse(r.body);
    return service.once(a.client, a.actor.id, b.key, 'quote', b, () =>
      service.quote(a.client, a.actor.id, b),
    );
  });
  route('POST', '/api/funding/payments/:id/authorize', async (a, r) => {
    z.object({ accepted: z.literal(true) })
      .strict()
      .parse(r.body);
    return service.authorize(a.client, a.actor.id, id(r));
  });
  route('POST', '/api/funding/payments/:id/simulate', async (a, r) => {
    // This is a development adapter control, NOT a production webhook or authorization bypass.
    service.enabled();
    if (service.adapter.mode !== 'sandbox') throw unavailable();
    const b = z
      .object({ eventId: key, status: z.enum(['pending', 'confirmed', 'failed']) })
      .strict()
      .parse(r.body);
    const p = (
      await a.client.query(
        'SELECT * FROM funding_payments WHERE id=$1 AND payer_user_id=$2 FOR UPDATE',
        [id(r), a.actor.id],
      )
    ).rows[0];
    if (!p) throw unavailable();
    return service.confirm(a.client, {
      eventId: b.eventId,
      paymentId: p.id,
      reference: p.adapter_reference,
      amountMinor: (BigInt(p.amount_minor) + BigInt(p.fee_minor)).toString(),
      currency: p.currency,
      status: b.status,
    });
  });
  route('GET', '/api/funding/payments/:id/receipt', async (a, r) => {
    const p = (
      await a.client.query(
        "SELECT * FROM funding_payments WHERE id=$1 AND (payer_user_id=$2 OR beneficiary_user_id=$2) AND status='confirmed'",
        [id(r), a.actor.id],
      )
    ).rows[0];
    if (!p) throw unavailable();
    return { ...service.view(p), settlementVerified: false };
  });
  route('POST', '/api/funding/guidance/consent', async (a, r) => {
    const b = z.object({ granted: z.boolean() }).strict().parse(r.body);
    await a.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `guidance:${a.actor.id}`,
    ]);
    await a.client.query(
      "INSERT INTO consents(user_id,consent_type,granted,version,created_at) VALUES($1,'financial_guidance',$2,'funding-v1',clock_timestamp())",
      [a.actor.id, b.granted],
    );
    if (!b.granted)
      await a.client.query("UPDATE saving_guidance SET status='dismissed' WHERE owner_user_id=$1", [
        a.actor.id,
      ]);
    await a.audit('funding.guidance_consent', 'user', a.actor.id);
    return { granted: b.granted };
  });
  route('POST', '/api/funding/guidance', async (a, r) => {
    const b = z
      .object({ key, goalId: z.uuid(), weeks: z.number().int().min(1).max(520) })
      .strict()
      .parse(r.body);
    await a.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `guidance:${a.actor.id}`,
    ]);
    const consent = (
      await a.client.query(
        "SELECT id,granted FROM consents WHERE user_id=$1 AND consent_type='financial_guidance' ORDER BY created_at DESC,id DESC LIMIT 1",
        [a.actor.id],
      )
    ).rows[0];
    if (!consent?.granted)
      throw new IdentityError(
        403,
        'Allow use of your saving goal and confirmed deposits before requesting guidance.',
      );
    return service.once(a.client, a.actor.id, b.key, 'guidance', b, async () => {
      const g = (
        await a.client.query(
          `SELECT g.*,COALESCE((SELECT sum(p.amount_minor) FROM funding_payments p WHERE p.goal_id=g.id AND p.status='confirmed'),0)::text AS confirmed FROM saving_goals g WHERE id=$1 AND owner_user_id=$2`,
          [b.goalId, a.actor.id],
        )
      ).rows[0];
      if (!g) throw unavailable();
      const remaining = BigInt(g.target_minor) - BigInt(g.confirmed);
      if (remaining <= 0n)
        throw new IdentityError(409, 'This goal has already reached its confirmed-deposit target.');
      const weekly = ((remaining + BigInt(b.weeks) - 1n) / BigInt(b.weeks)).toString();
      const basis = {
        method: 'Transparent planning calculation; AI provider not connected',
        targetMinor: g.target_minor,
        confirmedMinor: g.confirmed,
        weeks: b.weeks,
        explanation:
          'Remaining target divided by your chosen weeks, rounded up to the next minor unit. This does not assess affordability, use medical data, or move money.',
      };
      return (
        await a.client.query(
          'INSERT INTO saving_guidance(owner_user_id,goal_id,consent_id,currency,weekly_minor,basis) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [a.actor.id, g.id, consent.id, g.currency, weekly, JSON.stringify(basis)],
        )
      ).rows[0];
    });
  });
  route('POST', '/api/funding/guidance/:id', async (a, r) => {
    const b = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('dismiss') }).strict(),
        z.object({ action: z.literal('change'), weeklyMinor: amount }).strict(),
      ])
      .parse(r.body);
    await a.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `guidance:${a.actor.id}`,
    ]);
    if (b.action === 'change') {
      money(b.weeklyMinor);
      const consent = (
        await a.client.query(
          "SELECT granted FROM consents WHERE user_id=$1 AND consent_type='financial_guidance' ORDER BY created_at DESC,id DESC LIMIT 1",
          [a.actor.id],
        )
      ).rows[0];
      if (!consent?.granted)
        throw new IdentityError(403, 'Financial guidance consent is required.');
    }
    const updated = await a.client.query(
      "UPDATE saving_guidance SET status=$3,weekly_minor=COALESCE($4,weekly_minor) WHERE id=$1 AND owner_user_id=$2 AND status<>'dismissed' RETURNING id",
      [
        id(r),
        a.actor.id,
        b.action === 'dismiss' ? 'dismissed' : 'changed',
        b.action === 'change' ? b.weeklyMinor : null,
      ],
    );
    if (!updated.rowCount) throw unavailable();
    return { updated: true };
  });
};

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FEE_SCHEDULE } from '@healthwallet/shared';
import { Access, withSession, missing } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import {
  enqueueExtraction,
  processExtractionJobs,
  type Finding,
} from '../modules/extraction/service.js';
import { issueVoucher } from '../modules/programs/service.js';
import { runReconciliation } from '../modules/operations/reconciliation.js';
import { disabledError, flagEnabled } from '../modules/security/flags.js';
import { metrics } from '../modules/operations/reports.js';
import { sessionToken } from './identity.js';

const amount = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);
const currency = z.enum(['LRD', 'USD']);
const categories = z.array(z.enum(['consultation', 'medication', 'diagnostics', 'general'])).max(4);
const programStatuses = z.enum(['draft', 'active', 'paused', 'closed']);
const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      {
        errorType: e instanceof Error ? e.name : 'Unknown',
        message: e instanceof Error ? e.message : undefined,
      },
      'Operation failed',
    );
    return reply.code(503).send({ message: 'The operation could not be completed. Try again.' });
  });

  const route = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) =>
        withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r)),
    });

  app.get('/api/fees', async () => FEE_SCHEDULE);

  route('POST', '/api/bills/:id/extract', async (a, r) => {
    z.object({}).strict().parse(r.body);
    if (!(await flagEnabled(a.client, 'ai_extraction'))) throw disabledError('AI extraction');
    const { bill } = await a.bill(id(r), 'documents:write');
    const doc = (
      await a.client.query<{ id: string }>(
        'SELECT id FROM bill_documents WHERE bill_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
        [bill.id],
      )
    ).rows[0];
    if (!doc) throw new IdentityError(400, 'Upload a bill document before running extraction.');
    await enqueueExtraction(a.client, bill.id, doc.id);
    await processExtractionJobs(
      a.client,
      app.ctx.adapters.ai,
      { billId: bill.id, limit: 10 },
      app.ctx.adapters.storage,
    );
    const current = (
      await a.client.query<{ status: string }>('SELECT status FROM bills WHERE id = $1', [bill.id])
    ).rows[0];
    const findings = (
      await a.client.query<Finding & { severity: string; field: string | null }>(
        `SELECT code, severity, message, field FROM validation_findings
         WHERE ai_run_id IN (SELECT id FROM ai_runs WHERE bill_id = $1 ORDER BY completed_at DESC, id DESC LIMIT 1)
         ORDER BY created_at`,
        [bill.id],
      )
    ).rows;
    return {
      billId: bill.id,
      status: current?.status ?? bill.status,
      requiresReview: findings.length > 0,
      findings,
      mode: app.ctx.adapters.ai.mode,
    };
  });

  route('GET', '/api/admin/reviews', async (a) => {
    a.platform();
    const cases = (
      await a.client.query(
        `SELECT rc.*, b.provider_name AS bill_provider, b.currency, b.total_amount_minor,
                b.customer_user_id, p.legal_name AS provider_legal_name
         FROM review_cases rc
         LEFT JOIN bills b ON b.id = rc.bill_id
         LEFT JOIN providers p ON p.id = rc.provider_id
         ORDER BY rc.created_at DESC
         LIMIT 200`,
      )
    ).rows;
    const findings = (
      await a.client.query(
        `SELECT bill_id, code, severity, message, field, resolved_at
         FROM validation_findings
         WHERE bill_id = ANY($1::uuid[])
         ORDER BY created_at`,
        [cases.map((c) => c.bill_id).filter(Boolean)],
      )
    ).rows;
    return {
      cases: cases.map((c) => ({
        ...c,
        findings: findings.filter((f) => f.bill_id === c.bill_id),
      })),
      mode: app.ctx.adapters.ai.mode,
    };
  });

  route('POST', '/api/admin/reviews/:id/:decision', async (a, r) => {
    a.platform();
    const params = z
      .object({ id: z.uuid(), decision: z.enum(['approve', 'reject', 'return']) })
      .parse(r.params);
    const b = z
      .object({ note: z.string().trim().max(2000).default('') })
      .strict()
      .parse(r.body);
    const row = (
      await a.client.query<{ id: string; bill_id: string | null; provider_id: string | null }>(
        'SELECT id, bill_id, provider_id FROM review_cases WHERE id = $1 FOR UPDATE',
        [params.id],
      )
    ).rows[0];
    if (!row) throw missing();
    await a.client.query(
      `UPDATE review_cases SET status = 'resolved', decision = $2, resolved_at = now() WHERE id = $1`,
      [row.id, JSON.stringify({ decision: params.decision, note: b.note })],
    );
    if (row.bill_id) {
      await a.client.query(
        `UPDATE validation_findings SET resolved_at = COALESCE(resolved_at, now()) WHERE bill_id = $1 AND resolved_at IS NULL`,
        [row.bill_id],
      );
      const next = params.decision === 'approve' ? 'validated' : 'needs_review';
      await a.client.query('UPDATE bills SET status = $2, updated_at = now() WHERE id = $1', [
        row.bill_id,
        next,
      ]);
    }
    await a.audit('review.resolved', 'review_case', row.id, {
      decision: params.decision,
      billId: row.bill_id,
      providerId: row.provider_id,
      note: b.note,
    });
    return { resolved: true, decision: params.decision };
  });

  route('GET', '/api/admin/metrics', async (a) => {
    a.platform();
    return metrics(a.client);
  });

  route('POST', '/api/admin/reconcile', async (a, r) => {
    a.platform();
    z.object({}).strict().parse(r.body);
    return runReconciliation(a.client, { actorUserId: a.actor.id });
  });

  route('GET', '/api/programs', async (a) => {
    const rows = await a.client.query(
      `SELECT DISTINCT p.*
       FROM programs p
       JOIN organizations o ON o.id = p.organization_id AND o.status = 'approved'
       WHERE p.organization_id IN (
         SELECT m.organization_id FROM organization_memberships m
         WHERE m.user_id = $1 AND m.status = 'active'
           AND m.role IN ('organization_admin', 'program_manager')
       )
          OR EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = $1 AND ur.role = 'platform_admin'
          )
       ORDER BY p.created_at DESC`,
      [a.actor.id],
    );
    return { programs: rows.rows, mode: 'sandbox' };
  });

  route('POST', '/api/programs', async (a, r) => {
    const b = z
      .object({
        organizationId: z.uuid(),
        name: z.string().trim().min(1).max(120),
        currency,
        allowedCategories: categories.default([]),
        allowedProviderIds: z.array(z.uuid()).max(500).default([]),
        maxPerPaymentMinor: amount.optional(),
        startsAt: z.string().optional(),
        expiresAt: z.string().optional(),
      })
      .strict()
      .parse(r.body);
    await a.organization(b.organizationId, ['organization_admin'], true);
    const row = (
      await a.client.query(
        `INSERT INTO programs
          (organization_id, name, currency, status, allowed_categories, allowed_provider_ids,
           max_per_payment_minor, starts_at, expires_at)
         VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          b.organizationId,
          b.name,
          b.currency,
          b.allowedCategories,
          b.allowedProviderIds,
          b.maxPerPaymentMinor ?? null,
          b.startsAt ?? null,
          b.expiresAt ?? null,
        ],
      )
    ).rows[0];
    await a.audit('programs.created', 'program', row.id, { organizationId: b.organizationId });
    return row;
  });

  route('PATCH', '/api/programs/:id', async (a, r) => {
    const b = z
      .object({
        status: programStatuses.optional(),
        name: z.string().trim().min(1).max(120).optional(),
        allowedCategories: categories.optional(),
        allowedProviderIds: z.array(z.uuid()).max(500).optional(),
        maxPerPaymentMinor: amount.nullable().optional(),
        startsAt: z.string().nullable().optional(),
        expiresAt: z.string().nullable().optional(),
      })
      .strict()
      .parse(r.body);
    const existing = (
      await a.client.query<{ id: string; organization_id: string }>(
        'SELECT id, organization_id FROM programs WHERE id = $1 FOR SHARE',
        [id(r)],
      )
    ).rows[0];
    if (!existing) throw missing();
    await a.organization(existing.organization_id, ['organization_admin'], true);
    const row = (
      await a.client.query(
        `UPDATE programs SET
           status = COALESCE($2, status),
           name = COALESCE($3, name),
           allowed_categories = COALESCE($4, allowed_categories),
           allowed_provider_ids = COALESCE($5, allowed_provider_ids),
           max_per_payment_minor = COALESCE($6, max_per_payment_minor),
           starts_at = COALESCE($7, starts_at),
           expires_at = COALESCE($8, expires_at),
           rule_version = rule_version + 1
         WHERE id = $1
         RETURNING *`,
        [
          existing.id,
          b.status ?? null,
          b.name ?? null,
          b.allowedCategories ?? null,
          b.allowedProviderIds ?? null,
          b.maxPerPaymentMinor === undefined ? null : b.maxPerPaymentMinor,
          b.startsAt === undefined ? null : b.startsAt,
          b.expiresAt === undefined ? null : b.expiresAt,
        ],
      )
    ).rows[0];
    await a.audit('programs.updated', 'program', row.id, { changes: b });
    return row;
  });

  route('POST', '/api/programs/:id/vouchers', async (a, r) => {
    const b = z
      .object({
        beneficiaryPhone: z.string().regex(/^\+[1-9][0-9]{6,14}$/),
        amountMinor: amount,
        expiresInDays: z.number().int().min(1).max(365),
      })
      .strict()
      .parse(r.body);
    const program = (
      await a.client.query<{ id: string; organization_id: string; status: string }>(
        'SELECT id, organization_id, status FROM programs WHERE id = $1 FOR SHARE',
        [id(r)],
      )
    ).rows[0];
    if (!program) throw missing();
    await a.organization(program.organization_id, ['organization_admin', 'program_manager'], true);
    if (program.status !== 'active')
      throw new IdentityError(409, 'Only active programs issue vouchers.');
    const voucher = await issueVoucher(new LedgerService(app.ctx.pool), {
      programId: program.id,
      beneficiaryPhone: b.beneficiaryPhone,
      amountMinor: b.amountMinor,
      expiresInDays: b.expiresInDays,
      actorUserId: a.actor.id,
    });
    return {
      ...voucher,
      note: 'SIMULATION — this voucher credits the platform ledger only; no real partner movement is asserted.',
    };
  });
};

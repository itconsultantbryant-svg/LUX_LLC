import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CUSTOMER_STATUS_LABELS,
  CheckNameSchema,
  CheckResultSchema,
  CheckSeveritySchema,
  ReviewerActionSchema,
  deriveCustomerStatus,
  type CustomerStatus,
} from '@healthwallet/shared';
import { Access, withSession, missing } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { billAccess } from '../modules/providers/service.js';
import { runValidation } from '../modules/validation/engine.js';
import { applyReviewerAction } from '../modules/validation/review.js';
import { sessionToken } from './identity.js';

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
const reason = z.string().trim().min(8).max(2000);
const amount = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);

type RunRow = {
  id: string;
  policy_version: string;
  model_version: string;
  route: string;
  customer_status: CustomerStatus;
  overall: string;
  total_minor: string | null;
  currency: string;
  created_at: Date;
};

export const validationRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Validation operation failed',
    );
    return reply.code(503).send({ message: 'The validation service is unavailable. Try again.' });
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

  async function view(client: Access['client'], billId: string) {
    const run = (
      await client.query<RunRow>(
        'SELECT id,policy_version,model_version,route,customer_status,overall,total_minor::text,currency,created_at FROM validation_runs WHERE bill_id=$1 ORDER BY created_at DESC LIMIT 1',
        [billId],
      )
    ).rows[0];
    if (!run)
      return {
        billId,
        hasRun: false,
        route: null,
        overall: null,
        customerStatus: null,
        customerStatusLabel: null,
        policyVersion: null,
        modelVersion: null,
        findings: [],
        reviewerActions: [],
        appeals: [],
        createdAt: null,
      };
    const findings = (
      await client.query(
        `SELECT check_name,label,result,severity,source,evidence,missing_info,recommended_action,model_version,policy_version
         FROM validation_results WHERE run_id=$1 ORDER BY created_at`,
        [run.id],
      )
    ).rows;
    const reviewerActions = (
      await client.query(
        'SELECT id,action,check_name,reason,before,after,authority_minor::text,created_at FROM validation_reviewer_actions WHERE bill_id=$1 ORDER BY created_at',
        [billId],
      )
    ).rows;
    const appeals = (
      await client.query(
        'SELECT id,status,reason,decision,created_at,resolved_at FROM bill_appeals WHERE bill_id=$1 ORDER BY created_at',
        [billId],
      )
    ).rows;
    const payment = (
      await client.query<{ status: string }>(
        "SELECT status FROM payment_intents WHERE bill_id=$1 AND status NOT IN ('failed','cancelled') ORDER BY created_at DESC LIMIT 1",
        [billId],
      )
    ).rows[0];
    const customerStatus = deriveCustomerStatus(run.customer_status, payment ?? null);
    return {
      billId,
      hasRun: true,
      runId: run.id,
      route: run.route,
      overall: run.overall,
      customerStatus,
      customerStatusLabel: CUSTOMER_STATUS_LABELS[customerStatus],
      policyVersion: run.policy_version,
      modelVersion: run.model_version,
      findings,
      reviewerActions,
      appeals,
      createdAt: run.created_at,
    };
  }

  route('POST', '/api/bills/:id/validate', async (a, r) => {
    z.object({})
      .strict()
      .parse(r.body ?? {});
    const { bill } = await billAccess(a, id(r), false);
    const outcome = await runValidation(a.client, {
      billId: bill.id,
      actorUserId: a.actor.id,
    });
    await a.audit('bill.validated', 'bill', bill.id, {
      runId: outcome.runId,
      route: outcome.route,
      overall: outcome.overall,
      policyVersion: outcome.policyVersion,
    });
    return {
      ...(await view(a.client, bill.id)),
      route: outcome.route,
      overall: outcome.overall,
      findings: outcome.findings,
    };
  });

  route('GET', '/api/bills/:id/validation', async (a, r) => {
    const { bill } = await billAccess(a, id(r), false);
    return view(a.client, bill.id);
  });

  route('GET', '/api/admin/bills/:id/validation', async (a, r) => {
    a.platform();
    const billId = id(r);
    const bill = (await a.client.query('SELECT * FROM bills WHERE id=$1', [billId])).rows[0];
    if (!bill) throw missing();
    const base = await view(a.client, billId);
    const revisions = (
      await a.client.query(
        'SELECT revision,reference,issue_date,provider_name,currency,total_minor::text,requires_documents,confirmation_kind,reason,created_at FROM bill_revisions WHERE bill_id=$1 ORDER BY revision',
        [billId],
      )
    ).rows;
    const confirmations = (
      await a.client.query(
        'SELECT revision,kind,note,created_at FROM bill_confirmations WHERE bill_id=$1 ORDER BY created_at',
        [billId],
      )
    ).rows;
    const changeHistory = (
      await a.client.query(
        'SELECT before,after,created_at FROM bill_change_history WHERE bill_id=$1 ORDER BY created_at',
        [billId],
      )
    ).rows;
    const documents = (
      await a.client.query(
        'SELECT id,revision_number,content_type,byte_size,created_at FROM bill_documents WHERE bill_id=$1 ORDER BY created_at',
        [billId],
      )
    ).rows;
    return {
      ...base,
      bill: {
        id: bill.id,
        status: bill.status,
        validationState: bill.validation_state,
        currency: bill.currency,
        totalAmountMinor: bill.total_amount_minor,
        providerName: bill.provider_name,
        category: bill.category,
        customerUserId: bill.customer_user_id,
      },
      billHistory: { revisions, confirmations, changeHistory, documents },
    };
  });

  route('POST', '/api/admin/bills/:id/validation/actions', async (a, r) => {
    a.platform();
    const billId = id(r);
    const body = z
      .object({
        action: ReviewerActionSchema,
        reason,
        runId: z.uuid().optional(),
        checkName: CheckNameSchema.optional(),
        patch: z
          .object({
            result: CheckResultSchema.optional(),
            severity: CheckSeveritySchema.optional(),
            note: z.string().trim().max(500).optional(),
          })
          .strict()
          .optional(),
        authorityMinor: amount.optional(),
        appealId: z.uuid().optional(),
        outcome: z.enum(['upheld', 'overturned', 'withdrawn']).optional(),
      })
      .strict()
      .parse(r.body);
    const outcome = await applyReviewerAction(a.client, {
      billId,
      runId: body.runId ?? null,
      actorUserId: a.actor.id,
      action: body.action,
      reason: body.reason,
      checkName: body.checkName ?? null,
      patch: body.patch ?? null,
      authorityMinor: body.authorityMinor ?? null,
      appealId: body.appealId ?? null,
      outcome: body.outcome ?? null,
    });
    await a.audit('validation.reviewer_action', 'bill', billId, {
      action: outcome.action,
      validationState: outcome.validationState,
      reason: body.reason,
    });
    return outcome;
  });

  route('GET', '/api/admin/validation/appeals', async (a) => {
    a.platform();
    const appeals = (
      await a.client.query(
        "SELECT a.id,a.bill_id,a.status,a.reason,a.decision,a.created_at,a.resolved_at FROM bill_appeals a WHERE a.status='open' ORDER BY a.created_at LIMIT 200",
      )
    ).rows;
    return { appeals };
  });
};

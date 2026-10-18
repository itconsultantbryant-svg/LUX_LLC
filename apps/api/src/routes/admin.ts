import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession, missing } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { AccountService } from '../modules/account/service.js';
import { allFlags, flagKeys, isFlagKey, setFlag } from '../modules/security/flags.js';
import { retentionPolicy, runRetention } from '../modules/operations/retention.js';
import { ReceiptsService, receiptView } from '../modules/receipts/service.js';
import { sessionToken } from './identity.js';

/**
 * Operator/admin surface added for hardening: runtime feature switches, data
 * retention, account-deletion processing, dispute resolution, payment-incident
 * investigation and fraud escalation. All routes require a platform
 * administrator with a fresh MFA verification.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  const account = new AccountService();
  const receipts = new ReceiptsService();

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error({ errorType: e instanceof Error ? e.name : 'Unknown' }, 'Admin operation failed');
    return reply.code(503).send({ message: 'The operation could not be completed. Try again.' });
  });

  const route = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) =>
        withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r)),
    });

  // ---- Runtime feature/kill switches --------------------------------------

  route('GET', '/api/admin/flags', async (a) => {
    a.platform();
    return { flags: await allFlags(a.client) };
  });

  route('PUT', '/api/admin/flags/:key', async (a, r) => {
    a.platform();
    const { key } = z.object({ key: z.string().max(40) }).parse(r.params);
    if (!isFlagKey(key)) throw missing();
    const body = z
      .object({ enabled: z.boolean(), reason: z.string().trim().min(4).max(500) })
      .strict()
      .parse(r.body);
    await setFlag(a.client, key, body.enabled, body.reason, a.actor.id);
    await a.audit(body.enabled ? 'system.flag_enabled' : 'system.flag_disabled', 'system', null, {
      key,
      reason: body.reason,
    });
    return { key, enabled: body.enabled };
  });

  route('GET', '/api/admin/flags/keys', async (a) => {
    a.platform();
    return { keys: flagKeys };
  });

  // ---- Data retention -----------------------------------------------------

  route('GET', '/api/admin/retention', async (a) => {
    a.platform();
    const policy = retentionPolicy(app.ctx.env);
    const preview = await runRetention(a.client, policy, app.ctx.adapters.storage, {
      dryRun: true,
    });
    return { policy, preview };
  });

  route('POST', '/api/admin/retention/run', async (a, r) => {
    a.platform();
    const body = z
      .object({ dryRun: z.boolean().default(false) })
      .strict()
      .parse(r.body ?? {});
    return runRetention(a.client, retentionPolicy(app.ctx.env), app.ctx.adapters.storage, {
      dryRun: body.dryRun,
      actorUserId: a.actor.id,
    });
  });

  // ---- Account deletion processing ---------------------------------------

  route('GET', '/api/admin/account-deletions', async (a) => {
    a.platform();
    return account.listDeletions(a);
  });

  route('POST', '/api/admin/account-deletions/:id/process', async (a, r) => {
    a.platform();
    const { id } = z.object({ id: z.uuid() }).parse(r.params);
    z.object({})
      .strict()
      .parse(r.body ?? {});
    return account.processDeletion(a, id);
  });

  // ---- Dispute resolution -------------------------------------------------

  route('POST', '/api/admin/disputes/:id/resolve', async (a, r) => {
    a.platform();
    const { id } = z.object({ id: z.uuid() }).parse(r.params);
    const body = z
      .object({
        status: z.enum(['resolved', 'rejected', 'withdrawn']),
        resolution: z.string().trim().min(8).max(2000),
        adjustmentJournalId: z.uuid().optional(),
      })
      .strict()
      .parse(r.body);
    const dispute = (
      await a.client.query<{ id: string; bill_id: string; status: string }>(
        'SELECT id, bill_id, status FROM disputes WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!dispute) throw missing();
    if (body.adjustmentJournalId) {
      const journal = await a.client.query('SELECT id FROM journal_entries WHERE id=$1', [
        body.adjustmentJournalId,
      ]);
      if (!journal.rowCount) throw missing();
    }
    await a.client.query(
      'UPDATE disputes SET status=$2, resolution=$3, adjustment_journal_id=$4 WHERE id=$1',
      [dispute.id, body.status, body.resolution, body.adjustmentJournalId ?? null],
    );
    await a.audit('bill.dispute_resolved', 'bill', dispute.bill_id, {
      disputeId: dispute.id,
      status: body.status,
    });
    return { resolved: true, disputeId: dispute.id, status: body.status };
  });

  // ---- Payment incident investigation ------------------------------------

  route('GET', '/api/admin/payment-incidents', async (a) => {
    a.platform();
    const failedIntents = (
      await a.client.query(
        "SELECT id, bill_id, status, amount_minor::text AS amount_minor, currency, failure_code, created_at FROM payment_intents WHERE status='failed' ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
    const stuckPending = (
      await a.client.query(
        "SELECT id, bill_id, status, amount_minor::text AS amount_minor, currency, last_event_sequence, created_at FROM payment_intents WHERE status='pending' AND created_at < now() - interval '24 hours' ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
    const rejectedEvents = (
      await a.client.query(
        "SELECT id, provider, event_id, payment_intent_id, status, outcome, signature_valid, occurred_at FROM bill_payment_events WHERE outcome IN ('rejected_transition','stale') OR signature_valid=false ORDER BY received_at DESC LIMIT 100",
      )
    ).rows;
    const failedRefunds = (
      await a.client.query(
        "SELECT id, payment_intent_id, amount_minor::text AS amount_minor, currency, status, created_at FROM refunds WHERE status='failed' ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
    const unsettled = (
      await a.client.query(
        "SELECT id, status, amount_minor::text AS amount_minor, currency, created_at FROM partner_settlements WHERE status='expected' AND created_at < now() - interval '48 hours' ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
    return {
      generatedAt: new Date().toISOString(),
      note: 'Read-only incident inventory. Reconciliation adjusts only platform state and never fabricates partner settlement.',
      counts: {
        failedIntents: failedIntents.length,
        stuckPending: stuckPending.length,
        rejectedEvents: rejectedEvents.length,
        failedRefunds: failedRefunds.length,
        unsettled: unsettled.length,
      },
      failedIntents,
      stuckPending,
      rejectedEvents,
      failedRefunds,
      unsettled,
    };
  });

  // ---- Fraud escalation ---------------------------------------------------

  route('POST', '/api/admin/bills/:id/fraud-escalation', async (a, r) => {
    a.platform();
    const { id } = z.object({ id: z.uuid() }).parse(r.params);
    const body = z
      .object({
        reason: z.string().trim().min(8).max(2000),
        suspendProvider: z.boolean().default(false),
      })
      .strict()
      .parse(r.body);
    const bill = (
      await a.client.query<{ id: string; provider_organization_id: string | null }>(
        'SELECT id, provider_organization_id FROM bills WHERE id=$1 FOR SHARE',
        [id],
      )
    ).rows[0];
    if (!bill) throw missing();
    const providerId = bill.provider_organization_id
      ? ((
          await a.client.query<{ id: string }>(
            'SELECT id FROM providers WHERE organization_id=$1',
            [bill.provider_organization_id],
          )
        ).rows[0]?.id ?? null)
      : null;
    const reviewCase = (
      await a.client.query<{ id: string }>(
        `INSERT INTO review_cases (organization_id, bill_id, provider_id, reason, status)
         VALUES ($1, $2, $3, $4, 'escalated') RETURNING id`,
        [bill.provider_organization_id, bill.id, providerId, body.reason],
      )
    ).rows[0];
    let providerSuspended = false;
    if (body.suspendProvider && providerId) {
      await a.client.query("UPDATE providers SET status='suspended' WHERE id=$1", [providerId]);
      providerSuspended = true;
    }
    await a.audit('fraud.escalated', 'bill', bill.id, {
      reviewCaseId: reviewCase.id,
      providerId,
      providerSuspended,
    });
    return { escalated: true, reviewCaseId: reviewCase.id, providerSuspended };
  });

  // ---- Dashboard overview -------------------------------------------------

  route('GET', '/api/admin/overview', async (a) => {
    a.platform();
    const counts = (
      await a.client.query<{
        customers: string;
        pending_organizations: string;
        approved_organizations: string;
        pending_providers: string;
        verified_providers: string;
        open_disputes: string;
        unread_receipts: string;
        confirmed_deposits: string;
      }>(
        `SELECT
           (SELECT count(*) FROM users WHERE suspended_at IS NULL)::text AS customers,
           (SELECT count(*) FROM organizations WHERE status='pending')::text AS pending_organizations,
           (SELECT count(*) FROM organizations WHERE status='approved')::text AS approved_organizations,
           (SELECT count(*) FROM providers WHERE status<>'verified')::text AS pending_providers,
           (SELECT count(*) FROM providers WHERE status='verified')::text AS verified_providers,
           (SELECT count(*) FROM disputes WHERE status NOT IN ('resolved','withdrawn'))::text AS open_disputes,
           (SELECT count(*) FROM transaction_receipts WHERE status='completed')::text AS unread_receipts,
           (SELECT count(*) FROM funding_payments WHERE status='confirmed')::text AS confirmed_deposits`,
      )
    ).rows[0];
    return {
      customers: Number(counts?.customers ?? 0),
      pendingOrganizations: Number(counts?.pending_organizations ?? 0),
      approvedOrganizations: Number(counts?.approved_organizations ?? 0),
      pendingProviders: Number(counts?.pending_providers ?? 0),
      verifiedProviders: Number(counts?.verified_providers ?? 0),
      openDisputes: Number(counts?.open_disputes ?? 0),
      receipts: Number(counts?.unread_receipts ?? 0),
      confirmedDeposits: Number(counts?.confirmed_deposits ?? 0),
      flags: await allFlags(a.client),
    };
  });

  // ---- Receipt oversight --------------------------------------------------

  route('GET', '/api/admin/receipts', async (a, r) => {
    a.platform();
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
      .parse(r.query ?? {});
    const rows = (
      await a.client.query(
        'SELECT * FROM transaction_receipts ORDER BY issued_at DESC, id DESC LIMIT $1',
        [query.limit ?? 100],
      )
    ).rows;
    return { receipts: rows.map((row) => receiptView(row)) };
  });

  route('POST', '/api/admin/receipts/:id/revoke', async (a, r) => {
    a.platform();
    const { id } = z.object({ id: z.uuid() }).parse(r.params);
    const body = z
      .object({ reason: z.string().trim().min(8).max(500) })
      .strict()
      .parse(r.body);
    const receipt = await receipts.revoke(a.client, id, a.actor.id, body.reason);
    await a.audit('receipt.revoked', 'transaction_receipt', receipt.id, { reason: body.reason });
    return { receipt: receiptView(receipt) };
  });

  route('POST', '/api/admin/receipts/:id/reverse', async (a, r) => {
    a.platform();
    const { id } = z.object({ id: z.uuid() }).parse(r.params);
    const body = z
      .object({ reason: z.string().trim().min(8).max(500) })
      .strict()
      .parse(r.body);
    const original = (
      await a.client.query('SELECT * FROM transaction_receipts WHERE id=$1 FOR UPDATE', [id])
    ).rows[0];
    if (!original) throw missing();
    const reversal = await receipts.reverse(a.client, original, a.actor.id, body.reason);
    await a.audit('receipt.reversed', 'transaction_receipt', original.id, {
      reason: body.reason,
      reversalId: reversal.id,
    });
    return { receipt: receiptView(reversal) };
  });
};

import type pg from 'pg';
import type { CheckName, CheckResult, CheckSeverity, ReviewerAction } from '@healthwallet/shared';
import { IdentityError } from '../identity/service.js';
import { loadPolicy } from './policy.js';

export type ReviewerActionInput = {
  billId: string;
  runId: string | null;
  actorUserId: string;
  action: ReviewerAction;
  reason: string;
  checkName?: CheckName | null;
  patch?: { result?: CheckResult; severity?: CheckSeverity; note?: string } | null;
  /** The acting reviewer's own authorization ceiling, if narrower than policy. */
  authorityMinor?: string | null;
  appealId?: string | null;
  outcome?: 'upheld' | 'overturned' | 'withdrawn' | null;
};

export type ReviewerActionResult = {
  action: ReviewerAction;
  billStatus: string;
  validationState: string;
  reviewCaseId: string | null;
  appealId: string | null;
  requiresEscalation: boolean;
};

async function openReviewCase(client: pg.PoolClient, billId: string): Promise<string | null> {
  const row = (
    await client.query<{ id: string }>(
      "SELECT id FROM review_cases WHERE bill_id=$1 AND status='open' ORDER BY created_at DESC LIMIT 1",
      [billId],
    )
  ).rows[0];
  return row?.id ?? null;
}

async function record(
  client: pg.PoolClient,
  input: ReviewerActionInput,
  reviewCaseId: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO validation_reviewer_actions
       (bill_id, run_id, review_case_id, action, check_name, reason, before, after, authority_minor, actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.billId,
      input.runId,
      reviewCaseId,
      input.action,
      input.checkName ?? null,
      input.reason,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
      input.authorityMinor ?? null,
      input.actorUserId,
    ],
  );
}

async function setState(
  client: pg.PoolClient,
  billId: string,
  status: string | null,
  validationState: string,
): Promise<string> {
  if (status) {
    const row = (
      await client.query<{ status: string }>(
        'UPDATE bills SET status=$2, validation_state=$3, updated_at=now() WHERE id=$1 RETURNING status',
        [billId, status, validationState],
      )
    ).rows[0];
    return row.status;
  }
  const row = (
    await client.query<{ status: string }>(
      'UPDATE bills SET validation_state=$2, updated_at=now() WHERE id=$1 RETURNING status',
      [billId, validationState],
    )
  ).rows[0];
  return row.status;
}

/**
 * Reviewer capabilities. Every action records an immutable, reasoned entry and,
 * where it changes the outcome, updates the customer-facing validation state.
 */
export async function applyReviewerAction(
  client: pg.PoolClient,
  input: ReviewerActionInput,
): Promise<ReviewerActionResult> {
  const bill = (
    await client.query<{ id: string; status: string; total_amount_minor: string | null }>(
      'SELECT id,status,total_amount_minor::text FROM bills WHERE id=$1 FOR UPDATE',
      [input.billId],
    )
  ).rows[0];
  if (!bill) throw new IdentityError(404, 'Record not found or access is not authorized.');
  const reviewCaseId = await openReviewCase(client, input.billId);
  const policy = await loadPolicy(client);
  const authority = BigInt(input.authorityMinor ?? policy.reviewerAuthorityMinor);
  const total = BigInt(bill.total_amount_minor ?? 0);
  const result: ReviewerActionResult = {
    action: input.action,
    billStatus: bill.status,
    validationState: 'awaiting_review',
    reviewCaseId,
    appealId: null,
    requiresEscalation: false,
  };

  switch (input.action) {
    case 'request_clarification': {
      if (reviewCaseId)
        await client.query("UPDATE review_cases SET status='clarification' WHERE id=$1", [
          reviewCaseId,
        ]);
      await record(
        client,
        input,
        reviewCaseId,
        { status: bill.status },
        { status: 'clarification' },
      );
      result.validationState = 'awaiting_provider';
      return result;
    }
    case 'correct_finding': {
      if (!input.checkName || !input.patch)
        throw new IdentityError(400, 'A finding and a correction are required.');
      const prior = (
        await client.query<{ result: string; severity: string }>(
          'SELECT result,severity FROM validation_results WHERE bill_id=$1 AND check_name=$2 ORDER BY created_at DESC LIMIT 1',
          [input.billId, input.checkName],
        )
      ).rows[0];
      await record(
        client,
        input,
        reviewCaseId,
        prior ? { result: prior.result, severity: prior.severity } : null,
        input.patch,
      );
      result.validationState = 'awaiting_review';
      return result;
    }
    case 'approve':
    case 'decline': {
      if (total > authority) {
        result.requiresEscalation = true;
        throw new IdentityError(
          409,
          'This amount exceeds your assigned authority. Escalate to a reviewer with sufficient authority.',
        );
      }
      const state = input.action === 'approve' ? 'ready_for_payment' : 'declined';
      const status = input.action === 'approve' ? 'validated' : 'failed';
      await setState(client, input.billId, status, state);
      if (reviewCaseId)
        await client.query(
          "UPDATE review_cases SET status='resolved', decision=$2, resolved_at=now() WHERE id=$1",
          [
            reviewCaseId,
            JSON.stringify({
              decision: input.action,
              reason: input.reason,
              actor: input.actorUserId,
            }),
          ],
        );
      await record(client, input, reviewCaseId, { status: bill.status }, { status, state });
      result.billStatus = status;
      result.validationState = state;
      return result;
    }
    case 'escalate': {
      if (reviewCaseId)
        await client.query("UPDATE review_cases SET status='escalated' WHERE id=$1", [
          reviewCaseId,
        ]);
      await record(client, input, reviewCaseId, { status: bill.status }, { status: 'escalated' });
      result.validationState = 'awaiting_review';
      return result;
    }
    case 'appeal': {
      const appeal = (
        await client.query<{ id: string }>(
          `INSERT INTO bill_appeals (bill_id, run_id, opened_by, reason, status)
           VALUES ($1,$2,$3,$4,'open') RETURNING id`,
          [input.billId, input.runId, input.actorUserId, input.reason],
        )
      ).rows[0];
      await record(client, input, reviewCaseId, null, { appealId: appeal.id, status: 'open' });
      result.appealId = appeal.id;
      result.validationState = 'awaiting_review';
      return result;
    }
    case 'resolve': {
      if (!input.appealId || !input.outcome)
        throw new IdentityError(400, 'An appeal and an outcome are required.');
      const appeal = (
        await client.query<{ id: string; bill_id: string }>(
          'SELECT id,bill_id FROM bill_appeals WHERE id=$1 AND bill_id=$2 FOR UPDATE',
          [input.appealId, input.billId],
        )
      ).rows[0];
      if (!appeal) throw new IdentityError(404, 'Appeal not found for this bill.');
      await client.query(
        'UPDATE bill_appeals SET status=$2, decision=$3, resolved_by=$4, resolved_at=now() WHERE id=$1',
        [
          appeal.id,
          input.outcome,
          JSON.stringify({ outcome: input.outcome, reason: input.reason }),
          input.actorUserId,
        ],
      );
      const state = input.outcome === 'overturned' ? 'awaiting_review' : 'declined';
      await setState(client, input.billId, null, state);
      await record(client, input, reviewCaseId, { status: 'open' }, { status: input.outcome });
      result.appealId = appeal.id;
      result.validationState = state;
      return result;
    }
    default:
      throw new IdentityError(400, 'Unknown reviewer action.');
  }
}

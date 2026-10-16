import type pg from 'pg';
import {
  RULES_MODEL_VERSION,
  decideRoute,
  overallResult,
  type CustomerStatus,
  type Route,
  type ValidationFinding,
} from '@healthwallet/shared';
import { loadValidationContext } from './context.js';
import { runChecks } from './checks.js';
import { loadPolicy } from './policy.js';

export type ValidationRunOutcome = {
  runId: string;
  billId: string;
  route: Route;
  customerStatus: CustomerStatus;
  overall: 'pass' | 'warn' | 'fail' | 'uncertain';
  policyVersion: string;
  modelVersion: string;
  findings: ValidationFinding[];
};

/**
 * Runs the hybrid validation pipeline and records its decision. This is the
 * validation step only: it never moves money. Financial authorization reads the
 * resulting route and still requires a separate, human-aware action.
 */
export async function runValidation(
  client: pg.PoolClient,
  input: { billId: string; actorUserId: string | null },
): Promise<ValidationRunOutcome> {
  const policy = await loadPolicy(client);
  const ctx = await loadValidationContext(client, input.billId);
  const findings = runChecks(ctx, policy);
  const totalMinor = BigInt(ctx.bill.total_amount_minor ?? 0);
  const decision = decideRoute(findings, policy, totalMinor);
  const overall = overallResult(findings);

  const run = (
    await client.query<{ id: string }>(
      `INSERT INTO validation_runs
         (bill_id, policy_version, model_version, route, customer_status, overall, total_minor, currency, summary, actor_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        ctx.bill.id,
        policy.version,
        RULES_MODEL_VERSION,
        decision.route,
        decision.customerStatus,
        overall,
        ctx.bill.total_amount_minor === null ? null : String(ctx.bill.total_amount_minor),
        ctx.bill.currency ?? 'UNK',
        JSON.stringify({
          triggers: decision.triggers,
          autoAccepted: decision.autoAccepted,
          overall,
        }),
        input.actorUserId,
      ],
    )
  ).rows[0];

  for (const item of findings) {
    await client.query(
      `INSERT INTO validation_results
         (run_id, bill_id, check_name, label, result, severity, source, evidence, missing_info, recommended_action, model_version, policy_version, field)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        run.id,
        ctx.bill.id,
        item.check,
        item.label,
        item.result,
        item.severity,
        item.source,
        JSON.stringify(item.evidence),
        JSON.stringify(item.missingInfo),
        item.recommendedAction,
        item.modelVersion,
        item.policyVersion,
        null,
      ],
    );
  }

  await client.query('UPDATE bills SET validation_state=$2, updated_at=now() WHERE id=$1', [
    ctx.bill.id,
    decision.customerStatus,
  ]);

  if (decision.route === 'await_review') {
    const openCase = await client.query(
      "SELECT id FROM review_cases WHERE bill_id=$1 AND status='open'",
      [ctx.bill.id],
    );
    if (openCase.rowCount === 0) {
      const provider = await client.query<{ id: string }>(
        'SELECT id FROM providers WHERE organization_id=$1',
        [ctx.bill.provider_organization_id],
      );
      await client.query(
        `INSERT INTO review_cases (organization_id, bill_id, provider_id, reason)
         VALUES ($1,$2,$3,$4)`,
        [
          ctx.bill.provider_organization_id,
          ctx.bill.id,
          provider.rows[0]?.id ?? null,
          `validation:${decision.triggers.join(',') || 'policy'}`,
        ],
      );
    }
  }

  return {
    runId: run.id,
    billId: ctx.bill.id,
    route: decision.route,
    customerStatus: decision.customerStatus,
    overall,
    policyVersion: policy.version,
    modelVersion: RULES_MODEL_VERSION,
    findings,
  };
}

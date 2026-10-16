import type pg from 'pg';
import { JOURNEY_STAGES, JOURNEY_OUTCOMES } from '@healthwallet/shared';

type Row = Record<string, unknown>;

export async function metrics(client: pg.PoolClient) {
  const bills = (
    await client.query(
      'SELECT status, COUNT(*)::int AS count FROM bills GROUP BY status ORDER BY status',
    )
  ).rows;
  const validators = (
    await client.query(
      `SELECT COUNT(*)::int AS events,
            COUNT(DISTINCT b.id)::int AS bills,
            COUNT(*) FILTER (WHERE f.severity = 'error')::int AS error_findings,
            COUNT(*) FILTER (WHERE f.severity = 'warning')::int AS warning_findings
     FROM validation_findings f LEFT JOIN bills b ON b.id = f.bill_id`,
    )
  ).rows[0];
  const reviewCases = (
    await client.query(
      'SELECT status, COUNT(*)::int AS count FROM review_cases GROUP BY status ORDER BY status',
    )
  ).rows;
  const payments = (
    await client.query(
      'SELECT status, adapter_mode, COUNT(*)::int AS count FROM payment_intents GROUP BY status, adapter_mode ORDER BY status, adapter_mode',
    )
  ).rows;
  const funding = (
    await client.query(
      'SELECT status, adapter_mode, COUNT(*)::int AS count FROM funding_payments GROUP BY status, adapter_mode ORDER BY status, adapter_mode',
    )
  ).rows;
  const settlements = (
    await client.query(
      'SELECT status, COUNT(*)::int AS count FROM partner_settlements GROUP BY status ORDER BY status',
    )
  ).rows;
  const jobQueue = (
    await client.query(
      'SELECT status, COUNT(*)::int AS count FROM job_queue GROUP BY status ORDER BY status',
    )
  ).rows;
  const aiRuns = (
    await client.query(
      `SELECT COUNT(*)::int AS runs,
            COUNT(DISTINCT bill_id)::int AS bills,
            COUNT(*) FILTER (WHERE requires_review)::int AS review_required
     FROM ai_runs WHERE status = 'completed'`,
    )
  ).rows[0];
  const recentEvents = (
    await client.query(
      `SELECT event_type, COUNT(*)::int AS count FROM audit_events
     WHERE entity_type = 'payment_intent' OR entity_type = 'bill'
     GROUP BY event_type ORDER BY count DESC`,
    )
  ).rows;

  return {
    generatedAt: new Date().toISOString(),
    staging: 'reported_from_live_tables',
    journeys: JOURNEY_STAGES.map((stage) => ({ stage, label: undefined })),
    canReportedOutcomes: JOURNEY_OUTCOMES,
    counts: { bills, reviewCases, payments, funding, settlements, jobQueue },
    ai: { aiRuns, validators },
    recentEvents: recentEvents as Array<Row>,
    note: 'All figures are computed from the platform database. No live partner settlement is asserted; sandbox settlements remain expected.',
  };
}

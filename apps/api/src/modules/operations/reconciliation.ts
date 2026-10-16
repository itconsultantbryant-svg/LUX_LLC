import type pg from 'pg';

export type ReconciliationReport = {
  generatedAt: string;
  failedQuotes: number;
  failedStalePending: number;
  releasedReservations: number;
  jobCounts: Array<{ status: string; count: number }>;
  settlementCounts: Array<{ status: string; count: number }>;
  note: string;
};

export async function runReconciliation(
  client: pg.PoolClient,
  input: { actorUserId?: string | null },
): Promise<ReconciliationReport> {
  const failedQuotes =
    (
      await client.query(
        "UPDATE funding_payments SET status = 'failed' WHERE status = 'quoted' AND quote_expires_at <= now() RETURNING id",
      )
    ).rowCount ?? 0;

  const failedStalePending =
    (
      await client.query(
        `UPDATE funding_payments SET status = 'failed'
     WHERE status = 'pending' AND authorized_at IS NOT NULL AND authorized_at < now() - interval '24 hours'
     RETURNING id`,
      )
    ).rowCount ?? 0;

  const releasedReservations =
    (
      await client.query(
        "UPDATE funding_reservations SET status = 'released' WHERE status = 'active' AND expires_at <= now() RETURNING id",
      )
    ).rowCount ?? 0;

  const jobCounts = (
    await client.query(
      'SELECT status, COUNT(*)::int AS count FROM job_queue GROUP BY status ORDER BY status',
    )
  ).rows;

  const settlementCounts = (
    await client.query(
      'SELECT status, COUNT(*)::int AS count FROM partner_settlements GROUP BY status ORDER BY status',
    )
  ).rows;

  await client.query(
    `INSERT INTO job_queue (job_type, payload, status)
     VALUES ('reconciliation', jsonb_build_object('failedQuotes', $1::int, 'failedStalePending', $2::int, 'releasedReservations', $3::int), 'completed')`,
    [failedQuotes, failedStalePending, releasedReservations],
  );

  await client.query(
    `INSERT INTO audit_events (actor_user_id, event_type, entity_type, entity_id, payload)
     VALUES ($1, 'reconciliation.run', 'system', NULL, $2)`,
    [
      input.actorUserId ?? null,
      JSON.stringify({
        failedQuotes,
        failedStalePending,
        releasedReservations,
        note: 'No settlement is fabricated; sandbox settlements remain expected until a live partner event confirms them.',
      }),
    ],
  );

  return {
    generatedAt: new Date().toISOString(),
    failedQuotes,
    failedStalePending,
    releasedReservations,
    jobCounts,
    settlementCounts,
    note: 'Sandbox settlements remain expected until a live partner event confirms them. Reconciliation never fabricates confirmation.',
  };
}

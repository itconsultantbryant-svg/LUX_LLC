import { loadEnv } from '../config/env.js';
import { createPool } from '../db/client.js';
import { runReconciliation } from '../modules/operations/reconciliation.js';

/**
 * Scheduled reconciliation worker (P2-03).
 *
 * Runs the same deterministic reconciliation as `POST /api/admin/reconcile`
 * without a session, for cron/scheduled invocation. It expires stale quotes and
 * stale pending payments and releases expired reservations inside a single
 * transaction. It never fabricates partner settlement.
 *
 * Usage: `pnpm --filter @healthwallet/api worker:reconcile`
 */
async function main() {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await runReconciliation(client, { actorUserId: null });
    await client.query('COMMIT');
    console.log(JSON.stringify({ worker: 'reconcile', ...report }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    'reconcile_worker_failed',
    error instanceof Error ? error.message : 'unknown_error',
  );
  process.exit(1);
});

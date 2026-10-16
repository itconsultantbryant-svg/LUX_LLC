import { loadEnv } from '../config/env.js';
import { createPool } from '../db/client.js';
import { createAdapters } from '../adapters/index.js';
import { retentionPolicy, runRetention } from '../modules/operations/retention.js';

/**
 * Scheduled data-retention worker.
 *
 * Purges only transient, non-financial records past their retention window and
 * (optionally) the stored bytes of health documents. Financial ledgers, payments,
 * settlements, receipts, disputes, credits and audit events are never purged.
 *
 * Usage: `pnpm --filter @healthwallet/api worker:retention`
 */
async function main() {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  const adapters = createAdapters(env);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await runRetention(client, retentionPolicy(env), adapters.storage, {
      dryRun: process.argv.includes('--dry-run'),
      actorUserId: null,
    });
    await client.query('COMMIT');
    console.log(JSON.stringify({ worker: 'retention', ...report }));
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
    'retention_worker_failed',
    error instanceof Error ? error.message : 'unknown_error',
  );
  process.exit(1);
});

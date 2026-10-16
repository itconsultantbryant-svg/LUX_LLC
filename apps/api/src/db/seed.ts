import { config } from 'dotenv';
import pg from 'pg';
import { LedgerService } from '../modules/ledger/service.js';
import { seedCore } from '../modules/ledger/seed.js';
import { loadEnv } from '../config/env.js';
import { createAdapters } from '../adapters/index.js';
config({ quiet: true });
const env = loadEnv();
const url = process.env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
if (
  !process.argv.includes('--synthetic') ||
  !['development', 'demo', 'test'].includes(env.APP_ENV) ||
  !/_(dev|demo|test)$/.test(new URL(url).pathname)
)
  throw new Error(
    'Use --synthetic, a non-production environment and a *_dev, *_demo or *_test database.',
  );
const pool = new pg.Pool({ connectionString: url });
try {
  const result = await seedCore(new LedgerService(pool), env.APP_ENV);
  await createAdapters(env).storage.putObject({
    key: 'demo/seed-core-v1.txt',
    bytes: Buffer.from('SYNTHETIC care document\n'),
    contentType: 'text/plain',
  });
  console.log(
    'Synthetic core data is ready. No real funds, usable sessions or platform administrator was created.',
  );
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}

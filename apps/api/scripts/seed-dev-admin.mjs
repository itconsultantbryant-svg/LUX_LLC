// Turnkey development admin seed. No HTTP endpoint or self-registration path invokes this.
//
// It provisions a single ready-to-use platform administrator so the reviewer console
// (/institutional/reviews) and Journey metrics (/institutional/metrics) can be opened
// without a manual MFA enrolment. It refuses to run against production or a non-dev
// database, and it never fabricates funds or settlement.
//
// Usage:
//   node apps/api/scripts/seed-dev-admin.mjs [phone]
// or through the workspace script:
//   pnpm seed:admin
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

config({ quiet: true });

const SESSION_SECONDS = 8 * 60 * 60;
// The seeded customer/reviewer (+999700000003) owns the synthetic provider
// organizations, so it can never pass the independent-verification rule. The
// standalone administrator is a separate, organization-free identity.
const DEFAULT_PHONE = '+999700000009';
const phone = process.argv[2] ?? DEFAULT_PHONE;
if (!/^\+[1-9][0-9]{7,14}$/.test(phone))
  throw new Error(`Usage: node scripts/seed-dev-admin.mjs [+E164 phone], got "${phone}"`);

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL or DATABASE_URL_UNPOOLED before seeding.');
const appEnv = process.env.APP_ENV ?? 'development';
if (appEnv === 'production' || !/_(dev|demo|test)$/.test(new URL(url).pathname))
  throw new Error(
    'Refusing to run: use a non-production APP_ENV and a *_dev, *_demo or *_test database.',
  );

const tokenHash = (value) => createHash('sha256').update(value).digest('hex');

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('seed-dev-admin',0))");

  const existing = await client.query('SELECT id FROM users WHERE phone_e164=$1', [phone]);
  let userId = existing.rows[0]?.id;
  if (!userId) {
    const inserted = await client.query(
      'INSERT INTO users (phone_e164, display_name, verification_status) VALUES ($1, $2, $3) RETURNING id',
      [phone, 'SYNTHETIC Platform Administrator', 'verified'],
    );
    userId = inserted.rows[0].id;
  }

  for (const role of ['customer', 'reviewer', 'platform_admin']) {
    await client.query(
      'INSERT INTO user_roles (user_id, role) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2)',
      [userId, role],
    );
  }

  const token = randomBytes(32).toString('hex');
  await client.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at, auth_method, mfa_verified_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval, 'sandbox', now())`,
    [tokenHash(token), userId, String(SESSION_SECONDS)],
  );

  await client.query(
    "INSERT INTO audit_events(actor_user_id, event_type, entity_type, entity_id, payload) VALUES (NULL, 'identity.dev_admin_seeded', 'user', $1, $2)",
    [userId, JSON.stringify({ seeded: true, roles: ['customer', 'reviewer', 'platform_admin'] })],
  );

  await client.query('COMMIT');

  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  console.log('\nDevelopment administrator is ready (sandbox only — no real money moves).\n');
  console.log(`  User id : ${userId}`);
  console.log(`  Phone   : ${phone}`);
  console.log(`  Roles   : customer, reviewer, platform_admin`);
  console.log(`  Expires : ${expiresAt} (8h)\n`);
  console.log(
    'Option 1 — immediate session (paste once in the browser console on the app origin):',
  );
  console.log(`  document.cookie = 'hw_session=${token}; path=/api; SameSite=Strict'`);
  console.log('Then open: /institutional/reviews and /institutional/metrics\n');
  console.log('Option 2 — verify the session with curl:');
  console.log(
    `  curl -H 'Cookie: hw_session=${token}' http://127.0.0.1:4000/api/security/session\n`,
  );
  console.log('To sign in through the UI instead, use the phone above at /account (the sandbox');
  console.log('code is shown on screen), then enrol an authenticator at /account/security.\n');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

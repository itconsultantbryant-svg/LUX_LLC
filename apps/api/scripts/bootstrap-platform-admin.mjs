// Operator-only bootstrap. No HTTP endpoint or self-registration path invokes this script.
import { config } from 'dotenv';
import pg from 'pg';
config({ quiet: true });
const id = process.argv[2];
if (!id || !/^[a-f0-9-]{36}$/i.test(id))
  throw new Error('Usage: node scripts/bootstrap-platform-admin.mjs <existing-user-uuid>');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('platform-role-management',0))",
  );
  if ((await client.query("SELECT 1 FROM user_roles WHERE role='platform_admin' LIMIT 1")).rowCount)
    throw new Error(
      'A platform administrator already exists. Use the authorized role-management API.',
    );
  const eligible = await client.query(
    `SELECT u.id FROM users u JOIN mfa_credentials m ON m.user_id=u.id WHERE u.id=$1 AND u.suspended_at IS NULL AND m.verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=u.id AND s.expires_at>now() AND s.revoked_at IS NULL AND ($2 OR s.auth_method='phone')) FOR UPDATE OF u`,
    [id, process.env.APP_ENV !== 'production'],
  );
  if (!eligible.rowCount)
    throw new Error(
      'The account needs an active verified-phone session and an enrolled authenticator.',
    );
  await client.query("INSERT INTO user_roles(user_id,role) VALUES($1,'platform_admin')", [id]);
  await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
  await client.query(
    "INSERT INTO audit_events(actor_user_id,event_type,entity_type,entity_id) VALUES(NULL,'identity.platform_admin_bootstrapped','user',$1)",
    [id],
  );
  await client.query('COMMIT');
  console.log('Initial platform administrator provisioned. Sign in and verify MFA again.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

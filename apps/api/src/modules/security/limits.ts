import type pg from 'pg';
import { IdentityError, tokenHash } from '../identity/service.js';
// Atomic across instances; denied attempts remain counted even when business transactions roll back.
export async function limit(
  pool: pg.Pool,
  scope: string,
  subject: string,
  max: number,
  seconds: number,
) {
  const key = `${scope}:${tokenHash(subject)}`;
  const result = await pool.query<{ count: number }>(
    `INSERT INTO identity_limits (key,count,expires_at) VALUES ($1,1,now()+$2*interval '1 second') ON CONFLICT (key) DO UPDATE SET count=CASE WHEN identity_limits.expires_at<=now() THEN 1 ELSE identity_limits.count+1 END, expires_at=CASE WHEN identity_limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE identity_limits.expires_at END RETURNING count`,
    [key, seconds],
  );
  if (result.rows[0].count > max)
    throw new IdentityError(429, 'Too many attempts. Wait before trying again.');
}

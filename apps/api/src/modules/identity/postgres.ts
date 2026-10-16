import type pg from 'pg';
import { ConsentTypeSchema, RoleCodeSchema, type IdentityProfile } from '@healthwallet/shared';
import type { Challenge, IdentityStore, IdentityTransaction } from './store.js';

class PostgresTransaction implements IdentityTransaction {
  constructor(private readonly client: pg.PoolClient) {}

  async lockRequest(phone: string, ipHash: string) {
    // All issuers acquire locks in the same order, including across API instances.
    await this.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `otp-ip:${ipHash}`,
    ]);
    await this.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `otp-phone:${phone}`,
    ]);
  }
  async requestCounts(phone: string, ipHash: string, since: Date, cooldown: Date) {
    const result = await this.client.query<{ phone: number; ip: number; coolingDown: boolean }>(
      `
      SELECT count(*) FILTER (WHERE phone = $1)::int AS phone,
        count(*) FILTER (WHERE ip_hash = $2)::int AS ip,
        coalesce(bool_or(phone = $1 AND created_at > $4), false) AS "coolingDown"
      FROM otp_challenges WHERE created_at > $3 AND (phone = $1 OR ip_hash = $2)
    `,
      [phone, ipHash, since, cooldown],
    );
    return result.rows[0];
  }
  async invalidatePhone(phone: string, now: Date) {
    await this.client.query(
      'UPDATE otp_challenges SET consumed_at = $2 WHERE phone = $1 AND consumed_at IS NULL',
      [phone, now],
    );
  }
  async createChallenge(input: Challenge & { ipHash: string; createdAt: Date }) {
    await this.client.query(
      `INSERT INTO otp_challenges (id, phone, code_hash, ip_hash, expires_at, created_at, auth_method)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.phone,
        input.codeHash,
        input.ipHash,
        input.expiresAt,
        input.createdAt,
        input.authMethod,
      ],
    );
  }
  async challengeForUpdate(id: string) {
    const result = await this.client.query<Challenge>(
      `SELECT id, phone, auth_method AS "authMethod", code_hash AS "codeHash",
      expires_at AS "expiresAt", attempts, consumed_at AS "consumedAt"
      FROM otp_challenges WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return result.rows[0] ?? null;
  }
  async updateChallenge(id: string, attempts: number, consumedAt: Date | null) {
    await this.client.query(
      'UPDATE otp_challenges SET attempts = $2, consumed_at = $3 WHERE id = $1',
      [id, attempts, consumedAt],
    );
  }
  async ensureCustomer(phone: string) {
    const inserted = await this.client.query<{ id: string }>(
      `INSERT INTO users (phone_e164) VALUES ($1)
      ON CONFLICT (phone_e164) DO NOTHING RETURNING id`,
      [phone],
    );
    if (inserted.rows[0]) {
      const id = inserted.rows[0].id;
      await this.client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'customer')", [
        id,
      ]);
      return id;
    }
    const existing = await this.client.query<{ id: string }>(
      'SELECT id FROM users WHERE phone_e164 = $1',
      [phone],
    );
    return existing.rows[0].id;
  }
  async recordConsent(
    userId: string,
    consentType: 'service_terms' | 'health_data',
    granted: boolean,
    version: string,
  ) {
    await this.client.query(
      'INSERT INTO consents (user_id, consent_type, granted, version) VALUES ($1, $2, $3, $4)',
      [userId, consentType, granted, version],
    );
  }
  async createSession(hash: string, userId: string, expiresAt: Date, authMethod = 'sandbox') {
    await this.client.query(
      'INSERT INTO auth_sessions (token_hash, user_id, expires_at, auth_method) SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM users WHERE id=$2 AND suspended_at IS NULL)',
      [hash, userId, expiresAt, authMethod],
    );
  }
  async audit(userId: string, event: string) {
    await this.client.query(
      "INSERT INTO audit_events (actor_user_id, event_type, entity_type, entity_id) VALUES ($1, $2, 'user', $1)",
      [userId, event],
    );
  }
}

export class PostgresIdentityStore implements IdentityStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly allowSandbox = true,
  ) {}
  async transaction<T>(work: (tx: IdentityTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PostgresTransaction(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async invalidateChallenge(id: string, now: Date) {
    await this.pool.query('UPDATE otp_challenges SET consumed_at = $2 WHERE id = $1', [id, now]);
  }
  async profile(hash: string, now: Date): Promise<IdentityProfile | null> {
    const result = await this.pool.query<{ id: string; phone: string }>(
      `SELECT u.id, u.phone_e164 AS phone
      FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2 AND s.revoked_at IS NULL AND u.suspended_at IS NULL AND ($3 OR s.auth_method = 'phone')`,
      [hash, now, this.allowSandbox],
    );
    const user = result.rows[0];
    if (!user) return null;
    const [roles, consents] = await Promise.all([
      this.pool.query<{ role: string }>('SELECT role FROM user_roles WHERE user_id = $1', [
        user.id,
      ]),
      this.pool.query<{ consentType: string; granted: boolean; version: string; createdAt: Date }>(
        `
        SELECT DISTINCT ON (consent_type) consent_type AS "consentType", granted, version, created_at AS "createdAt"
        FROM consents WHERE user_id = $1 ORDER BY consent_type, created_at DESC, id DESC`,
        [user.id],
      ),
    ]);
    return {
      ...user,
      roles: roles.rows.map((row) => RoleCodeSchema.parse(row.role)),
      consents: consents.rows
        .filter((row) => ConsentTypeSchema.safeParse(row.consentType).success)
        .map((row) => ({
          ...row,
          consentType: ConsentTypeSchema.parse(row.consentType),
          createdAt: row.createdAt.toISOString(),
        })),
    };
  }
  async revokeSession(hash: string) {
    await this.pool.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [hash],
    );
  }
}

import type pg from 'pg';
import type { Env } from '../../config/env.js';
import { IdentityError, tokenHash } from '../identity/service.js';
export const institutionRoles = [
  'provider_staff',
  'provider_manager',
  'organization_admin',
  'program_manager',
  'reviewer',
  'finance_operator',
  'partner_officer',
  'employer_admin',
] as const;
export type InstitutionRole = (typeof institutionRoles)[number];
export type Principal = {
  id: string;
  phone: string;
  sessionHash: string;
  authMethod: string;
  createdAt: Date;
  mfaVerifiedAt: Date | null;
  roles: string[];
};
export type Bill = {
  id: string;
  customer_user_id: string;
  dependent_id: string | null;
  provider_organization_id: string | null;
  status: string;
  currency: string | null;
  total_amount_minor: number | null;
  provider_name: string | null;
  confirmed_fields: unknown;
  validation_state: string | null;
  created_at: Date;
};
export const denied = () =>
  new IdentityError(403, 'You do not have permission for this operation.');
export const missing = () =>
  new IdentityError(404, 'Record not found or access is not authorized.');
export class Access {
  constructor(
    readonly client: pg.PoolClient,
    readonly actor: Principal,
    readonly env: Env,
  ) {}
  async audit(
    event: string,
    entityType: string,
    entityId: string | null,
    payload: Record<string, unknown> = {},
  ) {
    await this.client.query(
      'INSERT INTO audit_events(actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,$5)',
      [this.actor.id, event, entityType, entityId, JSON.stringify(payload)],
    );
  }
  freshPhone() {
    if (this.actor.createdAt.getTime() < Date.now() - 10 * 60_000)
      throw new IdentityError(403, 'Sign in again before changing account security.');
  }
  mfa() {
    const fresh =
      this.actor.mfaVerifiedAt !== null &&
      this.actor.mfaVerifiedAt.getTime() >= Date.now() - 15 * 60_000;
    // Operator-only seed/bootstrap scripts mint sandbox sessions with MFA already
    // verified against a non-production database. With no authenticator to
    // re-verify, such a session stays valid for the whole session (production
    // accepts verified-phone sessions only and never reaches here with sandbox).
    const sandboxVerified =
      this.actor.mfaVerifiedAt !== null &&
      this.actor.authMethod === 'sandbox' &&
      this.env.APP_ENV !== 'production';
    if (!fresh && !sandboxVerified)
      throw new IdentityError(403, 'Verify your authenticator code to continue.');
  }
  platform() {
    this.mfa();
    if (!this.actor.roles.includes('platform_admin')) throw denied();
  }
  async organization(
    id: string,
    roles: readonly string[],
    platform = false,
  ): Promise<InstitutionRole | 'platform_admin'> {
    if (platform && this.actor.roles.includes('platform_admin')) {
      this.mfa();
      const row = await this.client.query(
        "SELECT id FROM organizations WHERE id=$1 AND status='approved' FOR SHARE",
        [id],
      );
      if (!row.rowCount) throw missing();
      return 'platform_admin';
    }
    const result = await this.client.query<{ role: InstitutionRole }>(
      `SELECT m.role FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' AND o.status='approved' AND m.role=ANY($3::text[]) FOR SHARE OF m,o`,
      [id, this.actor.id, roles],
    );
    if (!result.rows[0]) throw missing();
    this.mfa();
    return result.rows[0].role;
  }
  async customer(owner: string, dependent: string | null, scope: string): Promise<boolean> {
    const user = await this.client.query(
      'SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL FOR SHARE',
      [owner],
    );
    if (!user.rowCount) return false;
    if (dependent) {
      const subject = await this.client.query(
        'SELECT id FROM dependents WHERE id=$1 AND guardian_user_id=$2 FOR SHARE',
        [dependent, owner],
      );
      if (!subject.rowCount) return false;
    }
    if (owner === this.actor.id) return true;
    const result = await this.client.query(
      `SELECT id FROM care_authorizations WHERE owner_user_id=$1 AND caregiver_user_id=$2 AND dependent_id IS NOT DISTINCT FROM $3::uuid AND scopes ? $4 AND revoked_at IS NULL AND expires_at>now() FOR SHARE`,
      [owner, this.actor.id, dependent, scope],
    );
    return !!result.rowCount;
  }
  async bill(
    id: string,
    scope: 'records:read' | 'records:write' | 'documents:read' | 'documents:write',
  ): Promise<{ bill: Bill; medical: boolean }> {
    const result = await this.client.query<Bill>('SELECT * FROM bills WHERE id=$1 FOR SHARE', [id]);
    const bill = result.rows[0];
    if (!bill) throw missing();
    if (await this.customer(bill.customer_user_id, bill.dependent_id, scope))
      return { bill, medical: true };
    if (!bill.provider_organization_id) throw missing();
    const roles =
      scope === 'records:read'
        ? [
            'provider_staff',
            'provider_manager',
            'organization_admin',
            'reviewer',
            'finance_operator',
            'program_manager',
          ]
        : ['provider_staff', 'provider_manager', 'organization_admin'];
    const role = await this.organization(bill.provider_organization_id, roles);
    return {
      bill,
      medical: ['provider_staff', 'provider_manager', 'organization_admin'].includes(role),
    };
  }
}
export function publicBill(bill: Bill, medical: boolean) {
  return {
    id: bill.id,
    status: bill.status,
    validationState: bill.validation_state,
    currency: bill.currency,
    totalAmountMinor: bill.total_amount_minor,
    ...(medical
      ? {
          customerUserId: bill.customer_user_id,
          dependentId: bill.dependent_id,
          providerOrganizationId: bill.provider_organization_id,
          providerName: bill.provider_name,
          confirmedFields: bill.confirmed_fields,
        }
      : {}),
    createdAt: bill.created_at,
  };
}
export async function withSession<T>(
  pool: pg.Pool,
  env: Env,
  token: string | undefined,
  work: (access: Access) => Promise<T>,
): Promise<T> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new IdentityError(401, 'Sign in to continue.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<Omit<Principal, 'roles'>>(
      `SELECT u.id,u.phone_e164 AS phone,s.token_hash AS "sessionHash",s.auth_method AS "authMethod",s.created_at AS "createdAt",s.mfa_verified_at AS "mfaVerifiedAt" FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.suspended_at IS NULL AND ($2::boolean OR s.auth_method IN ('phone','password')) FOR SHARE OF s,u`,
      [tokenHash(token), env.APP_ENV !== 'production'],
    );
    const actor = result.rows[0];
    if (!actor)
      throw new IdentityError(
        401,
        'Your session has expired or access was revoked. Sign in again.',
      );
    const roles = await client.query<{ role: string }>(
      'SELECT role FROM user_roles WHERE user_id=$1 FOR SHARE',
      [actor.id],
    );
    const value = await work(
      new Access(client, { ...actor, roles: roles.rows.map((row) => row.role) }, env),
    );
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

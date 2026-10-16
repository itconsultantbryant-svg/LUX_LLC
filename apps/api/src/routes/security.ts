import { walletSummary } from '../modules/ledger/wallet.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sessionToken } from './identity.js';
import { IdentityError, tokenHash } from '../modules/identity/service.js';
import {
  Access,
  denied,
  institutionRoles,
  missing,
  publicBill,
  withSession,
} from '../modules/security/access.js';
import {
  decryptSecret,
  encryptSecret,
  newTotpSecret,
  verifyTotp,
} from '../modules/security/crypto.js';
import { limit } from '../modules/security/limits.js';
import {
  documentDownloadSecret,
  mintDocumentDownloadToken,
  verifyDocumentDownloadToken,
} from '../modules/security/download-tokens.js';
const uuid = z.uuid();
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const name = z.string().trim().min(1).max(200);
const scopes = z
  .array(z.enum(['records:read', 'records:write', 'documents:read', 'documents:write']))
  .min(1)
  .max(4);
const organizationRoles = z.enum(institutionRoles);
const params = (request: FastifyRequest) => z.record(z.string(), uuid).parse(request.params);

/** Reject uploads whose real bytes do not match the declared content type. */
function assertContentMatchesType(bytes: Buffer, contentType: string): void {
  const startsWith = (signature: number[]) =>
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  const ok =
    contentType === 'application/pdf'
      ? startsWith([0x25, 0x50, 0x44, 0x46])
      : contentType === 'image/png'
        ? startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : contentType === 'image/jpeg'
          ? startsWith([0xff, 0xd8, 0xff])
          : contentType === 'text/plain'
            ? !bytes.includes(0x00)
            : false;
  if (!ok) throw new IdentityError(400, 'The file content does not match its declared type.');
}

export const securityRoutes: FastifyPluginAsync = async (app) => {
  const origins = new Set(app.ctx.env.CORS_ORIGIN.split(',').map((value) => value.trim()));
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (
      request.headers['sec-fetch-site'] === 'cross-site' ||
      (request.method !== 'GET' && request.headers.origin && !origins.has(request.headers.origin))
    )
      return reply.code(403).send({ message: 'This request origin is not allowed.' });
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IdentityError)
      return reply.code(error.statusCode).send({ message: error.message });
    if (error instanceof z.ZodError)
      return reply.code(400).send({ message: 'Invalid request. Check the supplied fields.' });
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['23505', '23503', '23514'].includes(String(error.code))
    )
      return reply
        .code(409)
        .send({ message: 'The request conflicts with an existing record or is no longer valid.' });
    app.log.error(
      { errorType: error instanceof Error ? error.name : 'Unknown' },
      'Protected operation failed',
    );
    return reply.code(500).send({ message: 'Unable to complete this operation. Try again later.' });
  });
  const route = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    handler: (access: Access, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (request, reply) => {
        if (method !== 'GET') {
          await limit(app.ctx.pool, 'mutation-ip', request.ip, 100, 900);
          if (url.startsWith('/api/security/')) {
            const principal = await app.ctx.pool.query<{ user_id: string }>(
              'SELECT user_id FROM auth_sessions WHERE token_hash=$1',
              [tokenHash(sessionToken(request) ?? '')],
            );
            await limit(app.ctx.pool, url, principal.rows[0]?.user_id ?? request.ip, 10, 900);
            if (
              url === '/api/security/recover' &&
              request.body &&
              typeof request.body === 'object' &&
              'oldPhone' in request.body &&
              typeof request.body.oldPhone === 'string'
            )
              await limit(app.ctx.pool, 'recovery-owner', request.body.oldPhone, 10, 3600);
          }
        }
        return withSession(app.ctx.pool, app.ctx.env, sessionToken(request), (access) =>
          handler(access, request, reply),
        );
      },
    });
  route('GET', '/api/wallet', (a) => walletSummary(a.client, a.actor.id));
  route('GET', '/api/security/session', async (a) => ({
    userId: a.actor.id,
    authMethod: a.actor.authMethod,
    mfaVerifiedUntil: a.actor.mfaVerifiedAt
      ? new Date(a.actor.mfaVerifiedAt.getTime() + 900000)
      : null,
    memberships: (
      await a.client.query(
        `SELECT m.id,m.organization_id,m.role,o.name FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.status='active' AND o.status='approved'`,
        [a.actor.id],
      )
    ).rows,
  }));
  route('POST', '/api/security/sessions/revoke', async (a) => {
    await a.client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [
      a.actor.id,
    ]);
    await a.audit('identity.all_sessions_revoked', 'user', a.actor.id);
    return { revoked: true };
  });
  route('POST', '/api/security/mfa/enroll', async (a) => {
    a.freshPhone();
    if (!a.env.SECURITY_ENCRYPTION_KEY)
      throw new IdentityError(503, 'Authenticator enrollment is not configured.');
    const secret = newTotpSecret();
    const encrypted = encryptSecret(secret, a.env.SECURITY_ENCRYPTION_KEY, a.actor.id);
    const result = await a.client.query(
      `INSERT INTO mfa_credentials(user_id,secret_encrypted) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET secret_encrypted=$2,created_at=now(),last_step=-1 WHERE mfa_credentials.verified_at IS NULL AND mfa_credentials.created_at<now()-interval '10 minutes' RETURNING user_id`,
      [a.actor.id, encrypted],
    );
    if (!result.rowCount)
      throw new IdentityError(409, 'Authenticator already enrolled or enrollment is in progress.');
    await a.audit('identity.mfa_enrollment_started', 'user', a.actor.id);
    return {
      secret,
      uri: `otpauth://totp/HealthWallet:${encodeURIComponent(a.actor.phone)}?secret=${secret}&issuer=HealthWallet&algorithm=SHA1&digits=6&period=30`,
      expiresInSeconds: 600,
    };
  });
  route('POST', '/api/security/mfa/verify', async (a, request) => {
    const { code } = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(request.body);
    if (!a.env.SECURITY_ENCRYPTION_KEY)
      throw new IdentityError(503, 'Authenticator verification is not configured.');
    const result = await a.client.query<{
      secret_encrypted: string;
      verified_at: Date | null;
      created_at: Date;
      last_step: number;
    }>('SELECT * FROM mfa_credentials WHERE user_id=$1 FOR UPDATE', [a.actor.id]);
    const row = result.rows[0];
    if (!row || (!row.verified_at && row.created_at.getTime() < Date.now() - 600000))
      throw new IdentityError(401, 'Authenticator enrollment expired or is unavailable.');
    const step = verifyTotp(
      decryptSecret(row.secret_encrypted, a.env.SECURITY_ENCRYPTION_KEY, a.actor.id),
      code,
      row.last_step,
    );
    if (step === null)
      throw new IdentityError(401, 'Invalid, expired, or already used authenticator code.');
    await a.client.query(
      'UPDATE mfa_credentials SET verified_at=coalesce(verified_at,now()),last_step=$2 WHERE user_id=$1',
      [a.actor.id, step],
    );
    await a.client.query('UPDATE auth_sessions SET mfa_verified_at=now() WHERE token_hash=$1', [
      a.actor.sessionHash,
    ]);
    await a.audit('identity.mfa_verified', 'user', a.actor.id);
    return { verified: true, expiresInSeconds: 900 };
  });
  route('POST', '/api/security/recovery-codes', async (a) => {
    a.freshPhone();
    const mfa = await a.client.query(
      'SELECT user_id FROM mfa_credentials WHERE user_id=$1 AND verified_at IS NOT NULL',
      [a.actor.id],
    );
    if (mfa.rowCount) a.mfa();
    const codes = Array.from({ length: 8 }, () => randomBytes(24).toString('hex'));
    await a.client.query('DELETE FROM recovery_codes WHERE user_id=$1', [a.actor.id]);
    for (const code of codes)
      await a.client.query('INSERT INTO recovery_codes(hash,user_id) VALUES($1,$2)', [
        tokenHash(code),
        a.actor.id,
      ]);
    await a.audit('identity.recovery_codes_rotated', 'user', a.actor.id);
    return {
      codes,
      message: 'Save these once-only recovery codes offline. Previous codes are revoked.',
    };
  });
  route('POST', '/api/security/recover', async (a, request) => {
    a.freshPhone();
    const body = z
      .object({ oldPhone: phone, recoveryCode: z.string().regex(/^[a-f0-9]{48}$/) })
      .strict()
      .parse(request.body);
    const result = await a.client.query<{ id: string }>(
      `SELECT u.id FROM users u JOIN recovery_codes r ON r.user_id=u.id WHERE u.phone_e164=$1 AND r.hash=$2 AND r.used_at IS NULL AND u.suspended_at IS NULL FOR UPDATE OF u,r`,
      [body.oldPhone, tokenHash(body.recoveryCode)],
    );
    const owner = result.rows[0];
    if (!owner || owner.id === a.actor.id)
      throw new IdentityError(401, 'Account recovery could not be verified.');
    const clean = await a.client.query(
      `SELECT id FROM users u WHERE u.id=$1 AND u.created_at>now()-interval '10 minutes' AND NOT EXISTS(SELECT 1 FROM bills WHERE customer_user_id=u.id) AND NOT EXISTS(SELECT 1 FROM organization_memberships WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM organizations WHERE created_by=u.id) AND NOT EXISTS(SELECT 1 FROM care_authorizations WHERE owner_user_id=u.id OR caregiver_user_id=u.id) AND NOT EXISTS(SELECT 1 FROM dependents WHERE guardian_user_id=u.id) AND NOT EXISTS(SELECT 1 FROM contributions WHERE contributor_user_id=u.id) AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role<>'customer')`,
      [a.actor.id],
    );
    if (!clean.rowCount)
      throw new IdentityError(
        409,
        'Use a newly verified number without an existing account history for recovery.',
      );
    await a.client.query('UPDATE recovery_codes SET used_at=now() WHERE hash=$1', [
      tokenHash(body.recoveryCode),
    ]);
    await a.client.query(
      'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=ANY($1::uuid[])',
      [[owner.id, a.actor.id]],
    );
    await a.client.query(
      'UPDATE organization_invitations SET revoked_at=now() WHERE phone=$1 OR invited_by=$2',
      [body.oldPhone, owner.id],
    );
    await a.audit('identity.phone_recovered', 'user', owner.id);
    await a.client.query('DELETE FROM users WHERE id=$1', [a.actor.id]);
    await a.client.query('UPDATE users SET phone_e164=$2,updated_at=now() WHERE id=$1', [
      owner.id,
      a.actor.phone,
    ]);
    return {
      recovered: true,
      message: 'Sign in with your new number. Existing authenticator requirements are unchanged.',
    };
  });
  route('POST', '/api/security/mfa/reset', async (a, request) => {
    a.freshPhone();
    const { recoveryCode } = z
      .object({ recoveryCode: z.string().regex(/^[a-f0-9]{48}$/) })
      .strict()
      .parse(request.body);
    const result = await a.client.query(
      'UPDATE recovery_codes SET used_at=now() WHERE hash=$1 AND user_id=$2 AND used_at IS NULL RETURNING hash',
      [tokenHash(recoveryCode), a.actor.id],
    );
    if (!result.rowCount) throw new IdentityError(401, 'Invalid recovery code.');
    await a.client.query('DELETE FROM mfa_credentials WHERE user_id=$1', [a.actor.id]);
    await a.client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [
      a.actor.id,
    ]);
    await a.audit('identity.mfa_reset', 'user', a.actor.id);
    return {
      reset: true,
      message: 'Sign in again and enroll a new authenticator. Institutional access requires MFA.',
    };
  });
  route('GET', '/api/customers/me', async (a) => ({
    profile: (
      await a.client.query(
        'SELECT u.id,u.phone_e164 AS phone,u.verification_status,p.display_name,p.preferred_language FROM users u LEFT JOIN customer_profiles p ON p.user_id=u.id WHERE u.id=$1',
        [a.actor.id],
      )
    ).rows[0],
    consents: (
      await a.client.query(
        'SELECT consent_type,granted,version,created_at FROM consents WHERE user_id=$1 ORDER BY created_at DESC,id DESC',
        [a.actor.id],
      )
    ).rows,
    reviews: (
      await a.client.query(
        "SELECT status,note,created_at FROM verification_reviews WHERE entity_type='user' AND entity_id=$1 ORDER BY created_at DESC",
        [a.actor.id],
      )
    ).rows,
  }));
  route('PATCH', '/api/customers/me', async (a, request) => {
    const body = z
      .object({ displayName: name, preferredLanguage: z.enum(['en', 'fr']).default('en') })
      .strict()
      .parse(request.body);
    await a.client.query(
      'INSERT INTO customer_profiles(user_id,display_name,preferred_language) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET display_name=$2,preferred_language=$3,updated_at=now()',
      [a.actor.id, body.displayName, body.preferredLanguage],
    );
    await a.audit('profile.updated', 'user', a.actor.id);
    return { updated: true };
  });
  route('POST', '/api/dependents', async (a, request) => {
    const body = z
      .object({
        displayName: name,
        relationship: z.string().trim().min(1).max(80),
        guardianAttestation: z.literal(true),
      })
      .strict()
      .parse(request.body);
    const result = await a.client.query(
      'INSERT INTO dependents(guardian_user_id,display_name,relationship) VALUES($1,$2,$3) RETURNING *',
      [a.actor.id, body.displayName, body.relationship],
    );
    await a.audit('dependent.created', 'dependent', result.rows[0].id);
    return {
      dependent: result.rows[0],
      message: 'Guardian declaration recorded; no access to any other account has been granted.',
    };
  });
  route('GET', '/api/dependents', async (a) => ({
    dependents: (
      await a.client.query('SELECT * FROM dependents WHERE guardian_user_id=$1', [a.actor.id])
    ).rows,
  }));
  route('GET', '/api/dependents/:id', async (a, request) => {
    const { id } = params(request);
    const result = await a.client.query<{
      guardian_user_id: string;
      id: string;
      display_name: string;
      relationship: string;
    }>('SELECT * FROM dependents WHERE id=$1', [id]);
    const row = result.rows[0];
    if (!row || !(await a.customer(row.guardian_user_id, id, 'records:read'))) throw missing();
    return { dependent: row };
  });
  route('POST', '/api/care-authorizations', async (a, request) => {
    a.freshPhone();
    const body = z
      .object({
        caregiverUserId: uuid,
        dependentId: uuid.nullable().default(null),
        scopes,
        expiresAt: z.iso.datetime(),
      })
      .strict()
      .parse(request.body);
    const expires = new Date(body.expiresAt);
    if (
      expires <= new Date() ||
      expires.getTime() > Date.now() + 365 * 86400000 ||
      body.caregiverUserId === a.actor.id
    )
      throw new IdentityError(400, 'Choose another caregiver and an expiry within one year.');
    if (!(await a.customer(a.actor.id, body.dependentId, 'records:write'))) throw missing();
    const result = await a.client.query(
      'INSERT INTO care_authorizations(owner_user_id,caregiver_user_id,dependent_id,scopes,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [a.actor.id, body.caregiverUserId, body.dependentId, JSON.stringify(body.scopes), expires],
    );
    await a.audit('care.authorization_granted', 'care_authorization', result.rows[0].id, {
      scopes: body.scopes,
    });
    return result.rows[0];
  });
  route('GET', '/api/care-authorizations', async (a) => ({
    authorizations: (
      await a.client.query(
        'SELECT * FROM care_authorizations WHERE owner_user_id=$1 OR caregiver_user_id=$1',
        [a.actor.id],
      )
    ).rows,
  }));
  route('DELETE', '/api/care-authorizations/:id', async (a, request) => {
    const { id } = params(request);
    const result = await a.client.query(
      'UPDATE care_authorizations SET revoked_at=now() WHERE id=$1 AND (owner_user_id=$2 OR caregiver_user_id=$2) RETURNING id',
      [id, a.actor.id],
    );
    if (!result.rowCount) throw missing();
    await a.audit('care.authorization_revoked', 'care_authorization', id);
    return { revoked: true };
  });
  route('POST', '/api/organizations', async (a, request) => {
    const body = z
      .object({
        name,
        kind: z.enum(['provider', 'sponsor', 'partner']),
        registrationNumber: z.string().trim().min(1).max(100),
      })
      .strict()
      .parse(request.body);
    const result = await a.client.query(
      'INSERT INTO organizations(name,kind,registration_number,created_by) VALUES($1,$2,$3,$4) RETURNING *',
      [body.name, body.kind, body.registrationNumber, a.actor.id],
    );
    await a.audit('organization.onboarding_submitted', 'organization', result.rows[0].id);
    return {
      organization: result.rows[0],
      message: 'Pending verification. No institutional roles have been granted.',
    };
  });
  route('GET', '/api/organizations', async (a) => ({
    organizations: (
      await a.client.query(
        `SELECT DISTINCT o.id,o.name,o.kind,o.status FROM organizations o LEFT JOIN organization_memberships m ON m.organization_id=o.id AND m.user_id=$1 AND m.status='active' WHERE (o.created_by=$1 AND o.status IN ('pending','rejected')) OR (m.user_id=$1 AND o.status='approved')`,
        [a.actor.id],
      )
    ).rows,
  }));
  route('GET', '/api/organizations/:id', async (a, request) => {
    const { id } = params(request);
    const result = await a.client.query('SELECT * FROM organizations WHERE id=$1', [id]);
    const org = result.rows[0];
    if (!org) throw missing();
    if (org.created_by !== a.actor.id || !['pending', 'rejected'].includes(org.status))
      await a.organization(id, institutionRoles, true);
    return {
      organization: org,
      reviews: (
        await a.client.query(
          "SELECT status,note,created_at FROM verification_reviews WHERE entity_type='organization' AND entity_id=$1 ORDER BY created_at DESC",
          [id],
        )
      ).rows,
    };
  });
  route('GET', '/api/organizations/:id/members', async (a, request) => {
    const { id } = params(request);
    await a.organization(id, ['organization_admin', 'provider_manager'], true);
    return {
      members: (
        await a.client.query(
          'SELECT id,user_id,role,status,created_at FROM organization_memberships WHERE organization_id=$1',
          [id],
        )
      ).rows,
    };
  });
  route('POST', '/api/organizations/:id/invitations', async (a, request) => {
    const { id } = params(request);
    const issuer = await a.organization(id, ['organization_admin', 'provider_manager'], true);
    const body = z.object({ phone, role: organizationRoles }).strict().parse(request.body);
    if (issuer === 'provider_manager' && body.role !== 'provider_staff') throw denied();
    const kind = (
      await a.client.query<{ kind: string }>('SELECT kind FROM organizations WHERE id=$1', [id])
    ).rows[0].kind;
    const permitted =
      kind === 'provider'
        ? [
            'organization_admin',
            'provider_manager',
            'provider_staff',
            'finance_operator',
            'reviewer',
          ]
        : kind === 'sponsor'
          ? ['organization_admin', 'program_manager', 'reviewer', 'finance_operator']
          : ['organization_admin', 'partner_officer', 'finance_operator'];
    if (!permitted.includes(body.role)) throw denied();
    const token = randomBytes(32).toString('hex');
    const result = await a.client.query(
      "INSERT INTO organization_invitations(organization_id,phone,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '72 hours') RETURNING id,expires_at",
      [id, body.phone, body.role, tokenHash(token), a.actor.id],
    );
    await a.audit('organization.invitation_created', 'organization', id, { role: body.role });
    return {
      ...result.rows[0],
      invitationToken: token,
      message:
        'Share privately with the invited person. Acceptance requires their verified phone and authenticator.',
    };
  });
  route('DELETE', '/api/organizations/:id/invitations/:invitationId', async (a, request) => {
    const { id, invitationId } = params(request);
    await a.organization(id, ['organization_admin', 'provider_manager'], true);
    const result = await a.client.query(
      'UPDATE organization_invitations SET revoked_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id',
      [invitationId, id],
    );
    if (!result.rowCount) throw missing();
    await a.audit('organization.invitation_revoked', 'organization', id);
    return { revoked: true };
  });
  route('POST', '/api/invitations/accept', async (a, request) => {
    a.mfa();
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(request.body);
    const result = await a.client.query<{
      id: string;
      organization_id: string;
      role: string;
      invited_by: string;
    }>(
      `SELECT i.id,i.organization_id,i.role,i.invited_by FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.phone=$2 AND i.expires_at>now() AND i.revoked_at IS NULL AND i.consumed_at IS NULL AND o.status='approved' FOR UPDATE OF i FOR SHARE OF o`,
      [tokenHash(token), a.actor.phone],
    );
    const invite = result.rows[0];
    if (!invite) throw missing();
    const issuer = await a.client.query(
      'SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL FOR SHARE',
      [invite.invited_by],
    );
    const globalIssuer = await a.client.query(
      "SELECT role FROM user_roles WHERE user_id=$1 AND role='platform_admin' FOR SHARE",
      [invite.invited_by],
    );
    const memberIssuer = await a.client.query(
      "SELECT role FROM organization_memberships WHERE user_id=$1 AND organization_id=$2 AND status='active' AND (role='organization_admin' OR (role='provider_manager' AND $3='provider_staff')) FOR SHARE",
      [invite.invited_by, invite.organization_id, invite.role],
    );
    if (!issuer.rowCount || (!globalIssuer.rowCount && !memberIssuer.rowCount)) throw missing();
    await a.client.query('UPDATE organization_invitations SET consumed_at=now() WHERE id=$1', [
      invite.id,
    ]);
    await a.client.query(
      `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(organization_id,user_id,role) DO UPDATE SET status='active'`,
      [invite.organization_id, a.actor.id, invite.role],
    );
    await a.audit('organization.invitation_accepted', 'organization', invite.organization_id, {
      role: invite.role,
    });
    return { accepted: true, organizationId: invite.organization_id, role: invite.role };
  });
  route('PATCH', '/api/organizations/:id/members/:membershipId', async (a, request) => {
    const { id, membershipId } = params(request);
    const issuer = await a.organization(id, ['organization_admin', 'provider_manager'], true);
    const { status } = z
      .object({ status: z.enum(['active', 'suspended', 'revoked']) })
      .strict()
      .parse(request.body);
    const result = await a.client.query<{ user_id: string; role: string }>(
      'SELECT user_id,role FROM organization_memberships WHERE id=$1 AND organization_id=$2 FOR UPDATE',
      [membershipId, id],
    );
    const member = result.rows[0];
    if (!member) throw missing();
    if (issuer === 'provider_manager' && member.role !== 'provider_staff') throw denied();
    if (member.user_id === a.actor.id)
      throw new IdentityError(403, 'Another administrator must change your membership.');
    await a.client.query('UPDATE organization_memberships SET status=$2 WHERE id=$1', [
      membershipId,
      status,
    ]);
    await a.client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [
      member.user_id,
    ]);
    await a.client.query(
      'UPDATE organization_invitations SET revoked_at=now() WHERE organization_id=$1 AND consumed_at IS NULL AND (invited_by=$2 OR phone=(SELECT phone_e164 FROM users WHERE id=$2))',
      [id, member.user_id],
    );
    await a.audit('organization.membership_changed', 'organization', id, { membershipId, status });
    return { updated: true, sessionsRevoked: true };
  });
  route('GET', '/api/admin/onboarding', async (a) => {
    a.platform();
    return {
      organizations: (
        await a.client.query(
          'SELECT id,name,kind,status,created_at FROM organizations ORDER BY created_at DESC LIMIT 100',
        )
      ).rows,
    };
  });
  route('POST', '/api/admin/organizations/:id/reviews', async (a, request) => {
    a.platform();
    const { id } = params(request);
    const body = z
      .object({
        status: z.enum(['approved', 'rejected', 'suspended']),
        note: z.string().trim().min(5).max(2000),
      })
      .strict()
      .parse(request.body);
    const result = await a.client.query<{ created_by: string; status: string }>(
      'SELECT created_by,status FROM organizations WHERE id=$1 FOR UPDATE',
      [id],
    );
    const org = result.rows[0];
    if (!org) throw missing();
    if (org.created_by === a.actor.id)
      throw new IdentityError(403, 'You cannot verify your own organization.');
    await a.client.query('UPDATE organizations SET status=$2 WHERE id=$1', [id, body.status]);
    if (body.status === 'approved' && ['pending', 'rejected'].includes(org.status))
      await a.client.query(
        `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin') ON CONFLICT DO NOTHING`,
        [id, org.created_by],
      );
    await a.client.query(
      "INSERT INTO verification_reviews(entity_type,entity_id,reviewer_user_id,status,note) VALUES('organization',$1,$2,$3,$4)",
      [id, a.actor.id, body.status, body.note],
    );
    if (body.status !== 'approved') {
      await a.client.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id IN (SELECT user_id FROM organization_memberships WHERE organization_id=$1)',
        [id],
      );
      await a.client.query(
        'UPDATE organization_invitations SET revoked_at=now() WHERE organization_id=$1 AND consumed_at IS NULL',
        [id],
      );
    }
    await a.audit('organization.verification_reviewed', 'organization', id, {
      status: body.status,
    });
    return { reviewed: true, status: body.status };
  });
  route('POST', '/api/admin/users/:id/reviews', async (a, request) => {
    a.platform();
    const { id } = params(request);
    if (id === a.actor.id) throw denied();
    const body = z
      .object({
        status: z.enum(['verified', 'rejected']),
        note: z.string().trim().min(5).max(2000),
      })
      .strict()
      .parse(request.body);
    const result = await a.client.query(
      'UPDATE users SET verification_status=$2,updated_at=now() WHERE id=$1 RETURNING id',
      [id, body.status],
    );
    if (!result.rowCount) throw missing();
    await a.client.query(
      "INSERT INTO verification_reviews(entity_type,entity_id,reviewer_user_id,status,note) VALUES('user',$1,$2,$3,$4)",
      [id, a.actor.id, body.status, body.note],
    );
    await a.audit('customer.verification_reviewed', 'user', id, { status: body.status });
    return { reviewed: true };
  });
  route('PATCH', '/api/admin/users/:id/access', async (a, request) => {
    a.platform();
    const { id } = params(request);
    if (id === a.actor.id) throw denied();
    const body = z
      .object({ suspended: z.boolean(), reason: z.string().trim().min(5).max(1000) })
      .strict()
      .parse(request.body);
    const result = await a.client.query(
      'UPDATE users SET suspended_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1 RETURNING id',
      [id, body.suspended],
    );
    if (!result.rowCount) throw missing();
    await a.client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
    await a.audit('identity.access_changed', 'user', id, {
      suspended: body.suspended,
      reason: body.reason,
    });
    return { updated: true, sessionsRevoked: true };
  });
  route('POST', '/api/admin/users/:id/roles', async (a, request) => {
    a.platform();
    const { id } = params(request);
    if (id === a.actor.id) throw denied();
    const { role, action } = z
      .object({
        role: z.enum(['platform_admin', 'contributor']),
        action: z.enum(['grant', 'revoke']),
      })
      .strict()
      .parse(request.body);
    await a.client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('platform-role-management',0))",
    );
    const target = await a.client.query(
      'SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL FOR UPDATE',
      [id],
    );
    if (!target.rowCount) throw missing();
    if (action === 'grant') {
      if (
        role === 'platform_admin' &&
        !(
          await a.client.query(
            'SELECT user_id FROM mfa_credentials WHERE user_id=$1 AND verified_at IS NOT NULL',
            [id],
          )
        ).rowCount
      )
        throw new IdentityError(403, 'The target account must enroll an authenticator first.');
      await a.client.query(
        'INSERT INTO user_roles(user_id,role) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2)',
        [id, role],
      );
    } else await a.client.query('DELETE FROM user_roles WHERE user_id=$1 AND role=$2', [id, role]);
    await a.client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
    await a.audit('identity.role_changed', 'user', id, { role, action });
    return { updated: true, sessionsRevoked: true };
  });
  route('POST', '/api/bills', async (a, request) => {
    const body = z
      .object({
        customerUserId: uuid.optional(),
        dependentId: uuid.nullable().default(null),
        providerOrganizationId: uuid.nullable().default(null),
        providerName: name,
        category: z.string().trim().min(1).max(80).default('general'),
        totalAmountMinor: z.number().int().positive().max(100000000),
        currency: z.enum(['LRD', 'USD']),
      })
      .strict()
      .parse(request.body);
    const owner = body.customerUserId ?? a.actor.id;
    if (!(await a.customer(owner, body.dependentId, 'records:write'))) throw missing();
    if (body.providerOrganizationId) {
      const provider = await a.client.query(
        "SELECT id FROM organizations WHERE id=$1 AND kind='provider' AND status='approved' FOR SHARE",
        [body.providerOrganizationId],
      );
      if (!provider.rowCount) throw missing();
    }
    const result = await a.client.query(
      'INSERT INTO bills(customer_user_id,dependent_id,provider_organization_id,provider_name,total_amount_minor,currency,category) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [
        owner,
        body.dependentId,
        body.providerOrganizationId,
        body.providerName,
        body.totalAmountMinor,
        body.currency,
        body.category,
      ],
    );
    await a.audit('bill.created', 'bill', result.rows[0].id);
    return result.rows[0];
  });
  route('GET', '/api/bills/:id', async (a, request) => {
    const { bill, medical } = await a.bill(params(request).id, 'records:read');
    return { bill: publicBill(bill, medical) };
  });
  route('PATCH', '/api/bills/:id', async (a, request) => {
    const { id } = params(request);
    const { bill } = await a.bill(id, 'records:write');
    if (
      (await a.client.query('SELECT id FROM bill_revisions WHERE bill_id=$1 LIMIT 1', [id]))
        .rowCount
    )
      throw new IdentityError(409, 'Use the versioned provider amendment or correction workflow.');
    if (bill.status !== 'draft') throw new IdentityError(409, 'Only draft records can be changed.');
    const body = z
      .object({
        providerName: name,
        totalAmountMinor: z.number().int().positive().max(100000000),
        currency: z.enum(['LRD', 'USD']),
      })
      .strict()
      .parse(request.body);
    await a.client.query(
      'UPDATE bills SET provider_name=$2,total_amount_minor=$3,currency=$4,updated_at=now() WHERE id=$1',
      [id, body.providerName, body.totalAmountMinor, body.currency],
    );
    await a.audit('bill.updated', 'bill', id);
    return { updated: true };
  });
  route('GET', '/api/customers/:id/bills', async (a, request) => {
    const { id } = params(request);
    const dependentId =
      z.object({ dependentId: uuid.optional() }).strict().parse(request.query).dependentId ?? null;
    if (!(await a.customer(id, dependentId, 'records:read'))) throw missing();
    const result = await a.client.query(
      'SELECT id,status,currency,total_amount_minor,provider_name,created_at FROM bills WHERE customer_user_id=$1 AND dependent_id IS NOT DISTINCT FROM $2::uuid ORDER BY created_at DESC',
      [id, dependentId],
    );
    return { bills: result.rows };
  });
  route('GET', '/api/organizations/:id/bills', async (a, request) => {
    const { id } = params(request);
    const role = await a.organization(id, [
      'provider_staff',
      'provider_manager',
      'reviewer',
      'finance_operator',
      'program_manager',
    ]);
    const result = await a.client.query<import('../modules/security/access.js').Bill>(
      'SELECT * FROM bills WHERE provider_organization_id=$1 ORDER BY created_at DESC',
      [id],
    );
    return {
      bills: result.rows.map((bill) =>
        publicBill(bill, ['provider_staff', 'provider_manager'].includes(role)),
      ),
    };
  });
  route('GET', '/api/organizations/:id/summary', async (a, request) => {
    const { id } = params(request);
    await a.organization(id, institutionRoles);
    return {
      summary: (
        await a.client.query(
          'SELECT currency,count(*)::int AS bill_count,sum(total_amount_minor)::text AS total_minor FROM bills WHERE provider_organization_id=$1 GROUP BY currency',
          [id],
        )
      ).rows,
    };
  });
  route('POST', '/api/bills/:id/documents', async (a, request) => {
    const { id } = params(request);
    await a.bill(id, 'documents:write');
    if (a.env.APP_ENV === 'production' && app.ctx.adapters.storage.mode === 'sandbox')
      throw new IdentityError(503, 'Production private document storage is not configured.');
    const body = z
      .object({
        expectedRevision: z.number().int().positive().optional(),
        contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']),
        base64: z
          .string()
          .min(4)
          .max(700000)
          .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
      })
      .strict()
      .parse(request.body);
    const currentRevision = (
      await a.client.query('SELECT max(revision) AS version FROM bill_revisions WHERE bill_id=$1', [
        id,
      ])
    ).rows[0].version;
    if (currentRevision && body.expectedRevision !== currentRevision)
      throw new IdentityError(
        409,
        'Bill changed. Refresh and attach the document to the current version.',
      );
    const bytes = Buffer.from(body.base64, 'base64');
    if (bytes.length > 512 * 1024)
      throw new IdentityError(413, 'Document exceeds the 512 KiB limit.');
    assertContentMatchesType(bytes, body.contentType);
    const documentId = randomUUID();
    const key = `private/${documentId}`;
    await app.ctx.adapters.storage.putObject({ key, bytes, contentType: body.contentType });
    await a.client.query(
      'INSERT INTO bill_documents(id,bill_id,storage_key,content_type,byte_size,revision_number,uploaded_by) VALUES($1,$2,$3,$4,$5,(SELECT max(revision) FROM bill_revisions WHERE bill_id=$2),$6)',
      [documentId, id, key, body.contentType, bytes.length, a.actor.id],
    );
    await a.audit('document.uploaded', 'bill', id);
    return { documentId };
  });
  route('POST', '/api/documents/:id/download-link', async (a, request) => {
    const { id } = params(request);
    const result = await a.client.query<{ bill_id: string; purged_at: Date | null }>(
      'SELECT bill_id,purged_at FROM bill_documents WHERE id=$1',
      [id],
    );
    const document = result.rows[0];
    if (!document) throw missing();
    await a.bill(document.bill_id, 'documents:read');
    if (document.purged_at) throw new IdentityError(410, 'This document has been purged.');
    const secret = documentDownloadSecret(a.env);
    if (!secret) throw new IdentityError(503, 'Document download links are not configured.');
    const { token, expiresAt } = mintDocumentDownloadToken(secret, {
      documentId: id,
      actorId: a.actor.id,
      ttlSeconds: a.env.DOWNLOAD_LINK_TTL_SECONDS,
    });
    await a.audit('document.download_link_created', 'bill', document.bill_id, { documentId: id });
    return { url: `/api/documents/${id}/download?token=${token}`, token, expiresAt };
  });
  route('GET', '/api/documents/:id/download', async (a, request, reply) => {
    const { id } = params(request);
    const result = await a.client.query<{
      bill_id: string;
      storage_key: string;
      content_type: string;
      purged_at: Date | null;
    }>('SELECT bill_id,storage_key,content_type,purged_at FROM bill_documents WHERE id=$1', [id]);
    const document = result.rows[0];
    if (!document) throw missing();
    await a.bill(document.bill_id, 'documents:read');
    if (document.purged_at) throw new IdentityError(410, 'This document has been purged.');
    const query = z.object({ token: z.string().max(200).optional() }).parse(request.query ?? {});
    if (query.token) {
      const secret = documentDownloadSecret(a.env);
      const ok =
        secret !== null &&
        verifyDocumentDownloadToken(secret, {
          documentId: id,
          actorId: a.actor.id,
          token: query.token,
        });
      if (!ok) throw denied();
    }
    if (a.env.APP_ENV === 'production' && app.ctx.adapters.storage.mode === 'sandbox')
      throw new IdentityError(503, 'Production private document storage is not configured.');
    if (!app.ctx.adapters.storage.readObject)
      throw new IdentityError(503, 'Private document streaming is unavailable.');
    const bytes = await app.ctx.adapters.storage.readObject(document.storage_key);
    await a.audit('document.downloaded', 'bill', document.bill_id, {
      viaLink: Boolean(query.token),
    });
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="document-${id}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox");
    return bytes;
  });
  route('GET', '/api/contributions', async (a) => ({
    contributions: (
      await a.client.query(
        'SELECT id,amount_minor,currency,status,payment_reference,confirmed_at,created_at FROM contributions WHERE contributor_user_id=$1 ORDER BY created_at DESC',
        [a.actor.id],
      )
    ).rows,
  }));
  route('GET', '/api/contributions/:id', async (a, request) => {
    const { id } = params(request);
    const result = await a.client.query(
      'SELECT id,amount_minor,currency,status,payment_reference,confirmed_at,created_at FROM contributions WHERE id=$1 AND contributor_user_id=$2',
      [id, a.actor.id],
    );
    if (!result.rowCount) throw missing();
    return { contribution: result.rows[0] };
  });
};

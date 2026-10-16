import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';
import { createAdapters } from '../../adapters/index.js';
import { loadEnv } from '../../config/env.js';
import { tokenHash } from '../identity/service.js';
import { totp } from './crypto.js';

describe.skipIf(process.env.SECURITY_DATABASE_TESTS !== '1')(
  'server-enforced authorization on PostgreSQL',
  () => {
    let pool: pg.Pool;
    let admin: pg.Pool;
    const schema = `security_test_${randomUUID().replaceAll('-', '')}`;
    let app: FastifyInstance;
    let production: FastifyInstance;
    const userIds: string[] = [];
    const orgIds: string[] = [];
    const phones: string[] = [];
    const root = `/tmp/lux-authz-${randomUUID()}`;
    let ip = '';
    beforeEach(() => {
      ip = `198.51.100.${randomInt(1, 250)}`;
    });
    beforeAll(async () => {
      if (
        process.env.APP_ENV !== 'test' ||
        !new URL(process.env.DATABASE_URL ?? 'http://invalid').pathname.endsWith('_test')
      )
        throw new Error('Use the isolated *_test database with APP_ENV=test.');
      admin = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 15000,
      });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 8,
        connectionTimeoutMillis: 15000,
        options: `-c search_path=${schema}`,
      });
      const folder = new URL('../../../drizzle/', import.meta.url);
      const history = JSON.parse(readFileSync(new URL('meta/_journal.json', folder), 'utf8'));
      for (const entry of history.entries)
        await pool.query(
          readFileSync(new URL(`${entry.tag}.sql`, folder), 'utf8').replaceAll(
            '"public".',
            `"${schema}".`,
          ),
        );
      const env = loadEnv({
        ...process.env,
        APP_ENV: 'test',
        LOG_LEVEL: 'fatal',
        STORAGE_ADAPTER: 'local',
        STORAGE_LOCAL_ROOT: root,
        PAYMENT_CALLBACK_SECRET: 'sandbox-payment-callback-secret',
        SECURITY_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      });
      app = await buildApp({ pool, db: createDb(pool), env, adapters: createAdapters(env) });
      production = await buildApp({
        pool,
        db: createDb(pool),
        env: { ...env, APP_ENV: 'production' },
        adapters: createAdapters(env),
      });
    });
    afterAll(async () => {
      await app?.close();
      await production?.close();
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
      await rm(root, { recursive: true, force: true });
    });
    async function actor({ mfa = true, method = 'phone', globalRole = 'customer' } = {}) {
      const id = randomUUID(),
        token = randomBytes(32).toString('hex'),
        phone = `+999${randomInt(0, 1e9).toString().padStart(9, '0')}`;
      userIds.push(id);
      phones.push(phone);
      await pool.query('INSERT INTO users(id,phone_e164) VALUES($1,$2)', [id, phone]);
      await pool.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [id, globalRole]);
      await pool.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method,mfa_verified_at) VALUES($1,$2,now()+interval '8 hours',$3,CASE WHEN $4 THEN now() ELSE NULL END)",
        [tokenHash(token), id, method, mfa],
      );
      return { id, token, phone };
    }
    type Actor = Awaited<ReturnType<typeof actor>>;
    async function request(
      user: Actor | undefined,
      method: InjectOptions['method'],
      url: string,
      payload?: unknown,
      server = app,
    ) {
      return server.inject({
        method,
        url,
        payload: payload as InjectOptions['payload'],
        remoteAddress: ip,
        headers: user ? { cookie: `hw_session=${user.token}` } : {},
      });
    }
    async function organization(owner: Actor, status = 'approved') {
      const id = randomUUID();
      orgIds.push(id);
      await pool.query(
        "INSERT INTO organizations(id,name,kind,registration_number,created_by,status) VALUES($1,'Synthetic Clinic','provider','TEST-ONLY',$2,$3)",
        [id, owner.id, status],
      );
      return id;
    }
    async function member(user: Actor, org: string, role = 'provider_staff') {
      const result = await pool.query(
        'INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id',
        [org, user.id, role],
      );
      return result.rows[0].id as string;
    }
    async function bill(owner: Actor, org: string | null = null, dependent: string | null = null) {
      const result = await pool.query(
        `INSERT INTO bills(customer_user_id,provider_organization_id,dependent_id,provider_name,currency,total_amount_minor,confirmed_fields) VALUES($1,$2,$3,'Synthetic clinic','LRD',5000,'{"diagnosis":"PRIVATE-EXAMPLE"}') RETURNING id`,
        [owner.id, org, dependent],
      );
      return result.rows[0].id as string;
    }
    async function document(owner: Actor, billId: string) {
      const response = await request(owner, 'POST', `/api/bills/${billId}/documents`, {
        contentType: 'text/plain',
        base64: Buffer.from('PRIVATE-SYNTHETIC-DOCUMENT').toString('base64'),
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json().documentId as string;
    }
    it('blocks unauthenticated requests and cross-customer reads, changes, lists, and downloads', async () => {
      const owner = await actor(),
        other = await actor();
      const id = await bill(owner);
      const doc = await document(owner, id);
      for (const path of [
        `/api/bills/${id}`,
        `/api/documents/${doc}/download`,
        `/api/customers/${owner.id}/bills`,
      ]) {
        expect((await request(undefined, 'GET', path)).statusCode).toBe(401);
        expect((await request(other, 'GET', path)).statusCode).toBe(404);
        expect((await request(owner, 'GET', path)).statusCode).toBe(200);
      }
      expect(
        (
          await request(other, 'PATCH', `/api/bills/${id}`, {
            providerName: 'Changed',
            totalAmountMinor: 1,
            currency: 'LRD',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await request(other, 'POST', '/api/bills', {
            customerUserId: owner.id,
            providerName: 'Changed',
            totalAmountMinor: 1,
            currency: 'LRD',
          })
        ).statusCode,
      ).toBe(404);
      expect((await request(owner, 'GET', `/api/bills/${id}`)).body).not.toContain('storage_key');
    });
    it('limits caregivers to exact subjects, explicit scopes, expiry and revocation', async () => {
      const owner = await actor(),
        caregiver = await actor();
      const dependent = (
        await request(owner, 'POST', '/api/dependents', {
          displayName: 'Synthetic child',
          relationship: 'guardian',
          guardianAttestation: true,
        })
      ).json().dependent.id;
      const childBill = await bill(owner, null, dependent),
        adultBill = await bill(owner);
      const doc = await document(owner, childBill);
      const response = await request(owner, 'POST', '/api/care-authorizations', {
        caregiverUserId: caregiver.id,
        dependentId: dependent,
        scopes: ['records:read'],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
      expect(response.statusCode, response.body).toBe(200);
      expect((await request(caregiver, 'GET', `/api/bills/${childBill}`)).statusCode).toBe(200);
      expect((await request(caregiver, 'GET', `/api/bills/${adultBill}`)).statusCode).toBe(404);
      expect((await request(caregiver, 'GET', `/api/documents/${doc}/download`)).statusCode).toBe(
        404,
      );
      const grant = await request(owner, 'POST', '/api/care-authorizations', {
        caregiverUserId: caregiver.id,
        dependentId: dependent,
        scopes: ['documents:read'],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
      expect((await request(caregiver, 'GET', `/api/documents/${doc}/download`)).body).toBe(
        'PRIVATE-SYNTHETIC-DOCUMENT',
      );
      await request(owner, 'DELETE', `/api/care-authorizations/${grant.json().id}`);
      expect((await request(caregiver, 'GET', `/api/documents/${doc}/download`)).statusCode).toBe(
        404,
      );
      await pool.query(
        "UPDATE care_authorizations SET expires_at=now()-interval '1 second' WHERE id=$1",
        [response.json().id],
      );
      expect((await request(caregiver, 'GET', `/api/bills/${childBill}`)).statusCode).toBe(404);
    });
    it('requires organization membership and recent MFA; global role claims do not grant organization access', async () => {
      const customer = await actor(),
        staff = await actor(),
        otherStaff = await actor(),
        noMfa = await actor({ mfa: false }),
        globalOnly = await actor({ globalRole: 'provider_staff' });
      const org = await organization(customer),
        other = await organization(otherStaff);
      await member(staff, org);
      await member(noMfa, org);
      await member(otherStaff, other);
      const id = await bill(customer, org),
        doc = await document(customer, id);
      for (const path of [
        `/api/bills/${id}`,
        `/api/documents/${doc}/download`,
        `/api/organizations/${org}/bills`,
      ]) {
        expect((await request(staff, 'GET', path)).statusCode).toBe(200);
        expect((await request(otherStaff, 'GET', path)).statusCode).toBe(404);
        expect((await request(globalOnly, 'GET', path)).statusCode).toBe(404);
        expect((await request(noMfa, 'GET', path)).statusCode).toBe(403);
      }
      await pool.query("UPDATE organization_memberships SET status='revoked' WHERE user_id=$1", [
        staff.id,
      ]);
      expect((await request(staff, 'GET', `/api/documents/${doc}/download`)).statusCode).toBe(404);
    });
    it('separates financial confirmation from beneficiary medical documents', async () => {
      const customer = await actor(),
        finance = await actor(),
        contributor = await actor({ globalRole: 'contributor' }),
        stranger = await actor();
      const org = await organization(customer);
      await member(finance, org, 'finance_operator');
      const id = await bill(customer, org),
        doc = await document(customer, id);
      const contribution = randomUUID();
      await pool.query(
        "INSERT INTO contributions(id,contributor_user_id,bill_id,amount_minor,currency,status,payment_reference,confirmed_at) VALUES($1,$2,$3,1000,'LRD','confirmed','TEST-PAYMENT',now())",
        [contribution, contributor.id, id],
      );
      const data = await request(contributor, 'GET', `/api/contributions/${contribution}`);
      expect(data.statusCode).toBe(200);
      expect(data.body).toContain('TEST-PAYMENT');
      expect(data.body).not.toContain('PRIVATE-EXAMPLE');
      expect(data.json().contribution).not.toHaveProperty('bill_id');
      expect(
        (await request(stranger, 'GET', `/api/contributions/${contribution}`)).statusCode,
      ).toBe(404);
      expect((await request(contributor, 'GET', `/api/documents/${doc}/download`)).statusCode).toBe(
        404,
      );
      const summary = await request(finance, 'GET', `/api/bills/${id}`);
      expect(summary.statusCode).toBe(200);
      expect(summary.body).not.toContain('PRIVATE-EXAMPLE');
      expect((await request(finance, 'GET', `/api/documents/${doc}/download`)).statusCode).toBe(
        404,
      );
    });
    it('does not grant privileges through registration, profile updates or onboarding', async () => {
      const user = await actor();
      expect(
        (
          await request(user, 'PATCH', '/api/customers/me', {
            displayName: 'Example',
            role: 'platform_admin',
          })
        ).statusCode,
      ).toBe(400);
      const submission = await request(user, 'POST', '/api/organizations', {
        name: 'Synthetic applicant',
        kind: 'provider',
        registrationNumber: 'TEST-REG',
      });
      expect(submission.statusCode, submission.body).toBe(200);
      const org = submission.json().organization.id;
      orgIds.push(org);
      expect(
        (await pool.query('SELECT * FROM organization_memberships WHERE organization_id=$1', [org]))
          .rowCount,
      ).toBe(0);
      expect(
        (
          await request(user, 'POST', `/api/organizations/${org}/invitations`, {
            phone: user.phone,
            role: 'organization_admin',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await request(user, 'POST', `/api/admin/organizations/${org}/reviews`, {
            status: 'approved',
            note: 'Self approval attempt',
          })
        ).statusCode,
      ).toBe(403);
    });
    it('binds invitations to phone, organization, issuer permissions, MFA, and one-time acceptance', async () => {
      const admin = await actor(),
        invitee = await actor(),
        stranger = await actor(),
        noMfa = await actor({ mfa: false });
      const org = await organization(admin);
      await member(admin, org, 'organization_admin');
      const invite = await request(admin, 'POST', `/api/organizations/${org}/invitations`, {
        phone: invitee.phone,
        role: 'provider_staff',
      });
      expect(invite.statusCode, invite.body).toBe(200);
      const payload = { token: invite.json().invitationToken };
      expect((await request(stranger, 'POST', '/api/invitations/accept', payload)).statusCode).toBe(
        404,
      );
      expect((await request(noMfa, 'POST', '/api/invitations/accept', payload)).statusCode).toBe(
        403,
      );
      expect((await request(invitee, 'POST', '/api/invitations/accept', payload)).statusCode).toBe(
        200,
      );
      expect((await request(invitee, 'POST', '/api/invitations/accept', payload)).statusCode).toBe(
        404,
      );
      const second = await request(admin, 'POST', `/api/organizations/${org}/invitations`, {
        phone: stranger.phone,
        role: 'provider_staff',
      });
      await pool.query("UPDATE organization_memberships SET status='revoked' WHERE user_id=$1", [
        admin.id,
      ]);
      expect(
        (
          await request(stranger, 'POST', '/api/invitations/accept', {
            token: second.json().invitationToken,
          })
        ).statusCode,
      ).toBe(404);
    });
    it('encrypts MFA enrollment, rejects replay and locks repeated attempts across sessions', async () => {
      const user = await actor({ mfa: false });
      const enrollment = await request(user, 'POST', '/api/security/mfa/enroll', {});
      expect(enrollment.statusCode, enrollment.body).toBe(200);
      const secret = enrollment.json().secret;
      const stored = await pool.query(
        'SELECT secret_encrypted FROM mfa_credentials WHERE user_id=$1',
        [user.id],
      );
      expect(stored.rows[0].secret_encrypted).not.toContain(secret);
      const code = totp(secret, Math.floor(Date.now() / 30000));
      expect((await request(user, 'POST', '/api/security/mfa/verify', { code })).statusCode).toBe(
        200,
      );
      expect((await request(user, 'POST', '/api/security/mfa/verify', { code })).statusCode).toBe(
        401,
      );
      for (let i = 0; i < 8; i++)
        await request(user, 'POST', '/api/security/mfa/verify', { code: 'bad' });
      expect((await request(user, 'POST', '/api/security/mfa/verify', { code })).statusCode).toBe(
        429,
      );
    });
    it('supports recovery with a new verified phone and a one-use code; revokes old sessions', async () => {
      const original = await actor(),
        fresh = await actor();
      const codes = await request(original, 'POST', '/api/security/recovery-codes', {});
      expect(codes.statusCode, codes.body).toBe(200);
      const recovered = await request(fresh, 'POST', '/api/security/recover', {
        oldPhone: original.phone,
        recoveryCode: codes.json().codes[0],
      });
      expect(recovered.statusCode, recovered.body).toBe(200);
      expect((await request(original, 'GET', '/api/customers/me')).statusCode).toBe(401);
      expect((await request(fresh, 'GET', '/api/customers/me')).statusCode).toBe(401);
      expect(
        (await pool.query('SELECT phone_e164 FROM users WHERE id=$1', [original.id])).rows[0]
          .phone_e164,
      ).toBe(fresh.phone);
      const other = await actor();
      expect(
        (
          await request(other, 'POST', '/api/security/recover', {
            oldPhone: fresh.phone,
            recoveryCode: codes.json().codes[0],
          })
        ).statusCode,
      ).toBe(401);
    });
    it('denies suspended, expired, revoked and production sandbox sessions', async () => {
      const user = await actor(),
        expired = await actor(),
        sandbox = await actor({ method: 'sandbox' });
      await pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [user.id]);
      expect((await request(user, 'GET', '/api/customers/me')).statusCode).toBe(401);
      await pool.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [expired.id],
      );
      expect((await request(expired, 'GET', '/api/customers/me')).statusCode).toBe(401);
      expect(
        (await request(sandbox, 'GET', '/api/customers/me', undefined, production)).statusCode,
      ).toBe(401);
      expect(
        (
          await request(
            undefined,
            'POST',
            '/api/auth/request-code',
            { phone: '+999111222333' },
            production,
          )
        ).statusCode,
      ).toBe(503);
      const active = await actor();
      expect((await request(active, 'POST', '/api/security/sessions/revoke', {})).statusCode).toBe(
        200,
      );
      expect((await request(active, 'GET', '/api/customers/me')).statusCode).toBe(401);
    });
    it('records independent verification reviews and revokes memberships immediately', async () => {
      const platform = await actor({ globalRole: 'platform_admin' }),
        owner = await actor(),
        staff = await actor();
      const org = await organization(owner, 'pending');
      const approved = await request(platform, 'POST', `/api/admin/organizations/${org}/reviews`, {
        status: 'approved',
        note: 'Synthetic evidence checked',
      });
      expect(approved.statusCode, approved.body).toBe(200);
      expect(
        (
          await pool.query(
            'SELECT role FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',
            [org, owner.id],
          )
        ).rows[0].role,
      ).toBe('organization_admin');
      const membership = await member(staff, org);
      const changed = await request(
        owner,
        'PATCH',
        `/api/organizations/${org}/members/${membership}`,
        { status: 'revoked' },
      );
      expect(changed.statusCode, changed.body).toBe(200);
      expect((await request(staff, 'GET', `/api/organizations/${org}/bills`)).statusCode).toBe(401);
      const verified = await request(platform, 'POST', `/api/admin/users/${owner.id}/reviews`, {
        status: 'verified',
        note: 'Synthetic customer review',
      });
      expect(verified.statusCode, verified.body).toBe(200);
      expect((await request(owner, 'GET', '/api/customers/me')).json().reviews).toHaveLength(1);
    });
    it('protects platform role management and organization suspension', async () => {
      const admin = await actor({ globalRole: 'platform_admin' }),
        customer = await actor(),
        staff = await actor();
      expect(
        (
          await request(customer, 'POST', `/api/admin/users/${staff.id}/roles`, {
            role: 'platform_admin',
            action: 'grant',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await request(admin, 'POST', `/api/admin/users/${staff.id}/roles`, {
            role: 'platform_admin',
            action: 'grant',
          })
        ).statusCode,
      ).toBe(403);
      const enrollment = await request(staff, 'POST', '/api/security/mfa/enroll', {});
      const code = totp(enrollment.json().secret, Math.floor(Date.now() / 30000));
      expect((await request(staff, 'POST', '/api/security/mfa/verify', { code })).statusCode).toBe(
        200,
      );
      expect(
        (
          await request(admin, 'POST', `/api/admin/users/${staff.id}/roles`, {
            role: 'platform_admin',
            action: 'grant',
          })
        ).statusCode,
      ).toBe(200);
      expect((await request(staff, 'GET', '/api/customers/me')).statusCode).toBe(401);
      expect(
        (
          await pool.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role='platform_admin'", [
            staff.id,
          ])
        ).rowCount,
      ).toBe(1);
      const org = await organization(customer);
      await member(customer, org, 'organization_admin');
      const response = await request(admin, 'POST', `/api/admin/organizations/${org}/reviews`, {
        status: 'suspended',
        note: 'Synthetic suspension review',
      });
      expect(response.statusCode, response.body).toBe(200);
      expect((await request(customer, 'GET', `/api/organizations/${org}/members`)).statusCode).toBe(
        401,
      );
    });
    it('mints expiring actor-bound download links, rejects tampering, and blocks purged documents', async () => {
      const owner = await actor(),
        other = await actor();
      const id = await bill(owner);
      const doc = await document(owner, id);
      const link = await request(owner, 'POST', `/api/documents/${doc}/download-link`, {});
      expect(link.statusCode, link.body).toBe(200);
      const { token, expiresAt, url } = link.json();
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(url).toContain(`/api/documents/${doc}/download?token=`);
      const viaLink = await request(owner, 'GET', `/api/documents/${doc}/download?token=${token}`);
      expect(viaLink.statusCode, viaLink.body).toBe(200);
      expect(viaLink.body).toBe('PRIVATE-SYNTHETIC-DOCUMENT');
      // A leaked link cannot be replayed by another account.
      expect(
        (await request(other, 'GET', `/api/documents/${doc}/download?token=${token}`)).statusCode,
      ).toBe(404);
      // A tampered/expired token is rejected for the rightful owner.
      expect(
        (await request(owner, 'GET', `/api/documents/${doc}/download?token=deadbeef.0.0`))
          .statusCode,
      ).toBe(403);
      await pool.query('UPDATE bill_documents SET purged_at=now() WHERE id=$1', [doc]);
      expect((await request(owner, 'GET', `/api/documents/${doc}/download`)).statusCode).toBe(410);
    });
    it('enforces runtime kill switches and protects them from non-admins', async () => {
      const admin = await actor({ globalRole: 'platform_admin' }),
        owner = await actor();
      const id = await bill(owner);
      await document(owner, id);
      const listed = await request(admin, 'GET', '/api/admin/flags');
      expect(listed.statusCode, listed.body).toBe(200);
      expect(
        listed.json().flags.find((f: { key: string }) => f.key === 'ai_extraction').enabled,
      ).toBe(true);
      expect(
        (
          await request(owner, 'PUT', '/api/admin/flags/ai_extraction', {
            enabled: false,
            reason: 'Synthetic incident drill',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await request(admin, 'PUT', '/api/admin/flags/ai_extraction', {
            enabled: false,
            reason: 'Synthetic incident drill',
          })
        ).statusCode,
      ).toBe(200);
      expect((await request(owner, 'POST', `/api/bills/${id}/extract`, {})).statusCode).toBe(503);
      expect(
        (
          await request(admin, 'PUT', '/api/admin/flags/ai_extraction', {
            enabled: true,
            reason: 'Drill complete',
          })
        ).statusCode,
      ).toBe(200);
      expect((await request(owner, 'POST', `/api/bills/${id}/extract`, {})).statusCode).toBe(200);
    });
    it('exports only the caller data and processes deletion while retaining financial records', async () => {
      const owner = await actor(),
        admin = await actor({ globalRole: 'platform_admin' }),
        other = await actor();
      const id = await bill(owner);
      await document(owner, id);
      const exported = await request(owner, 'GET', '/api/account/export');
      expect(exported.statusCode, exported.body).toBe(200);
      const body = exported.json();
      expect(body.profile.id).toBe(owner.id);
      expect(body.bills.map((b: { id: string }) => b.id)).toContain(id);
      expect(JSON.stringify(body)).not.toContain('token_hash');
      expect(JSON.stringify(body)).not.toContain('storage_key');
      expect(body.documents[0]).not.toHaveProperty('storage_key');
      expect((await request(other, 'GET', '/api/account/export')).json().bills).toHaveLength(0);
      const requested = await request(owner, 'POST', '/api/account/deletion', {
        reason: 'Synthetic deletion request',
      });
      expect(requested.statusCode, requested.body).toBe(200);
      const requestId = requested.json().id;
      expect(
        (await request(owner, 'POST', `/api/admin/account-deletions/${requestId}/process`, {}))
          .statusCode,
      ).toBe(403);
      expect(
        (await request(admin, 'POST', `/api/admin/account-deletions/${requestId}/process`, {}))
          .statusCode,
      ).toBe(200);
      expect((await request(owner, 'GET', '/api/customers/me')).statusCode).toBe(401);
      const user = (await pool.query('SELECT anonymized_at FROM users WHERE id=$1', [owner.id]))
        .rows[0];
      expect(user.anonymized_at).not.toBeNull();
      expect((await pool.query('SELECT 1 FROM bills WHERE id=$1', [id])).rowCount).toBe(1);
    });
    it('resolves disputes and reports payment incidents and fraud escalations to platform admins', async () => {
      const admin = await actor({ globalRole: 'platform_admin' }),
        owner = await actor();
      const org = await organization(owner);
      await pool.query(
        "INSERT INTO providers(organization_id,legal_name,license_number) VALUES($1,'Synthetic Clinic','LIC-1')",
        [org],
      );
      const id = await bill(owner, org);
      const opened = await request(owner, 'POST', `/api/care/bills/${id}/disputes`, {
        key: randomUUID(),
        reason: 'Synthetic dispute reason',
      });
      expect(opened.statusCode, opened.body).toBe(200);
      const disputeId = opened.json().id;
      expect(
        (
          await request(owner, 'POST', `/api/admin/disputes/${disputeId}/resolve`, {
            status: 'resolved',
            resolution: 'Reviewed and closed as synthetic',
          })
        ).statusCode,
      ).toBe(403);
      const resolved = await request(admin, 'POST', `/api/admin/disputes/${disputeId}/resolve`, {
        status: 'resolved',
        resolution: 'Reviewed and closed as synthetic',
      });
      expect(resolved.statusCode, resolved.body).toBe(200);
      const incidents = await request(admin, 'GET', '/api/admin/payment-incidents');
      expect(incidents.statusCode, incidents.body).toBe(200);
      expect(incidents.json().counts).toBeDefined();
      expect((await request(owner, 'GET', '/api/admin/payment-incidents')).statusCode).toBe(403);
      const escalated = await request(admin, 'POST', `/api/admin/bills/${id}/fraud-escalation`, {
        reason: 'Synthetic fraud escalation',
        suspendProvider: true,
      });
      expect(escalated.statusCode, escalated.body).toBe(200);
      expect(escalated.json().providerSuspended).toBe(true);
      expect(
        (await pool.query('SELECT status FROM providers WHERE organization_id=$1', [org])).rows[0]
          .status,
      ).toBe('suspended');
    });
  },
);

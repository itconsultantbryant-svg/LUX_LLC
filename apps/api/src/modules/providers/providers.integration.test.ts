import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from '../../build-app.js';
import { createDb } from '../../db/client.js';
import { createAdapters } from '../../adapters/index.js';
import { loadEnv } from '../../config/env.js';
import { tokenHash } from '../identity/service.js';
import { browserSmoke } from './browser-smoke.js';
import { LedgerService } from '../ledger/service.js';
describe.skipIf(process.env.PROVIDER_DATABASE_TESTS !== '1')(
  'provider portal and invoice authorization',
  () => {
    let pool: pg.Pool, admin: pg.Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const schema = `provider_test_${randomUUID().replaceAll('-', '')}`,
      storage = `/tmp/${schema}`;
    type Actor = { id: string; cookie: string };
    let customer: Actor, manager: Actor, staff: Actor, verifier: Actor, outsider: Actor;
    let org: string, pid: string;
    let requests = 0;
    const invoice = () => ({
      reference: `TEST-${randomUUID()}`,
      issueDate: '2026-10-11',
      currency: 'LRD',
      category: 'general',
      items: [
        { description: 'Consultation', quantity: 3, unitMinor: '101' },
        { description: 'Medication', quantity: 2, unitMinor: '99' },
      ],
      requiresDocuments: true,
      confirmationKind: 'invoice',
    });
    async function actor(role = 'customer', mfa = true): Promise<Actor> {
      const id = randomUUID(),
        token = randomBytes(32).toString('hex');
      await pool.query('INSERT INTO users(id,phone_e164) VALUES($1,$2)', [
        id,
        `+999${String(++requests).padStart(9, '0')}`,
      ]);
      await pool.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [id, role]);
      await pool.query(
        "INSERT INTO auth_sessions(user_id,token_hash,auth_method,expires_at,mfa_verified_at) VALUES($1,$2,'phone',now()+interval '1 hour',CASE WHEN $3 THEN now() ELSE NULL END)",
        [id, tokenHash(token), mfa],
      );
      return { id, cookie: `hw_session=${token}` };
    }
    async function post(path: string, body: unknown, user: Actor = manager) {
      if (process.env.PROVIDER_TEST_TRACE) console.log('POST', path);
      return app.inject({
        method: 'POST',
        url: path,
        headers: { cookie: user.cookie },
        remoteAddress: `127.0.0.${(++requests % 200) + 1}`,
        payload: body as Record<string, unknown>,
      });
    }
    async function get(path: string, user: Actor = manager) {
      if (process.env.PROVIDER_TEST_TRACE) console.log('GET', path);
      return app.inject({ url: path, headers: { cookie: user.cookie } });
    }
    async function verify(status = 'verified') {
      const r = await post(
        `/api/admin/providers/${pid}/reviews`,
        {
          status,
          note: 'Independent registry and license checked',
          evidenceReference: 'TEST registry evidence reference',
          validDays: 90,
        },
        verifier,
      );
      expect(r.statusCode, r.body).toBe(200);
    }
    async function createBill() {
      await verify();
      const association = await post('/api/care/association', { providerId: pid }, customer);
      expect(association.statusCode, association.body).toBe(200);
      const body = {
        key: randomUUID(),
        providerId: pid,
        associationToken: association.json().token,
        invoice: invoice(),
      };
      const r = await post('/api/provider/bills', body);
      expect(r.statusCode, r.body).toBe(200);
      return { id: r.json().billId, body };
    }
    async function confirm(id: string, revision = 1) {
      const upload = await post(`/api/bills/${id}/documents`, {
        expectedRevision: revision,
        contentType: 'application/pdf',
        base64: Buffer.from('%PDF-1.4\nSYNTHETIC EVIDENCE\n').toString('base64'),
      });
      expect(upload.statusCode, upload.body).toBe(200);
      const r = await post(`/api/provider/bills/${id}/confirm`, {
        expectedRevision: revision,
        evidenceDocumentId: upload.json().documentId,
        note: 'Invoice checked against external signed evidence',
      });
      expect(r.statusCode, r.body).toBe(200);
      expect(
        (
          await post(
            `/api/care/bills/${id}/confirm`,
            { expectedRevision: revision, accepted: true },
            customer,
          )
        ).statusCode,
      ).toBe(200);
      return upload.json().documentId;
    }
    async function liveIntent(id: string) {
      return (
        await pool.query(
          "INSERT INTO payment_intents(bill_id,amount_minor,currency,status,adapter_mode,idempotency_key) SELECT id,total_amount_minor,currency,'awaiting_auth','live',$2 FROM bills WHERE id=$1 RETURNING id",
          [id, randomUUID()],
        )
      ).rows[0].id;
    }
    beforeAll(async () => {
      if (
        process.env.APP_ENV !== 'test' ||
        !new URL(process.env.DATABASE_URL ?? 'http://invalid').pathname.endsWith('_test')
      )
        throw Error('Use isolated test database');
      admin = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 15000,
      });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        connectionTimeoutMillis: 15000,
        query_timeout: 45000,
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
        STORAGE_LOCAL_ROOT: storage,
      });
      app = await buildApp({ env, pool, db: createDb(pool), adapters: createAdapters(env) });
      customer = await actor();
      manager = await actor();
      staff = await actor();
      verifier = await actor('platform_admin');
      outsider = await actor();
      org = randomUUID();
      await pool.query(
        "INSERT INTO organizations(id,name,kind,registration_number,created_by,status) VALUES($1,'SYNTHETIC provider','provider','TEST-ONLY',$2,'approved')",
        [org, manager.id],
      );
      await pool.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin'),($1,$3,'provider_staff')",
        [org, manager.id, staff.id],
      );
      const profile = await post('/api/provider/profiles', {
        organizationId: org,
        legalName: 'SYNTHETIC Care Clinic',
        licenseNumber: 'TEST-ONLY-LICENSE',
        address: { line: 'Fictional test address', phone: '+999700009001' },
      });
      expect(profile.statusCode, profile.body).toBe(200);
      pid = profile.json().provider.id;
    });
    afterAll(async () => {
      if (process.env.PROVIDER_TEST_TRACE) console.log('Closing provider test application');
      await app?.close();
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
      await rm(storage, { recursive: true, force: true });
    });
    it('requires independent authorized verification and excludes unverified providers', async () => {
      expect((await get('/api/providers/directory', customer)).json().providers).toHaveLength(0);
      expect(
        (
          await post(
            `/api/admin/providers/${pid}/reviews`,
            {
              status: 'verified',
              note: 'Claimed by AI',
              evidenceReference: 'AI guessed a license',
              validDays: 90,
            },
            staff,
          )
        ).statusCode,
      ).toBe(403);
      await expect(
        pool.query("UPDATE providers SET status='verified' WHERE id=$1", [pid]),
      ).rejects.toThrow();
      await verify();
      expect((await get('/api/providers/directory', customer)).json().providers[0].id).toBe(pid);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'platform_admin')", [
        manager.id,
      ]);
      expect(
        (
          await post(`/api/admin/providers/${pid}/reviews`, {
            status: 'verified',
            note: 'Self review attempt',
            evidenceReference: 'Registry reference self',
            validDays: 90,
          })
        ).statusCode,
      ).toBe(403);
      await pool.query("DELETE FROM user_roles WHERE user_id=$1 AND role='platform_admin'", [
        manager.id,
      ]);
    });
    it('associates the exact customer once, calculates total and blocks cross-organization access', async () => {
      const b = await createBill();
      const replay = await post('/api/provider/bills', b.body);
      expect(replay.json().billId).toBe(b.id);
      const detail = (await get(`/api/care/bills/${b.id}`, customer)).json();
      expect(detail.bill.customer_user_id).toBe(customer.id);
      expect(detail.revisions[0].total_minor).toBe('501');
      expect((await post('/api/provider/bills', { ...b.body, key: randomUUID() })).statusCode).toBe(
        409,
      );
      expect((await get(`/api/care/bills/${b.id}`, outsider)).statusCode).toBe(404);
      expect((await get(`/api/provider/profiles/${pid}/bills`, outsider)).statusCode).toBe(404);
      expect(
        (
          await post(
            '/api/provider/profiles',
            {
              organizationId: org,
              legalName: 'Hijack',
              licenseNumber: 'WRONG',
              address: { line: 'wrong address', phone: '+999700009002' },
            },
            staff,
          )
        ).statusCode,
      ).toBe(404);
    });
    it('requires evidence and fresh customer review; amendments preserve earlier versions and documents', async () => {
      const b = await createBill();
      await expect(liveIntent(b.id)).rejects.toThrow();
      const documentId = await confirm(b.id);
      expect((await get(`/api/documents/${documentId}/download`, outsider)).statusCode).toBe(404);
      const amendment = await post(`/api/provider/bills/${b.id}/amend`, {
        key: randomUUID(),
        expectedRevision: 1,
        reason: 'Corrected medication quantity',
        invoice: {
          ...b.body.invoice,
          items: [{ description: 'Corrected care', quantity: 2, unitMinor: '300' }],
        },
      });
      expect(amendment.statusCode, amendment.body).toBe(200);
      const detail = (await get(`/api/care/bills/${b.id}`, customer)).json();
      expect(detail.revisions.map((r: { total_minor: string }) => r.total_minor)).toEqual([
        '600',
        '501',
      ]);
      expect(detail.documents[0].revision_number).toBe(1);
      expect(detail.changes.length).toBeGreaterThan(0);
      expect(
        (
          await post(
            `/api/care/bills/${b.id}/confirm`,
            { expectedRevision: 1, accepted: true },
            customer,
          )
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await post(`/api/bills/${b.id}/documents`, {
            expectedRevision: 1,
            contentType: 'application/pdf',
            base64: 'JVBERg==',
          })
        ).statusCode,
      ).toBe(409);
      await expect(liveIntent(b.id)).rejects.toThrow();
      await expect(
        pool.query('UPDATE bill_revisions SET total_minor=1 WHERE bill_id=$1', [b.id]),
      ).rejects.toThrow();
      await confirm(b.id, 2);
      expect(await liveIntent(b.id)).toBeTypeOf('string');
      expect(
        (
          await post(`/api/provider/bills/${b.id}/amend`, {
            key: randomUUID(),
            expectedRevision: 2,
            reason: 'Must not replace paid version',
            invoice: b.body.invoice,
          })
        ).statusCode,
      ).toBe(409);
    });
    it('blocks unverified live payment creation and capture after a provider suspension', async () => {
      const b = await createBill();
      await confirm(b.id);
      const intent = await liveIntent(b.id);
      const ledger = new LedgerService(pool);
      const wallet = (
        await pool.query(
          "INSERT INTO wallets(owner_user_id,currency) VALUES($1,'LRD') RETURNING id",
          [customer.id],
        )
      ).rows[0];
      const allocation = (
        await pool.query(
          "INSERT INTO funding_allocations(wallet_id,beneficiary_user_id,source,currency) VALUES($1,$2,'personal_savings','LRD') RETURNING id",
          [wallet.id, customer.id],
        )
      ).rows[0];
      for (const bucket of ['available', 'pending', 'restricted', 'reserved'])
        await pool.query(
          "INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) VALUES($1,'LRD',$2,$3,'liability','credit')",
          [`${allocation.id}:${bucket}`, allocation.id, bucket],
        );
      await ledger.credit(randomUUID(), {
        allocationId: allocation.id,
        amountMinor: '1000',
        currency: 'LRD',
        bucket: 'available',
        mode: 'sandbox',
      });
      await ledger.reserve(randomUUID(), {
        allocationId: allocation.id,
        paymentIntentId: intent,
        amountMinor: '501',
      });
      await verify('suspended');
      await expect(liveIntent(b.id)).rejects.toThrow();
      await expect(ledger.capture(randomUUID(), { paymentIntentId: intent })).rejects.toThrow();
      expect((await get('/api/providers/directory', customer)).json().providers).toHaveLength(0);
    });
    it('submits disputes and corrections without overwriting payment history', async () => {
      const b = await createBill();
      await confirm(b.id);
      const intent = await liveIntent(b.id);
      const correction = await post(
        `/api/care/bills/${b.id}/corrections`,
        {
          key: randomUUID(),
          expectedRevision: 1,
          reason: 'Incorrect quantity needs review',
          items: [{ description: 'Corrected care', quantity: 1, unitMinor: '100' }],
        },
        customer,
      );
      expect(correction.statusCode, correction.body).toBe(200);
      expect(
        (
          await post(`/api/care/bills/${b.id}/disputes`, {
            key: randomUUID(),
            reason: 'Payment amount disputed by provider',
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await pool.query('SELECT amount_minor FROM payment_intents WHERE id=$1', [intent])).rows[0]
          .amount_minor,
      ).toBe(501);
      await expect(pool.query('SELECT assert_provider_payable($1)', [b.id])).rejects.toThrow();
    });
    it('accepts customer intake and serializes competing amendments without losing history', async () => {
      await verify();
      const body = {
        key: randomUUID(),
        providerId: pid,
        invoice: { ...invoice(), confirmationKind: 'service' },
      };
      const intake = await post('/api/care/intake', body, customer);
      expect(intake.statusCode, intake.body).toBe(200);
      const id = intake.json().billId;
      expect((await post('/api/care/intake', body, customer)).json().billId).toBe(id);
      const results = await Promise.all(
        ['200', '300'].map((unitMinor) =>
          post(`/api/provider/bills/${id}/amend`, {
            key: randomUUID(),
            expectedRevision: 1,
            reason: 'Corrected item after external review',
            invoice: {
              ...body.invoice,
              items: [{ description: 'Reviewed service', quantity: 1, unitMinor }],
            },
          }),
        ),
      );
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      const detail = (await get(`/api/care/bills/${id}`, customer)).json();
      expect(detail.revisions).toHaveLength(2);
      expect(detail.revisions[1].total_minor).toBe('501');
      await confirm(id, 2);
      expect(await liveIntent(id)).toBeTypeOf('string');
    });
    it.skipIf(process.env.PROVIDER_BROWSER_TESTS !== '1')(
      'renders provider and customer layouts on small and large screens',
      async () => {
        await verify();
        await browserSmoke(app, manager.cookie, customer.cookie);
      },
      300000,
    );
    it('uses MFA and current staff membership and prevents direct legacy amendments of versioned bills', async () => {
      const b = await createBill();
      await pool.query('UPDATE auth_sessions SET mfa_verified_at=NULL WHERE user_id=$1', [
        staff.id,
      ]);
      expect((await get(`/api/care/bills/${b.id}`, staff)).statusCode).toBe(403);
      await pool.query('UPDATE auth_sessions SET mfa_verified_at=now() WHERE user_id=$1', [
        staff.id,
      ]);
      await pool.query("UPDATE organization_memberships SET status='revoked' WHERE user_id=$1", [
        staff.id,
      ]);
      expect((await get(`/api/care/bills/${b.id}`, staff)).statusCode).toBe(404);
      const r = await app.inject({
        method: 'PATCH',
        url: `/api/bills/${b.id}`,
        headers: { cookie: customer.cookie },
        payload: { providerName: 'Spoof', totalAmountMinor: 1, currency: 'LRD' },
      });
      expect(r.statusCode).toBe(409);
      await expect(
        pool.query('UPDATE bills SET total_amount_minor=1 WHERE id=$1', [b.id]),
      ).rejects.toThrow();
    });
  },
);

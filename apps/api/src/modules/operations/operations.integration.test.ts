import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';
import { createAdapters } from '../../adapters/index.js';
import { loadEnv } from '../../config/env.js';
import { tokenHash } from '../identity/service.js';
import { LedgerService } from '../ledger/service.js';
import { seedCore, seedId } from '../ledger/seed.js';

describe.skipIf(process.env.OPERATIONS_DATABASE_TESTS !== '1')(
  'operations: extraction, review, programs, metrics and reconciliation',
  () => {
    let pool: pg.Pool, admin: pg.Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const schema = `operations_test_${randomUUID().replaceAll('-', '')}`;
    let customerCookie: string, platformCookie: string, platformNoMfaCookie: string;
    let storageRoot: string;

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
        query_timeout: 45000,
      });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 12,
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
      await seedCore(new LedgerService(pool), 'test');
      storageRoot = await mkdtemp(path.join(tmpdir(), 'ops-storage-'));
      const env = loadEnv({
        ...process.env,
        STORAGE_ADAPTER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        LOG_LEVEL: 'error',
      });
      app = await buildApp({ env, pool, db: createDb(pool), adapters: createAdapters(env) });

      async function session(user: string, mfa: boolean): Promise<string> {
        const token = randomBytes(32).toString('hex');
        await pool.query(
          "INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method,mfa_verified_at) VALUES($1,$2,now()+interval '8 hours', 'sandbox', CASE WHEN $3 THEN now() ELSE NULL END)",
          [tokenHash(token), user, mfa],
        );
        return `hw_session=${token}`;
      }
      customerCookie = await session(seedId('customer'), true);
      const platformUser = randomUUID();
      await pool.query(
        `INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Ops Platform Admin')`,
        [platformUser, `+99971000009`],
      );
      await pool.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [
        platformUser,
        'platform_admin',
      ]);
      platformCookie = await session(platformUser, true);
      const platformNoMfa = randomUUID();
      await pool.query(
        `INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Ops Platform No MFA')`,
        [platformNoMfa, `+99971000010`],
      );
      await pool.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [
        platformNoMfa,
        'platform_admin',
      ]);
      platformNoMfaCookie = await session(platformNoMfa, false);
    });

    afterAll(async () => {
      await app?.close();
      await pool?.end();
      if (admin) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin?.end();
      if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    });

    let requestNumber = 0;
    async function call(
      method: 'GET' | 'POST' | 'PATCH',
      path: string,
      body: unknown,
      cookie: string,
    ) {
      return app.inject({
        method,
        url: path,
        headers: { cookie },
        remoteAddress: `127.0.0.${(++requestNumber % 200) + 1}`,
        payload: body as Record<string, unknown> | undefined,
      });
    }

    it('discloses the public sandbox fee schedule without a session', async () => {
      const r = await call('GET', '/api/fees', undefined, '');
      expect(r.statusCode, r.body).toBe(200);
      const fees = r.json();
      expect(fees.status).toBe('sandbox');
      expect(fees.lines.every((line: { amountMinor: string }) => line.amountMinor === '0')).toBe(
        true,
      );
    });

    async function billWithDocument(text: string, key: string, contentType = 'text/plain') {
      const bill = (
        await pool.query(
          `INSERT INTO bills(customer_user_id,provider_name,currency,total_amount_minor,category) VALUES($1,'Demo Clinic Monrovia (simulated)','LRD',4000,'outpatient') RETURNING id`,
          [seedId('customer')],
        )
      ).rows[0];
      await app.ctx.adapters.storage.putObject({
        key,
        bytes: Buffer.from(text, 'utf8'),
        contentType,
      });
      await pool.query(
        `INSERT INTO bill_documents(bill_id,storage_key,content_type,byte_size) VALUES($1,$2,$3,$4)`,
        [bill.id, key, contentType, Buffer.byteLength(text)],
      );
      return bill.id as string;
    }

    it('extracts structured fields from a readable document', async () => {
      const billId = await billWithDocument(
        [
          'Demo Clinic Monrovia (simulated)',
          'Invoice No: OPS-1',
          'Patient: Ops Customer',
          'Date: 2026-09-01',
          'Consultation 2 x 20.00 = 40.00',
          'Total 40.00 LRD',
        ].join('\n'),
        'demo/ops-extract-test.txt',
      );
      const r = await call('POST', `/api/bills/${billId}/extract`, {}, customerCookie);
      expect(r.statusCode, r.body).toBe(200);
      const body = r.json() as { status: string; requiresReview: boolean };
      expect(body.status).toBe('extracted');
      expect(body.requiresReview).toBe(false);
      const run = (
        await pool.query<{
          status: string;
          mode: string;
          output: { fields: { providerName: string } };
        }>('SELECT status, mode, output FROM ai_runs WHERE bill_id = $1', [billId])
      ).rows[0];
      expect(run).toMatchObject({ status: 'completed', mode: 'sandbox' });
      expect(run.output.fields.providerName).toContain('Clinic');
    });

    it('routes an unreadable document to assistance without fabricating values', async () => {
      const bill = (
        await pool.query(
          `INSERT INTO bills(customer_user_id,provider_name,currency,total_amount_minor,category) VALUES($1,'Demo Clinic Monrovia (simulated)','LRD',4000,'outpatient') RETURNING id`,
          [seedId('customer')],
        )
      ).rows[0];
      await app.ctx.adapters.storage.putObject({
        key: 'demo/ops-unreadable.txt',
        bytes: Buffer.from([0x00, 0x01, 0xff, 0x00]),
        contentType: 'text/plain',
      });
      await pool.query(
        `INSERT INTO bill_documents(bill_id,storage_key,content_type,byte_size) VALUES($1,'demo/ops-unreadable.txt','text/plain',4)`,
        [bill.id],
      );
      const r = await call('POST', `/api/bills/${bill.id}/extract`, {}, customerCookie);
      expect(r.statusCode, r.body).toBe(200);
      const body = r.json() as { status: string; findings: Array<{ code: string }> };
      expect(body.status).toBe('needs_review');
      expect(body.findings.map((f) => f.code)).toContain('UNREADABLE_DOCUMENT');
      const run = (
        await pool.query<{ output: { unreadable: boolean; fields: { providerName: null } } }>(
          'SELECT output FROM ai_runs WHERE bill_id = $1',
          [bill.id],
        )
      ).rows[0];
      expect(run.output.unreadable).toBe(true);
      expect(run.output.fields.providerName).toBeNull();
      const open = (
        await pool.query("SELECT id FROM review_cases WHERE bill_id = $1 AND status = 'open'", [
          bill.id,
        ])
      ).rowCount;
      expect(open).toBeGreaterThan(0);
    });

    it('preserves customer corrections and gates payment on review', async () => {
      const bill = (
        await pool.query(
          `INSERT INTO bills(customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category) VALUES($1,$2,'Demo Clinic Monrovia (simulated)','LRD',4000,'outpatient') RETURNING id`,
          [seedId('customer'), seedId('clinic')],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_revisions(bill_id,revision,reference,issue_date,provider_id,provider_name,customer_user_id,currency,items,total_minor,requires_documents,confirmation_kind,author_user_id,reason)
         VALUES($1,1,'OPS-3','2026-09-01',$2,'Demo Clinic Monrovia (simulated)',$3,'LRD',$4,4000,false,'invoice',$3,'test revision')`,
        [
          bill.id,
          seedId('provider'),
          seedId('customer'),
          JSON.stringify([{ description: 'Consultation', quantity: 2, unitMinor: '2000' }]),
        ],
      );
      await app.ctx.adapters.storage.putObject({
        key: 'demo/ops-ambiguous.txt',
        bytes: Buffer.from(
          'Demo Clinic Monrovia (simulated)\nInvoice No: OPS-3\nPatient: Ops Customer\nDate: 2026-09-01\nTotal 40.00 LRD\nGrand Total 45.00 LRD',
          'utf8',
        ),
        contentType: 'text/plain',
      });
      await pool.query(
        `INSERT INTO bill_documents(bill_id,storage_key,content_type,byte_size,revision_number) VALUES($1,'demo/ops-ambiguous.txt','text/plain',120,1)`,
        [bill.id],
      );
      const extract = await call('POST', `/api/bills/${bill.id}/extract`, {}, customerCookie);
      expect(extract.statusCode, extract.body).toBe(200);
      expect((extract.json() as { requiresReview: boolean }).requiresReview).toBe(true);

      const blocked = await call(
        'POST',
        `/api/care/bills/${bill.id}/payment-request`,
        { key: randomUUID(), expectedRevision: 1 },
        customerCookie,
      );
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().message).toContain('extracted bill fields');

      const review = await call(
        'POST',
        `/api/care/bills/${bill.id}/extraction-review`,
        {
          key: randomUUID(),
          corrections: [
            { field: 'totalAmountMinor', value: 4000, note: 'Trusted the printed total' },
          ],
        },
        customerCookie,
      );
      expect(review.statusCode, review.body).toBe(200);
      const reviewed = (
        await pool.query<{ extraction_reviewed_at: string | null }>(
          'SELECT extraction_reviewed_at FROM bills WHERE id = $1',
          [bill.id],
        )
      ).rows[0];
      expect(reviewed.extraction_reviewed_at).not.toBeNull();
      const correction = (
        await pool.query<{ field: string; original_value: number; corrected_value: number }>(
          'SELECT field, original_value, corrected_value FROM extraction_corrections WHERE bill_id = $1',
          [bill.id],
        )
      ).rows[0];
      expect(correction.field).toBe('totalAmountMinor');
      expect(Number(correction.original_value)).toBe(4500);
      expect(Number(correction.corrected_value)).toBe(4000);
    });

    it('fails closed when a bill has no document to extract', async () => {
      const bill = (
        await pool.query(
          `INSERT INTO bills(customer_user_id,provider_name,currency,total_amount_minor,category) VALUES($1,'Demo Clinic Monrovia (simulated)','LRD',4000,'outpatient') RETURNING id`,
          [seedId('customer')],
        )
      ).rows[0];
      const r = await call('POST', `/api/bills/${bill.id}/extract`, {}, customerCookie);
      expect(r.statusCode).toBe(400);
      const extracted = (await pool.query('SELECT status FROM bills WHERE id = $1', [bill.id]))
        .rows[0];
      expect(extracted.status).toBe('draft');
    });

    it('requires MFA for platform operations', async () => {
      const r = await call('GET', '/api/admin/metrics', undefined, platformNoMfaCookie);
      expect(r.statusCode).toBe(403);
    });

    it('lists, resolves a review case and validates the bill', async () => {
      const list = await call('GET', '/api/admin/reviews', undefined, platformCookie);
      expect(list.statusCode, list.body).toBe(200);
      const cases = (list.json() as { cases: Array<{ id: string; bill_id: string }> }).cases;
      expect(cases.length).toBeGreaterThan(0);
      const seeded = cases.find((c) => c.bill_id === seedId('bill'));
      expect(seeded).toBeTruthy();
      const resolved = await call(
        'POST',
        `/api/admin/reviews/${seeded!.id}/approve`,
        { note: 'accepts aligned extraction for test' },
        platformCookie,
      );
      expect(resolved.statusCode, resolved.body).toBe(200);
      const bill = (await pool.query('SELECT status FROM bills WHERE id = $1', [seedId('bill')]))
        .rows[0];
      expect(bill.status).toBe('validated');
    });

    it('creates, activates and funds a sponsor program with a voucher', async () => {
      const created = await call(
        'POST',
        '/api/programs',
        {
          organizationId: seedId('sponsor'),
          name: 'Ops Voucher Program',
          currency: 'LRD',
          allowedCategories: ['medication'],
          allowedProviderIds: [],
          maxPerPaymentMinor: '20000',
        },
        platformCookie,
      );
      expect(created.statusCode, created.body).toBe(200);
      const program = created.json() as { id: string; status: string };
      expect(program.status).toBe('draft');

      const activated = await call(
        'PATCH',
        `/api/programs/${program.id}`,
        { status: 'active' },
        platformCookie,
      );
      expect(activated.statusCode, activated.body).toBe(200);

      const before = (
        await pool.query(
          `SELECT COALESCE(sum(a.balance_minor),0)::text AS balance FROM ledger_accounts a JOIN funding_allocations f ON f.id=a.allocation_id WHERE f.beneficiary_user_id=$1 AND a.bucket='available' AND f.program_id=$2`,
          [seedId('customer'), program.id],
        )
      ).rows[0].balance as string;

      const beforeFirstSettlement = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM partner_settlements WHERE payment_intent_id IS NULL AND direction = $1',
          ['inbound'],
        )
      ).rows[0].count as number;

      const issued = await call(
        'POST',
        `/api/programs/${program.id}/vouchers`,
        { beneficiaryPhone: '+999700000001', amountMinor: '2500', expiresInDays: 90 },
        platformCookie,
      );
      expect(issued.statusCode, issued.body).toBe(200);
      const voucher = issued.json() as { voucherId: string; code: string; allocationId: string };
      expect(voucher.code).toMatch(/^[A-Za-z0-9_-]{32}$/);
      const voucherRow = (
        await pool.query('SELECT status, amount_minor FROM vouchers WHERE id = $1', [
          voucher.voucherId,
        ])
      ).rows[0];
      expect(voucherRow.status).toBe('issued');
      expect(String(voucherRow.amount_minor)).toBe('2500');
      const after = (
        await pool.query(
          `SELECT COALESCE(sum(a.balance_minor),0)::text AS balance FROM ledger_accounts a JOIN funding_allocations f ON f.id=a.allocation_id WHERE f.beneficiary_user_id=$1 AND a.bucket='available' AND f.program_id=$2`,
          [seedId('customer'), program.id],
        )
      ).rows[0].balance as string;
      expect(BigInt(after) - BigInt(before)).toBe(2500n);
      const settlementsAfter = (
        await pool.query(
          'SELECT COUNT(*)::int AS count FROM partner_settlements WHERE payment_intent_id IS NULL AND direction = $1',
          ['inbound'],
        )
      ).rows[0].count as number;
      expect(settlementsAfter).toBe(beforeFirstSettlement + 1);
      const voucherSettlement = (
        await pool.query(
          'SELECT status, adapter_mode, partner_reference FROM partner_settlements s WHERE s.journal_id IN (SELECT j.id FROM journal_entries j WHERE j.operation=$1) LIMIT 1',
          ['program_voucher_credit'],
        )
      ).rows[0];
      expect(voucherSettlement.status).toBe('expected');
      expect(voucherSettlement.adapter_mode).toBe('sandbox');
    });

    it('serves platform metrics computed from live tables', async () => {
      const r = await call('GET', '/api/admin/metrics', undefined, platformCookie);
      expect(r.statusCode, r.body).toBe(200);
      const m = r.json();
      expect(m.counts.bills.length).toBeGreaterThan(0);
      expect(m.ai.aiRuns).toBeDefined();
      expect(m.recentEvents).toBeDefined();
      expect(m.note).toContain('No live partner settlement is asserted');
    });

    it('runs reconciliation without fabricating settlement', async () => {
      const r = await call('POST', '/api/admin/reconcile', {}, platformCookie);
      expect(r.statusCode, r.body).toBe(200);
      const report = r.json();
      expect(typeof report.failedQuotes).toBe('number');
      expect(Array.isArray(report.settlementCounts)).toBe(true);
      expect(report.note).toContain('never fabricates confirmation');
    });
  },
);

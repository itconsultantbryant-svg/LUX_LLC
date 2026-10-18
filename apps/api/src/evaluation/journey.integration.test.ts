/**
 * End-to-end journey evaluation: real HTTP requests through the whole stack
 * (validation → payment authorization → signed callback → receipt) against an
 * isolated database. It produces `PaymentObservation`s and `TaskObservation`s
 * for the same report the evaluation suite renders, so payment reliability and
 * user task completion are measured on the shipping code paths, not a mock.
 *
 * Every journey states the outcome a person would expect; a journey that does
 * not reach that outcome counts as incomplete rather than being explained away.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from '../build-app.js';
import { createDb } from '../db/client.js';
import { createAdapters } from '../adapters/index.js';
import { loadEnv } from '../config/env.js';
import { tokenHash } from '../modules/identity/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import { seedCore, seedId } from '../modules/ledger/seed.js';
import { JOURNEY_DATASET_VERSION } from './dataset.js';
import { computeReport, type PaymentObservation, type TaskObservation } from './metrics.js';
import { renderJson, renderMarkdown } from './report.js';

describe.skipIf(process.env.JOURNEY_DATABASE_TESTS !== '1')(
  'journey: end-to-end payment and task outcomes over the real HTTP stack',
  () => {
    let pool: pg.Pool, admin: pg.Pool, app: Awaited<ReturnType<typeof buildApp>>;
    let ledger: LedgerService;
    const schema = `journey_test_${randomUUID().replaceAll('-', '')}`;
    let storageRoot: string;
    let staffId: string;
    let requestNumber = 0;
    let phoneCounter = 0;

    const payments: PaymentObservation[] = [];
    const tasks: TaskObservation[] = [];

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
        max: 10,
        connectionTimeoutMillis: 15000,
        query_timeout: 45000,
        options: `-c search_path=${schema}`,
      });
      const folder = new URL('../../drizzle/', import.meta.url);
      const history = JSON.parse(readFileSync(new URL('meta/_journal.json', folder), 'utf8'));
      for (const entry of history.entries)
        await pool.query(
          readFileSync(new URL(`${entry.tag}.sql`, folder), 'utf8').replaceAll(
            '"public".',
            `"${schema}".`,
          ),
        );
      ledger = new LedgerService(pool);
      await seedCore(ledger, 'test');
      storageRoot = await mkdtemp(path.join(tmpdir(), 'journey-storage-'));
      const env = loadEnv({
        ...process.env,
        STORAGE_ADAPTER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        LOG_LEVEL: 'error',
      });
      app = await buildApp({ env, pool, db: createDb(pool), adapters: createAdapters(env) });

      // Upgrade the seeded provider to an independent registry verification so
      // the payment path is exercised on a genuinely payable provider.
      const reviewer = randomUUID();
      await pool.query(
        "INSERT INTO users(id,phone_e164,display_name) VALUES($1,'+99981000099','Journey Reviewer')",
        [reviewer],
      );
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'platform_admin')", [
        reviewer,
      ]);
      await pool.query(
        `INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,method,evidence_reference,valid_until,verified_details)
          SELECT p.id,$1,'verified','journey registry check pass','registry_check','journey-registry-ref',now()+interval '1 year',
                 jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address)
          FROM providers p WHERE p.id=$2`,
        [reviewer, seedId('provider')],
      );
      staffId = randomUUID();
      await pool.query(
        "INSERT INTO users(id,phone_e164,display_name) VALUES($1,'+99981000100','Journey Staff')",
        [staffId],
      );
      await pool.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'provider_staff','active')",
        [seedId('clinic'), staffId],
      );
    });

    afterAll(async () => {
      await app?.close();
      await pool?.end();
      if (admin) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin?.end();
      if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    });

    async function call(method: 'GET' | 'POST', url: string, cookie: string, body?: unknown) {
      return app.inject({
        method,
        url,
        headers: { cookie },
        remoteAddress: `127.0.0.${(++requestNumber % 200) + 1}`,
        payload: body as Record<string, unknown> | undefined,
      });
    }

    async function session(user: string): Promise<string> {
      const token = randomBytes(32).toString('hex');
      await pool.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour','sandbox',now())",
        [tokenHash(token), user],
      );
      return `hw_session=${token}`;
    }

    async function makeCustomer(): Promise<{ userId: string; walletId: string; cookie: string }> {
      const userId = randomUUID();
      const walletId = randomUUID();
      phoneCounter += 1;
      await pool.query('INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,$3)', [
        userId,
        `+99982${String(phoneCounter).padStart(6, '0')}`,
        'Journey Customer',
      ]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'customer')", [userId]);
      await pool.query(
        "INSERT INTO customer_profiles(user_id,display_name) VALUES($1,'Journey Customer')",
        [userId],
      );
      await pool.query("INSERT INTO wallets(id,owner_user_id,currency) VALUES($1,$2,'LRD')", [
        walletId,
        userId,
      ]);
      await pool.query(
        "INSERT INTO consents(user_id,consent_type,granted,version) VALUES($1,'health_data',true,'journey-v1')",
        [userId],
      );
      return { userId, walletId, cookie: await session(userId) };
    }

    async function addAllocation(
      userId: string,
      walletId: string,
      amountMinor: string,
      source = 'personal_savings',
      allowedCategories: string[] = [],
    ): Promise<string> {
      const allocationId = randomUUID();
      await pool.query(
        `INSERT INTO funding_allocations(id,wallet_id,source,currency,beneficiary_user_id,allowed_categories,expires_at)
         VALUES($1,$2,$3,'LRD',$4,$5,now()+interval '1 year')`,
        [allocationId, walletId, source, userId, allowedCategories],
      );
      await pool.query(
        `INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) SELECT $1||':'||bucket,'LRD',$1::uuid,bucket,'liability','credit' FROM unnest(ARRAY['available','reserved','pending','restricted']) bucket`,
        [allocationId],
      );
      if (amountMinor !== '0') {
        const c = await pool.connect();
        try {
          const debit = await ledger.clearing(c, 'LRD', 'receivable');
          const account = await ledger.account(c, allocationId, 'available');
          await ledger.postInTransaction(c, `journey:credit:${allocationId}`, {
            currency: 'LRD',
            operation: 'funding_credit',
            description: 'journey allocation credit',
            lines: [
              { accountId: debit, side: 'debit', amountMinor },
              { accountId: account, side: 'credit', amountMinor },
            ],
          });
        } finally {
          c.release();
        }
      }
      return allocationId;
    }

    /** Seeds a fully confirmed bill for the pay-per-bill flow. */
    async function confirmedBill(input: {
      customerId: string;
      totalMinor: number;
      category?: string;
      reference?: string;
      organizationId?: string;
      providerId?: string;
      providerName?: string;
      withInvoiceConfirmation?: boolean;
    }): Promise<string> {
      const reference = input.reference ?? `JRN-${randomUUID().slice(0, 8)}`;
      const organizationId = input.organizationId ?? seedId('clinic');
      const providerId = input.providerId ?? seedId('provider');
      const providerName = input.providerName ?? 'Demo Clinic Monrovia (simulated)';
      const category = input.category ?? 'outpatient';
      const bill = (
        await pool.query<{ id: string }>(
          `INSERT INTO bills(customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category)
           VALUES($1,$2,$3,'LRD',$4,$5) RETURNING id`,
          [input.customerId, organizationId, providerName, input.totalMinor, category],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_revisions(bill_id,revision,reference,issue_date,provider_id,provider_name,customer_user_id,currency,items,total_minor,requires_documents,confirmation_kind,author_user_id,reason)
         VALUES($1,1,$2,'2026-09-01',$3,$4,$5,'LRD',$6,$7,false,'invoice',$5,'journey fixture')`,
        [
          bill.id,
          reference,
          providerId,
          providerName,
          input.customerId,
          JSON.stringify([
            {
              description: 'Journey service line',
              quantity: 1,
              unitMinor: String(input.totalMinor),
            },
          ]),
          input.totalMinor,
        ],
      );
      const document = (
        await pool.query<{ id: string }>(
          `INSERT INTO bill_documents(bill_id,revision_number,storage_key,content_type,byte_size)
           VALUES($1,1,$2,'text/plain',64) RETURNING id`,
          [bill.id, `journey/${reference}.txt`],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,note)
         VALUES($1,1,'customer',$2,'Journey customer reviewed')`,
        [bill.id, input.customerId],
      );
      if (input.withInvoiceConfirmation !== false)
        await pool.query(
          `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,evidence_document_id,note)
           VALUES($1,1,'invoice',$2,$3,'Journey provider confirmed')`,
          [bill.id, staffId, document.id],
        );
      return bill.id;
    }

    async function validate(billId: string, cookie: string) {
      const r = await call('POST', `/api/bills/${billId}/validate`, cookie, {});
      expect(r.statusCode, r.body).toBe(200);
      return r.json() as { route: string; overall: string };
    }

    it('validates a clean bill, pays it end-to-end, and is replay-safe', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      await addAllocation(userId, walletId, '20000');
      const billId = await confirmedBill({ customerId: userId, totalMinor: 10000 });

      const validation = await validate(billId, cookie);
      tasks.push({
        id: 'validate-clean-bill',
        label: 'A clean, funded bill is automatically accepted',
        completed: validation.route === 'auto_accept',
      });

      const initiate = await call('POST', `/api/bills/${billId}/payments/initiate`, cookie, {
        key: randomUUID(),
      });
      expect(initiate.statusCode, initiate.body).toBe(200);
      const intentId = initiate.json().paymentIntentId as string;
      const apply = await call('POST', `/api/bills/${billId}/assistance/apply`, cookie, {
        key: randomUUID(),
      });
      expect(apply.statusCode, apply.body).toBe(200);
      const authorize = await call('POST', `/api/payments/${intentId}/authorize`, cookie, {
        key: randomUUID(),
      });
      expect(authorize.statusCode, authorize.body).toBe(200);
      const confirm = await call('POST', `/api/payments/${intentId}/simulate-callback`, cookie, {
        status: 'succeeded',
      });
      expect(confirm.statusCode, confirm.body).toBe(200);
      const succeeded = confirm.json().payment.state === 'succeeded';
      const receiptIssued = Boolean(confirm.json().payment.receiptId);

      const replay = await call('POST', `/api/payments/${intentId}/simulate-callback`, cookie, {
        status: 'succeeded',
      });
      const replaySafe = replay.json().accepted === false;

      // The confirm step also records one universal receipt and notifies the
      // payer, so the movement shows in the customer's receipt feed.
      const universal = await call('GET', '/api/receipts', cookie);
      expect(universal.statusCode, universal.body).toBe(200);
      const paymentReceipt = (universal.json().receipts as Array<Record<string, unknown>>).find(
        (r) => r.kind === 'payment' && r.reference === intentId,
      );
      expect(paymentReceipt, 'payer sees a universal payment receipt').toBeTruthy();
      const notices = await call('GET', '/api/notifications', cookie);
      expect(notices.statusCode, notices.body).toBe(200);
      expect(
        (notices.json().notifications as Array<{ template: string }>).some(
          (n) => n.template === 'payment.succeeded',
        ),
      ).toBe(true);

      payments.push({
        id: 'pay-clean-bill',
        label: 'A funded, confirmed bill is paid and a receipt is issued',
        attempted: true,
        succeeded,
        receiptIssued,
        duplicateCallbackIdempotent: replaySafe,
      });
      tasks.push({
        id: 'pay-clean-bill',
        label: 'A funded, confirmed bill is paid and a receipt is issued',
        completed: succeeded && receiptIssued,
      });
      tasks.push({
        id: 'replayed-callback',
        label: 'A replayed provider callback changes nothing',
        completed: replaySafe,
      });
    });

    it('keeps a provider-declined payment failed and unmoved', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      await addAllocation(userId, walletId, '20000');
      const billId = await confirmedBill({ customerId: userId, totalMinor: 5000 });
      await validate(billId, cookie);

      const initiate = await call('POST', `/api/bills/${billId}/payments/initiate`, cookie, {
        key: randomUUID(),
      });
      const intentId = initiate.json().paymentIntentId as string;
      await call('POST', `/api/bills/${billId}/assistance/apply`, cookie, { key: randomUUID() });
      await call('POST', `/api/payments/${intentId}/authorize`, cookie, { key: randomUUID() });
      const declined = await call('POST', `/api/payments/${intentId}/simulate-callback`, cookie, {
        status: 'failed',
      });
      expect(declined.statusCode, declined.body).toBe(200);
      const failed = declined.json().payment.state === 'failed';
      const noReceipt = !declined.json().payment.receiptId;
      tasks.push({
        id: 'provider-declined-payment',
        label: 'A provider-declined payment is recorded as failed with no receipt',
        completed: failed && noReceipt,
      });
    });

    it('routes an underfunded bill to correction and blocks payment', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      await addAllocation(userId, walletId, '1000');
      const billId = await confirmedBill({ customerId: userId, totalMinor: 8000 });

      const validation = await validate(billId, cookie);
      const initiate = await call('POST', `/api/bills/${billId}/payments/initiate`, cookie, {
        key: randomUUID(),
      });
      tasks.push({
        id: 'underfunded-bill-blocked',
        label: 'A bill that exceeds available funding is routed to correction and cannot be paid',
        completed: validation.route === 'needs_correction' && initiate.statusCode === 409,
      });
    });

    it('routes a suspected duplicate to human review', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      await addAllocation(userId, walletId, '40000');
      const reference = `JRN-DUP-${randomUUID().slice(0, 8)}`;
      await confirmedBill({ customerId: userId, totalMinor: 7000, reference });
      const secondId = await confirmedBill({ customerId: userId, totalMinor: 7000, reference });
      const validation = await validate(secondId, cookie);
      tasks.push({
        id: 'duplicate-bill-review',
        label: 'A suspected duplicate bill is sent to human review, never auto-paid',
        completed: validation.route === 'await_review',
      });
    });

    it('awaits an unverified provider instead of paying', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      await addAllocation(userId, walletId, '40000');
      const organizationId = randomUUID();
      const providerId = randomUUID();
      await pool.query(
        "INSERT INTO organizations(id,name,kind,registration_number,created_by,status) VALUES($1,'Journey Unverified Clinic','provider','JRN-UNVERIFIED',$2,'approved')",
        [organizationId, userId],
      );
      await pool.query(
        "INSERT INTO providers(id,organization_id,legal_name,license_number,status) VALUES($1,$2,'Journey Unverified Clinic','JRN-LIC',$3)",
        [providerId, organizationId, 'pending'],
      );
      const billId = await confirmedBill({
        customerId: userId,
        totalMinor: 6000,
        organizationId,
        providerId,
        providerName: 'Journey Unverified Clinic',
        withInvoiceConfirmation: false,
      });
      const validation = await validate(billId, cookie);
      tasks.push({
        id: 'unverified-provider-blocked',
        label: 'A bill from an unverified provider awaits verification instead of paying',
        completed: validation.route === 'await_provider',
      });
    });

    it('routes an unreadable document to human assistance without fabricating values', async () => {
      const { userId, cookie } = await makeCustomer();
      const bill = (
        await pool.query<{ id: string }>(
          `INSERT INTO bills(customer_user_id,provider_name,currency,total_amount_minor,category) VALUES($1,'Demo Clinic Monrovia (simulated)','LRD',4000,'outpatient') RETURNING id`,
          [userId],
        )
      ).rows[0];
      const key = `demo/journey-unreadable-${bill.id}.txt`;
      await app.ctx.adapters.storage.putObject({
        key,
        bytes: Buffer.from([0x00, 0x01, 0xff, 0x00]),
        contentType: 'text/plain',
      });
      await pool.query(
        `INSERT INTO bill_documents(bill_id,storage_key,content_type,byte_size) VALUES($1,$2,'text/plain',4)`,
        [bill.id, key],
      );
      const r = await call('POST', `/api/bills/${bill.id}/extract`, cookie, {});
      expect(r.statusCode, r.body).toBe(200);
      const body = r.json() as { status: string; findings: Array<{ code: string }> };
      tasks.push({
        id: 'unreadable-document-review',
        label: 'An unreadable document is routed to a person and no values are fabricated',
        completed:
          body.status === 'needs_review' &&
          body.findings.some((finding) => finding.code === 'UNREADABLE_DOCUMENT'),
      });
    });

    it('reports honest, denominator-backed payment and task metrics', async () => {
      const report = computeReport({
        datasetVersion: JOURNEY_DATASET_VERSION,
        extraction: [],
        scenarios: [],
        payments,
        tasks,
        command: 'test:journey',
      });
      const docsFolder = new URL('../../../../docs/evaluation/', import.meta.url);
      await mkdir(docsFolder, { recursive: true });
      await writeFile(new URL('journey.json', docsFolder), renderJson(report), 'utf8');
      await writeFile(new URL('journey.md', docsFolder), renderMarkdown(report), 'utf8');

      const byId = new Map(report.metrics.map((metric) => [metric.id, metric]));
      expect(byId.get('payment.reliability')?.numerator).toBe(
        byId.get('payment.reliability')?.denominator,
      );
      expect(byId.get('payment.callback.idempotent')?.numerator).toBe(
        byId.get('payment.callback.idempotent')?.denominator,
      );
      expect(byId.get('payment.receipts')?.numerator).toBe(
        byId.get('payment.receipts')?.denominator,
      );
      expect(byId.get('tasks.completion')?.numerator).toBe(
        byId.get('tasks.completion')?.denominator,
      );
      expect(report.counts.tasks).toBeGreaterThanOrEqual(6);
      expect(report.counts.payments).toBeGreaterThan(0);
    });
  },
);

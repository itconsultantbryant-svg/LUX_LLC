import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from '../../build-app.js';
import { createDb } from '../../db/client.js';
import { createAdapters } from '../../adapters/index.js';
import { loadEnv } from '../../config/env.js';
import { tokenHash } from '../identity/service.js';
import { LedgerService } from '../ledger/service.js';
import { seedCore, seedId } from '../ledger/seed.js';

describe.skipIf(process.env.VALIDATION_DATABASE_TESTS !== '1')(
  'hybrid validation: deterministic rules, AI, external records and routing',
  () => {
    let pool: pg.Pool, admin: pg.Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const schema = `validation_test_${randomUUID().replaceAll('-', '')}`;
    let customerCookie: string, platformCookie: string;
    let storageRoot: string, staffId: string, platformId: string;

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
        max: 8,
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
      storageRoot = await mkdtemp(path.join(tmpdir(), 'validation-storage-'));
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
          "INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method,mfa_verified_at) VALUES($1,$2,now()+interval '8 hours','sandbox', CASE WHEN $3 THEN now() ELSE NULL END)",
          [tokenHash(token), user, mfa],
        );
        return `hw_session=${token}`;
      }
      customerCookie = await session(seedId('customer'), true);
      platformId = randomUUID();
      await pool.query(
        `INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Validation Admin')`,
        [platformId, '+99971000099'],
      );
      await pool.query('INSERT INTO user_roles(user_id,role) VALUES ($1,$2)', [
        platformId,
        'platform_admin',
      ]);
      platformCookie = await session(platformId, true);

      // A current, matching registry verification makes the provider payable.
      // The guard requires an independent platform_admin reviewer plus evidence.
      await pool.query(
        `INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,method,evidence_reference,valid_until,verified_details)
         SELECT p.id,$1,'verified','test registry check pass','registry_check','test-registry-ref',now()+interval '1 year',
                jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address)
         FROM providers p WHERE p.id=$2`,
        [platformId, seedId('provider')],
      );
      // Provider staff who can confirm invoices.
      staffId = randomUUID();
      await pool.query(
        `INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Validation Staff')`,
        [staffId, '+99971000100'],
      );
      await pool.query(
        `INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'provider_staff','active')`,
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
        remoteAddress: `127.0.0.2`,
        payload: body as Record<string, unknown> | undefined,
      });
    }

    async function makeBill(
      totalMinor: number,
      reference: string,
      issueDate: string,
      options: { confirm?: boolean } = {},
    ): Promise<string> {
      const bill = (
        await pool.query<{ id: string }>(
          `INSERT INTO bills(customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category)
           VALUES($1,$2,'SYNTHETIC Care Clinic','LRD',$3,'outpatient') RETURNING id`,
          [seedId('customer'), seedId('clinic'), totalMinor],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_revisions(bill_id,revision,reference,issue_date,provider_id,provider_name,customer_user_id,currency,items,total_minor,requires_documents,confirmation_kind,author_user_id,reason)
         VALUES($1,1,$2,$3,$4,'SYNTHETIC Care Clinic',$5,'LRD',$6,$7,false,'invoice',$5,'validation test')`,
        [
          bill.id,
          reference,
          issueDate,
          seedId('provider'),
          seedId('customer'),
          JSON.stringify([
            { description: 'Consultation', quantity: 1, unitMinor: String(totalMinor) },
          ]),
          totalMinor,
        ],
      );
      await pool.query(
        `INSERT INTO bill_items(bill_id,description,category,quantity,unit_amount_minor,total_amount_minor,currency)
         VALUES($1,'Consultation','consultation',1,$2,$2,'LRD')`,
        [bill.id, totalMinor],
      );
      const document = (
        await pool.query<{ id: string }>(
          `INSERT INTO bill_documents(bill_id,revision_number,storage_key,content_type,byte_size)
           VALUES($1,1,$2,'text/plain',64) RETURNING id`,
          [bill.id, `demo/${reference}.txt`],
        )
      ).rows[0];
      if (options.confirm)
        await pool.query(
          `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,evidence_document_id,note)
           VALUES($1,1,'invoice',$2,$3,'provider confirmed')`,
          [bill.id, staffId, document.id],
        );
      return bill.id;
    }

    async function makeExtraction(
      billId: string,
      output: Record<string, unknown>,
      confidenceBps: number,
    ) {
      await pool.query(
        `INSERT INTO ai_runs(bill_id,document_id,mode,adapter_id,model_version,status,input_digest,output,confidence_bps,requires_review,completed_at)
         SELECT $1,d.id,'sandbox','ai.sandbox','reader:rules-v1','completed','digest',$2,$3,false,now()
         FROM bill_documents d WHERE d.bill_id=$1 LIMIT 1`,
        [billId, JSON.stringify(output), confidenceBps],
      );
    }

    const extraction = (over: Record<string, unknown> = {}) => ({
      mode: 'sandbox',
      adapterId: 'ai.sandbox',
      fields: {
        providerName: 'SYNTHETIC Care Clinic',
        customerName: 'SYNTHETIC Customer',
        billReference: 'VAL-1',
        serviceDate: '2026-09-01',
        currency: 'LRD',
        totalAmountMinor: 3000,
        lineItems: [{ description: 'Consultation', quantity: 1, totalAmountMinor: 3000 }],
      },
      confidence: 0.95,
      evidence: [{ field: 'totalAmountMinor', note: 'matched labelled total', kind: 'extracted' }],
      modelOrFixture: 'reader:rules-v1',
      unreadable: false,
      derivedTotalMinor: 3000,
      ambiguous: [],
      ...over,
    });

    it('auto-accepts a valid, low-risk bill with clear evidence', async () => {
      const billId = await makeBill(3000, 'VAL-1', '2026-09-01', { confirm: true });
      await makeExtraction(billId, extraction(), 9500);
      const r = await call('POST', `/api/bills/${billId}/validate`, customerCookie, {});
      expect(r.statusCode, r.body).toBe(200);
      const body = r.json();
      expect(body.route).toBe('auto_accept');
      expect(body.customerStatus).toBe('ready_for_payment');
      expect(body.customerStatusLabel).toBe('Ready for payment authorization');
      const findings = body.findings as Array<{ check: string; result: string }>;
      expect(findings.find((f) => f.check === 'bill_arithmetic')?.result).toBe('pass');
      expect(findings.find((f) => f.check === 'provider_verification')?.result).toBe('pass');
      expect(findings.find((f) => f.check === 'exact_duplicate')?.result).toBe('pass');
      // No credible price dataset exists yet: reported honestly as unavailable.
      expect(findings.find((f) => f.check === 'price_anomaly')?.result).toBe('unavailable');
    });

    it('routes an exact duplicate to human review and blocks payment authorization', async () => {
      await makeBill(5000, 'DUP-5', '2026-09-02');
      const second = await makeBill(5000, 'DUP-5', '2026-09-02');
      const validated = await call('POST', `/api/bills/${second}/validate`, customerCookie, {});
      expect(validated.statusCode, validated.body).toBe(200);
      const body = validated.json();
      expect(body.route).toBe('await_review');
      expect(body.customerStatus).toBe('awaiting_review');
      const duplicate = (
        body.findings as Array<{ check: string; result: string; evidence: unknown }>
      ).find((f) => f.check === 'exact_duplicate');
      expect(duplicate?.result).toBe('fail');

      const blocked = await call(
        'POST',
        `/api/care/bills/${second}/payment-request`,
        customerCookie,
        { key: randomUUID(), expectedRevision: 1 },
      );
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().message).toContain('not ready for payment authorization');

      // Reviewer authority: above limit must escalate rather than be forced.
      const tooHigh = await call(
        'POST',
        `/api/admin/bills/${second}/validation/actions`,
        platformCookie,
        { action: 'approve', reason: 'attempt above authority', authorityMinor: '100' },
      );
      expect(tooHigh.statusCode).toBe(409);

      const approve = await call(
        'POST',
        `/api/admin/bills/${second}/validation/actions`,
        platformCookie,
        { action: 'approve', reason: 'reviewed duplicate manually and cleared it' },
      );
      expect(approve.statusCode, approve.body).toBe(200);
      expect(approve.json().validationState).toBe('ready_for_payment');
      const bill = (
        await pool.query<{ status: string; validation_state: string }>(
          'SELECT status,validation_state FROM bills WHERE id=$1',
          [second],
        )
      ).rows[0];
      expect(bill.status).toBe('validated');
      expect(bill.validation_state).toBe('ready_for_payment');
    });

    it('routes an uncertain (unreadable) document to review without fabricating values', async () => {
      const billId = await makeBill(7000, 'UNC-7', '2026-09-03');
      await makeExtraction(
        billId,
        extraction({
          unreadable: true,
          fields: {
            providerName: null,
            customerName: null,
            billReference: null,
            serviceDate: null,
            currency: null,
            totalAmountMinor: null,
            lineItems: [],
          },
          confidence: 0,
          evidence: [],
          derivedTotalMinor: null,
        }),
        0,
      );
      const r = await call('POST', `/api/bills/${billId}/validate`, customerCookie, {});
      expect(r.statusCode, r.body).toBe(200);
      const body = r.json();
      expect(body.route).toBe('await_review');
      const ai = (
        body.findings as Array<{ check: string; result: string; evidence: Record<string, unknown> }>
      ).find((f) => f.check === 'ai_document_analysis');
      expect(ai?.result).toBe('uncertain');
      // The AI check must never claim treatment occurred from a bill alone.
      expect(ai?.evidence.treatmentOccurredConclusion).toBe(false);
      expect(String(ai?.evidence.limitation)).toContain('cannot establish');
    });

    it('records reviewer clarifications, corrections, escalation and appeals with reasons', async () => {
      const billId = await makeBill(9000, 'REV-9', '2026-09-04');
      await makeBill(9000, 'REV-9', '2026-09-04'); // trigger a duplicate to force review
      const validated = await call('POST', `/api/bills/${billId}/validate`, customerCookie, {});
      expect(validated.json().route).toBe('await_review');

      const wrong = await call(
        'POST',
        `/api/admin/bills/${billId}/validation/actions`,
        platformCookie,
        { action: 'correct_finding', reason: 'missing finding name' },
      );
      expect(wrong.statusCode).toBe(400);

      const corrected = await call(
        'POST',
        `/api/admin/bills/${billId}/validation/actions`,
        platformCookie,
        {
          action: 'correct_finding',
          checkName: 'exact_duplicate',
          reason: 'manually confirmed these are two different visits',
          patch: { result: 'pass', note: 'distinct dates confirmed' },
        },
      );
      expect(corrected.statusCode, corrected.body).toBe(200);

      const clarification = await call(
        'POST',
        `/api/admin/bills/${billId}/validation/actions`,
        platformCookie,
        { action: 'request_clarification', reason: 'ask provider to resend the itemised invoice' },
      );
      expect(clarification.statusCode).toBe(200);
      expect(clarification.json().validationState).toBe('awaiting_provider');

      const appeal = await call(
        'POST',
        `/api/admin/bills/${billId}/validation/actions`,
        platformCookie,
        { action: 'appeal', reason: 'customer disputes the duplicate finding' },
      );
      expect(appeal.statusCode, appeal.body).toBe(200);
      const appealId = appeal.json().appealId as string;
      expect(appealId).toBeTruthy();

      const escalated = await call(
        'POST',
        `/api/admin/bills/${billId}/validation/actions`,
        platformCookie,
        { action: 'escalate', reason: 'needs a senior reviewer for this dispute' },
      );
      expect(escalated.statusCode).toBe(200);

      const resolved = await call(
        'POST',
        `/api/admin/bills/${billId}/validation/actions`,
        platformCookie,
        {
          action: 'resolve',
          reason: 'appeal upheld the original finding',
          appealId,
          outcome: 'upheld',
        },
      );
      expect(resolved.statusCode, resolved.body).toBe(200);
      expect(resolved.json().validationState).toBe('declined');

      const history = await call('GET', `/api/admin/bills/${billId}/validation`, platformCookie);
      expect(history.statusCode, history.body).toBe(200);
      const actions = (history.json().reviewerActions as Array<{ action: string }>).map(
        (entry) => entry.action,
      );
      expect(actions).toEqual(
        expect.arrayContaining([
          'correct_finding',
          'request_clarification',
          'appeal',
          'escalate',
          'resolve',
        ]),
      );
      const stored = (
        await pool.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM validation_reviewer_actions WHERE bill_id=$1',
          [billId],
        )
      ).rows[0].n;
      expect(stored).toBeGreaterThanOrEqual(5);
    });
  },
);

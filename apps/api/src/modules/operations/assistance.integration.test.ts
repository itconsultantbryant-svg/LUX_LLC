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

describe.skipIf(process.env.ASSISTANCE_DATABASE_TESTS !== '1')(
  'funding assistance: deterministic eligibility, actions and restrictions',
  () => {
    let pool: pg.Pool, admin: pg.Pool, app: Awaited<ReturnType<typeof buildApp>>;
    let ledger: LedgerService;
    const schema = `assistance_test_${randomUUID().replaceAll('-', '')}`;
    let storageRoot: string, platformId: string, staffId: string;
    let phoneCounter = 0;

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
      ledger = new LedgerService(pool);
      await seedCore(ledger, 'test');
      storageRoot = await mkdtemp(path.join(tmpdir(), 'assistance-storage-'));
      const env = loadEnv({
        ...process.env,
        STORAGE_ADAPTER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        LOG_LEVEL: 'error',
      });
      app = await buildApp({ env, pool, db: createDb(pool), adapters: createAdapters(env) });

      platformId = randomUUID();
      await pool.query(
        `INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Assistance Admin')`,
        [platformId, '+99972000099'],
      );
      await pool.query('INSERT INTO user_roles(user_id,role) VALUES ($1,$2)', [
        platformId,
        'platform_admin',
      ]);
      // A current, matching registry verification makes the provider payable.
      await pool.query(
        `INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,method,evidence_reference,valid_until,verified_details)
         SELECT p.id,$1,'verified','test registry check pass','registry_check','test-registry-ref',now()+interval '1 year',
                jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address)
         FROM providers p WHERE p.id=$2`,
        [platformId, seedId('provider')],
      );
      // Authorized provider staff who may confirm invoices with evidence.
      staffId = randomUUID();
      await pool.query(
        `INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Assistance Staff')`,
        [staffId, '+99972000100'],
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
        remoteAddress: '127.0.0.3',
        payload: body as Record<string, unknown> | undefined,
      });
    }
    async function session(user: string): Promise<string> {
      const token = randomBytes(32).toString('hex');
      await pool.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method,mfa_verified_at) VALUES($1,$2,now()+interval '8 hours','sandbox',now())",
        [tokenHash(token), user],
      );
      return `hw_session=${token}`;
    }
    async function makeCustomer(): Promise<{ userId: string; walletId: string; cookie: string }> {
      const userId = randomUUID();
      const walletId = randomUUID();
      phoneCounter += 1;
      await pool.query(
        "INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Assistance Customer')",
        [userId, `+99973${String(phoneCounter).padStart(6, '0')}`],
      );
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'customer')", [userId]);
      await pool.query(
        "INSERT INTO customer_profiles(user_id,display_name) VALUES($1,'Assistance Customer')",
        [userId],
      );
      await pool.query("INSERT INTO wallets(id,owner_user_id,currency) VALUES($1,$2,'LRD')", [
        walletId,
        userId,
      ]);
      return { userId, walletId, cookie: await session(userId) };
    }
    async function credit(
      allocationId: string,
      bucket: 'available' | 'restricted' | 'pending',
      amountMinor: string,
    ) {
      const c = await pool.connect();
      try {
        const debit = await ledger.clearing(c, 'LRD', 'receivable');
        const account = await ledger.account(c, allocationId, bucket);
        await ledger.postInTransaction(c, `test:credit:${allocationId}:${bucket}`, {
          currency: 'LRD',
          operation: 'funding_credit',
          description: 'test allocation credit',
          lines: [
            { accountId: debit, side: 'debit', amountMinor },
            { accountId: account, side: 'credit', amountMinor },
          ],
        });
      } finally {
        c.release();
      }
    }
    async function addAllocation(opt: {
      userId: string;
      walletId: string;
      source: string;
      amountMinor?: string;
      bucket?: 'available' | 'restricted' | 'pending';
      programId?: string | null;
      allowedCategories?: string[];
      allowedProviderIds?: string[];
    }): Promise<string> {
      const allocationId = randomUUID();
      await pool.query(
        `INSERT INTO funding_allocations(id,wallet_id,source,currency,beneficiary_user_id,program_id,program_rule_version,allowed_categories,allowed_provider_ids,expires_at)
         VALUES($1,$2,$3,'LRD',$4,$5,$6,$7,$8,now()+interval '1 year')`,
        [
          allocationId,
          opt.walletId,
          opt.source,
          opt.userId,
          opt.programId ?? null,
          opt.programId ? 1 : null,
          opt.allowedCategories ?? [],
          opt.allowedProviderIds ?? [],
        ],
      );
      await pool.query(
        `INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) SELECT $1||':'||bucket,'LRD',$1::uuid,bucket,'liability','credit' FROM unnest(ARRAY['available','reserved','pending','restricted']) bucket`,
        [allocationId],
      );
      if (opt.amountMinor && opt.amountMinor !== '0')
        await credit(allocationId, opt.bucket ?? 'available', opt.amountMinor);
      return allocationId;
    }
    async function makeProgram(): Promise<string> {
      const programId = randomUUID();
      await pool.query(
        `INSERT INTO programs(id,organization_id,name,currency,status,allowed_categories,max_per_payment_minor)
         VALUES($1,$2,'Test Outpatient Program','LRD','active',ARRAY['outpatient'],50000)`,
        [programId, seedId('sponsor')],
      );
      return programId;
    }
    async function makeVoucher(allocationId: string, programId: string, amountMinor: string) {
      await pool.query(
        `INSERT INTO vouchers(program_id,allocation_id,code_hash,amount_minor,currency,expires_at)
         VALUES($1,$2,$3,$4,'LRD',now()+interval '1 year')`,
        [programId, allocationId, `test-voucher-${allocationId}`, amountMinor],
      );
    }
    async function makeCreditOffer(userId: string, walletId: string): Promise<string> {
      const allocationId = await addAllocation({
        userId,
        walletId,
        source: 'partner_credit',
        amountMinor: '40000',
        bucket: 'pending',
      });
      const creditId = randomUUID();
      await pool.query(
        `INSERT INTO credit_records(id,allocation_id,partner_organization_id,beneficiary_user_id,currency,principal_minor,fee_minor,status,terms_version,due_at)
         VALUES($1,$2,$3,$4,'LRD',40000,0,'offered','test-v1',now()+interval '90 days')`,
        [creditId, allocationId, seedId('partner'), userId],
      );
      return creditId;
    }
    async function payableBill(
      customerId: string,
      totalMinor: number,
      category = 'outpatient',
    ): Promise<string> {
      const reference = `AST-${randomUUID().slice(0, 8)}`;
      const bill = (
        await pool.query<{ id: string }>(
          `INSERT INTO bills(customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category)
           VALUES($1,$2,'SYNTHETIC Care Clinic','LRD',$3,$4) RETURNING id`,
          [customerId, seedId('clinic'), totalMinor, category],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_revisions(bill_id,revision,reference,issue_date,provider_id,provider_name,customer_user_id,currency,items,total_minor,requires_documents,confirmation_kind,author_user_id,reason)
         VALUES($1,1,$2,'2026-09-01',$3,'SYNTHETIC Care Clinic',$4,'LRD',$5,$6,false,'invoice',$4,'assistance test')`,
        [
          bill.id,
          reference,
          seedId('provider'),
          customerId,
          JSON.stringify([
            { description: 'Consultation', quantity: 1, unitMinor: String(totalMinor) },
          ]),
          totalMinor,
        ],
      );
      await pool.query(
        `INSERT INTO bill_items(bill_id,description,category,quantity,unit_amount_minor,total_amount_minor,currency)
         VALUES($1,'Consultation',$2,1,$3,$3,'LRD')`,
        [bill.id, category, totalMinor],
      );
      const document = (
        await pool.query<{ id: string }>(
          `INSERT INTO bill_documents(bill_id,revision_number,storage_key,content_type,byte_size)
           VALUES($1,1,$2,'text/plain',64) RETURNING id`,
          [bill.id, `demo/${reference}.txt`],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,note)
         VALUES($1,1,'customer',$2,'Customer reviewed provider, currency, items and total')`,
        [bill.id, customerId],
      );
      await pool.query(
        `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,evidence_document_id,note)
         VALUES($1,1,'invoice',$2,$3,'Provider confirmed the invoice')`,
        [bill.id, staffId, document.id],
      );
      return bill.id;
    }

    it('computes a deterministic plan and flags restricted allocations', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      const programId = await makeProgram();
      await addAllocation({ userId, walletId, source: 'personal_savings', amountMinor: '10000' });
      await addAllocation({
        userId,
        walletId,
        source: 'family_contributions',
        amountMinor: '5000',
      });
      await addAllocation({ userId, walletId, source: 'rewards', amountMinor: '2000' });
      await addAllocation({
        userId,
        walletId,
        source: 'employer_benefits',
        amountMinor: '8000',
        programId,
      });
      const voucherAlloc = await addAllocation({
        userId,
        walletId,
        source: 'sponsor_vouchers',
        amountMinor: '3000',
        programId,
      });
      await makeVoucher(voucherAlloc, programId, '3000');
      // Wrong category: must never contribute to an outpatient bill.
      await addAllocation({
        userId,
        walletId,
        source: 'rewards',
        amountMinor: '7000',
        allowedCategories: ['consultation'],
      });
      const billId = await payableBill(userId, 15000);

      const r = await call('GET', `/api/bills/${billId}/assistance`, cookie);
      expect(r.statusCode, r.body).toBe(200);
      const plan = r.json().plan;
      expect(plan.totalEligibleMinor).toBe('28000');
      expect(plan.billAmountMinor).toBe('15000');
      expect(plan.shortfallMinor).toBe('0');
      expect(plan.insurance.available).toBe(false);
      expect(String(plan.insurance.reason)).toContain('never inferred');
      const blocked = plan.sources.find(
        (s: { blockReason: string | null }) => s.blockReason === 'category_restriction',
      );
      expect(blocked).toBeTruthy();
      expect(blocked.eligible).toBe(false);
      const byAction = (a: string) => plan.actions.find((x: { action: string }) => x.action === a);
      expect(byAction('use_funds').available).toBe(true);
      expect(byAction('apply_voucher').available).toBe(true);
      expect(byAction('request_support').available).toBe(false);
      expect(byAction('request_help').available).toBe(true);
    });

    it('reserves eligible funds up to the shortfall and is idempotent', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      const savings = await addAllocation({
        userId,
        walletId,
        source: 'personal_savings',
        amountMinor: '10000',
      });
      const billId = await payableBill(userId, 15000);
      const key = randomUUID();

      const first = await call('POST', `/api/bills/${billId}/assistance/apply`, cookie, { key });
      expect(first.statusCode, first.body).toBe(200);
      const body = first.json();
      expect(body.reservations).toHaveLength(1);
      expect(body.reservations[0].amountMinor).toBe('10000');
      expect(body.plan.allocatedMinor).toBe('10000');
      expect(body.plan.shortfallMinor).toBe('5000');

      const available = (
        await pool.query<{ balance: string }>(
          "SELECT balance_minor::text AS balance FROM ledger_accounts WHERE allocation_id=$1 AND bucket='available'",
          [savings],
        )
      ).rows[0];
      expect(available.balance).toBe('0');
      const reserved = (
        await pool.query<{ balance: string }>(
          "SELECT balance_minor::text AS balance FROM ledger_accounts WHERE allocation_id=$1 AND bucket='reserved'",
          [savings],
        )
      ).rows[0];
      expect(reserved.balance).toBe('10000');

      const repeat = await call('POST', `/api/bills/${billId}/assistance/apply`, cookie, { key });
      expect(repeat.statusCode, repeat.body).toBe(200);
      expect(repeat.json().plan.allocatedMinor).toBe('10000');
      const count = (
        await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM funding_reservations WHERE allocation_id=$1',
          [savings],
        )
      ).rows[0];
      expect(count.count).toBe('1');
    });

    it('applies a voucher once and refuses a second use', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      const programId = await makeProgram();
      const voucherAlloc = await addAllocation({
        userId,
        walletId,
        source: 'sponsor_vouchers',
        amountMinor: '3000',
        programId,
      });
      await makeVoucher(voucherAlloc, programId, '3000');
      const billId = await payableBill(userId, 2000);

      const r = await call('POST', `/api/bills/${billId}/assistance/voucher`, cookie, {
        key: randomUUID(),
        voucherAllocationId: voucherAlloc,
      });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().reservations[0].amountMinor).toBe('2000');
      const voucher = (
        await pool.query<{ status: string }>('SELECT status FROM vouchers WHERE allocation_id=$1', [
          voucherAlloc,
        ])
      ).rows[0];
      expect(voucher.status).toBe('redeemed');

      const second = await call('POST', `/api/bills/${billId}/assistance/voucher`, cookie, {
        key: randomUUID(),
        voucherAllocationId: voucherAlloc,
      });
      expect(second.statusCode).toBe(409);
    });

    it('records shortfall support, help and partner financing inquiries honestly', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      const creditId = await makeCreditOffer(userId, walletId);
      const billId = await payableBill(userId, 20000);

      const plan = (await call('GET', `/api/bills/${billId}/assistance`, cookie)).json().plan;
      expect(plan.shortfallMinor).toBe('20000');
      const byAction = (a: string) => plan.actions.find((x: { action: string }) => x.action === a);
      expect(byAction('request_support').available).toBe(true);
      expect(byAction('explore_financing').available).toBe(true);

      const support = await call('POST', `/api/bills/${billId}/assistance/support`, cookie, {
        kind: 'shortfall_support',
        amountMinor: '20000',
        reason: 'Cannot cover the remaining shortfall this month',
      });
      expect(support.statusCode, support.body).toBe(200);
      expect(String(support.json().message)).toContain('not a guarantee');

      const again = await call('POST', `/api/bills/${billId}/assistance/support`, cookie, {
        kind: 'shortfall_support',
        reason: 'Following up on the same shortfall request',
      });
      expect(again.json().id).toBe(support.json().id);

      const financing = await call('POST', `/api/bills/${billId}/assistance/financing`, cookie, {
        creditRecordId: creditId,
      });
      expect(financing.statusCode, financing.body).toBe(200);
      expect(String(financing.json().message)).toContain('No funds moved yet');

      const view = (await call('GET', `/api/bills/${billId}/assistance`, cookie)).json();
      expect(view.supportRequests).toHaveLength(1);
      expect(view.financingInquiries).toHaveLength(1);
    });

    it('denies access to another customer and requires the customer to authorize funds', async () => {
      const owner = await makeCustomer();
      await addAllocation({
        userId: owner.userId,
        walletId: owner.walletId,
        source: 'personal_savings',
        amountMinor: '10000',
      });
      const billId = await payableBill(owner.userId, 5000);
      const stranger = await makeCustomer();

      const denied = await call('GET', `/api/bills/${billId}/assistance`, stranger.cookie);
      expect([403, 404]).toContain(denied.statusCode);

      const deniedApply = await call(
        'POST',
        `/api/bills/${billId}/assistance/apply`,
        stranger.cookie,
        { key: randomUUID() },
      );
      expect([403, 404]).toContain(deniedApply.statusCode);

      const noFundsBill = await payableBill(stranger.userId, 5000);
      const nothing = await call(
        'POST',
        `/api/bills/${noFundsBill}/assistance/apply`,
        stranger.cookie,
        { key: randomUUID() },
      );
      expect(nothing.statusCode, nothing.body).toBe(200);
      expect(nothing.json().reservations).toHaveLength(0);
      expect(String(nothing.json().message)).toContain('No funds moved');
    });
  },
);

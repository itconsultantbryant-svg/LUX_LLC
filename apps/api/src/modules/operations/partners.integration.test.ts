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

describe.skipIf(process.env.PARTNERS_DATABASE_TESTS !== '1')(
  'payments, assistant, governance and partner modules',
  () => {
    let pool: pg.Pool, admin: pg.Pool, app: Awaited<ReturnType<typeof buildApp>>;
    let ledger: LedgerService;
    const schema = `partners_test_${randomUUID().replaceAll('-', '')}`;
    let storageRoot: string,
      platformId: string,
      staffId: string,
      approverId: string,
      financeId: string;
    let sponsorOrgId: string;
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
      storageRoot = await mkdtemp(path.join(tmpdir(), 'partners-storage-'));
      const env = loadEnv({
        ...process.env,
        STORAGE_ADAPTER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        LOG_LEVEL: 'error',
      });
      app = await buildApp({ env, pool, db: createDb(pool), adapters: createAdapters(env) });

      platformId = randomUUID();
      await pool.query(
        "INSERT INTO users(id,phone_e164,display_name) VALUES($1,'+99973000099','Partners Admin')",
        [platformId],
      );
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'platform_admin')", [
        platformId,
      ]);
      await pool.query(
        `INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,method,evidence_reference,valid_until,verified_details)
          SELECT p.id,$1,'verified','test registry check pass','registry_check','test-ref',now()+interval '1 year',
                 jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address)
          FROM providers p WHERE p.id=$2`,
        [platformId, seedId('provider')],
      );
      staffId = randomUUID();
      await pool.query(
        "INSERT INTO users(id,phone_e164,display_name) VALUES($1,'+99973000100','Partners Staff')",
        [staffId],
      );
      await pool.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'provider_staff','active')",
        [seedId('clinic'), staffId],
      );
      // Independent sponsor organization with separate requester/approver/finance.
      sponsorOrgId = randomUUID();
      await pool.query(
        "INSERT INTO organizations(id,name,kind,registration_number,status,created_by) VALUES($1,'Partners Sponsor','sponsor','PTEST-1','approved',$2)",
        [sponsorOrgId, platformId],
      );
      const makeMember = async (role: string): Promise<string> => {
        const userId = randomUUID();
        phoneCounter += 1;
        await pool.query('INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,$3)', [
          userId,
          `+99974${String(phoneCounter).padStart(6, '0')}`,
          `Partners ${role}`,
        ]);
        await pool.query(
          "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,$3,'active')",
          [sponsorOrgId, userId, role],
        );
        return userId;
      };
      approverId = await makeMember('organization_admin');
      financeId = await makeMember('finance_operator');
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
        "INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,'Partners Customer')",
        [userId, `+99975${String(phoneCounter).padStart(6, '0')}`],
      );
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'customer')", [userId]);
      await pool.query(
        "INSERT INTO customer_profiles(user_id,display_name) VALUES($1,'Partners Customer')",
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
    }): Promise<string> {
      const allocationId = randomUUID();
      await pool.query(
        `INSERT INTO funding_allocations(id,wallet_id,source,currency,beneficiary_user_id,program_id,program_rule_version,allowed_categories,expires_at)
         VALUES($1,$2,$3,'LRD',$4,$5,$6,$7,now()+interval '1 year')`,
        [
          allocationId,
          opt.walletId,
          opt.source,
          opt.userId,
          opt.programId ?? null,
          opt.programId ? 1 : null,
          opt.allowedCategories ?? [],
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
    async function payableBill(
      customerId: string,
      totalMinor: number,
      category = 'outpatient',
    ): Promise<string> {
      const reference = `PNT-${randomUUID().slice(0, 8)}`;
      const bill = (
        await pool.query<{ id: string }>(
          `INSERT INTO bills(customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category)
           VALUES($1,$2,'SYNTHETIC Care Clinic','LRD',$3,$4) RETURNING id`,
          [customerId, seedId('clinic'), totalMinor, category],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_revisions(bill_id,revision,reference,issue_date,provider_id,provider_name,customer_user_id,currency,items,total_minor,requires_documents,confirmation_kind,author_user_id,reason)
         VALUES($1,1,$2,'2026-09-01',$3,'SYNTHETIC Care Clinic',$4,'LRD',$5,$6,false,'invoice',$4,'partners test')`,
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
      const document = (
        await pool.query<{ id: string }>(
          `INSERT INTO bill_documents(bill_id,revision_number,storage_key,content_type,byte_size)
           VALUES($1,1,$2,'text/plain',64) RETURNING id`,
          [bill.id, `demo/${reference}.txt`],
        )
      ).rows[0];
      await pool.query(
        `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,note)
         VALUES($1,1,'customer',$2,'Customer reviewed')`,
        [bill.id, customerId],
      );
      await pool.query(
        `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,evidence_document_id,note)
         VALUES($1,1,'invoice',$2,$3,'Provider confirmed')`,
        [bill.id, staffId, document.id],
      );
      return bill.id;
    }

    it('confirms payment only from a signed callback, issues a receipt, and is replay-safe', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      await addAllocation({ userId, walletId, source: 'personal_savings', amountMinor: '10000' });
      const billId = await payableBill(userId, 10000);

      const initiate = await call('POST', `/api/bills/${billId}/payments/initiate`, cookie, {
        key: randomUUID(),
      });
      expect(initiate.statusCode, initiate.body).toBe(200);
      expect(initiate.json().state).toBe('awaiting_authorization');
      expect(initiate.json().receiptId).toBeNull();
      const intentId = initiate.json().paymentIntentId;

      await call('POST', `/api/bills/${billId}/assistance/apply`, cookie, { key: randomUUID() });
      const authorize = await call('POST', `/api/payments/${intentId}/authorize`, cookie, {
        key: randomUUID(),
      });
      expect(authorize.statusCode, authorize.body).toBe(200);
      expect(authorize.json().state).not.toBe('succeeded');

      const confirm = await call('POST', `/api/payments/${intentId}/simulate-callback`, cookie, {
        status: 'succeeded',
      });
      expect(confirm.statusCode, confirm.body).toBe(200);
      expect(confirm.json().accepted).toBe(true);
      expect(confirm.json().payment.state).toBe('succeeded');
      expect(confirm.json().payment.receiptId).toBeTruthy();

      const replay = await call('POST', `/api/payments/${intentId}/simulate-callback`, cookie, {
        status: 'succeeded',
      });
      expect(replay.json().accepted).toBe(false);
      expect(replay.json().reason).toBe('already_succeeded');

      const refund = await call('POST', `/api/payments/${intentId}/refund`, cookie, {
        key: randomUUID(),
        reason: 'Duplicate service charge reversed by the clinic',
      });
      expect(refund.statusCode, refund.body).toBe(200);
      expect(refund.json().state).toBe('reversed');
      expect(refund.json().refund.status).toBe('succeeded');
    });

    it('answers only from authorized records and requires confirmation for actions', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      await addAllocation({ userId, walletId, source: 'personal_savings', amountMinor: '5000' });
      const billId = await payableBill(userId, 8000);

      const status = await call('POST', '/api/assistant/ask', cookie, {
        tool: 'explain_bill_status',
        billId,
      });
      expect(status.statusCode, status.body).toBe(200);
      expect(status.json().answer.outcome).toBe('answered');
      expect(status.json().answer.groundedOn).toContain('bill.status');

      const funds = await call('POST', '/api/assistant/ask', cookie, {
        tool: 'explain_funding_sources',
        billId,
      });
      expect(funds.json().answer.outcome).toBe('answered');
      expect(funds.json().answer.text).toContain('shortfall');

      const fees = await call('POST', '/api/assistant/ask', cookie, { tool: 'explain_fees' });
      expect(fees.json().answer.outcome).toBe('answered');
      expect(fees.json().answer.groundedOn).toContain('fee_schedule.lines');

      const prep = await call('POST', '/api/assistant/ask', cookie, {
        tool: 'prepare_support_request',
        billId,
        supportKind: 'shortfall_support',
        supportReason: 'Cannot cover the remaining shortfall this month',
      });
      expect(prep.json().answer.outcome).toBe('needs_confirmation');
      const confirmationId = prep.json().answer.confirmation.id;
      expect(confirmationId).toBeTruthy();

      const confirmed = await call('POST', '/api/assistant/confirm', cookie, { confirmationId });
      expect(confirmed.statusCode, confirmed.body).toBe(200);
      expect(confirmed.json().status).toBe('confirmed');
      const open = (
        await pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM support_requests WHERE bill_id=$1 AND status='open'",
          [billId],
        )
      ).rows[0];
      expect(open.count).toBe('1');
    });

    it('applies program changes only after an independent authorized approval', async () => {
      const sponsor = await makeMemberCookie('program_manager');
      const approver = await makeMemberCookie('organization_admin', approverId);
      const finance = await makeMemberCookie('finance_operator', financeId);

      const created = await call('POST', '/api/governance/programs', sponsor, {
        organizationId: sponsorOrgId,
        name: 'Partners Test Program',
        currency: 'LRD',
        allowedCategories: ['outpatient'],
      });
      expect(created.statusCode, created.body).toBe(200);
      expect(created.json().program.status).toBe('pending_approval');
      const programId = created.json().program.id;
      const createApproval = created.json().approval.id;

      const badApprove = await call(
        'POST',
        `/api/governance/approvals/${createApproval}/decide`,
        sponsor,
        { approve: true, note: 'self approval attempt' },
      );
      expect(badApprove.statusCode).toBe(403);

      const approved = await call(
        'POST',
        `/api/governance/approvals/${createApproval}/decide`,
        approver,
        { approve: true, note: 'reviewed the program terms in full' },
      );
      expect(approved.statusCode, approved.body).toBe(200);
      expect(approved.json().applied).toBe(true);

      const budgetProposal = await call('POST', `/api/programs/${programId}/changes`, sponsor, {
        changeType: 'budget',
        payload: { budgetMinor: '100000' },
      });
      expect(budgetProposal.statusCode, budgetProposal.body).toBe(200);
      const budgetApproval = budgetProposal.json().approval.id;

      const wrongRole = await call(
        'POST',
        `/api/governance/approvals/${budgetApproval}/decide`,
        approver,
        { approve: true, note: 'not the finance role' },
      );
      expect(wrongRole.statusCode).toBe(403);

      const budgetApplied = await call(
        'POST',
        `/api/governance/approvals/${budgetApproval}/decide`,
        finance,
        { approve: true, note: 'budget confirmed against the sponsor commitment' },
      );
      expect(budgetApplied.statusCode, budgetApplied.body).toBe(200);
      expect(budgetApplied.json().applied).toBe(true);

      const report = await call('GET', `/api/governance/programs/${programId}/report`, sponsor);
      expect(report.statusCode, report.body).toBe(200);
      expect(report.json().program.status).toBe('active');
      expect(report.json().budget.budgetMinor).toBe('100000');
      expect(Array.isArray(report.json().beneficiaryAllocations)).toBe(true);
    });

    async function makeMemberCookie(role: string, existing?: string): Promise<string> {
      if (existing) return session(existing);
      const userId = randomUUID();
      phoneCounter += 1;
      await pool.query('INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,$3)', [
        userId,
        `+99976${String(phoneCounter).padStart(6, '0')}`,
        `Partners ${role}`,
      ]);
      await pool.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,$3,'active')",
        [sponsorOrgId, userId, role],
      );
      return session(userId);
    }

    it('reports partner module availability honestly and never fakes USSD', async () => {
      const { cookie } = await makeCustomer();
      const modules = await call('GET', '/api/partners/modules', cookie);
      expect(modules.statusCode, modules.body).toBe(200);
      const byModule = Object.fromEntries(
        modules.json().modules.map((m: { module: string }) => [m.module, m]),
      );
      expect(byModule.health_credit.availability).toBe('simulated');
      expect(byModule.insurance.availability).toBe('simulated');
      expect(byModule.rewards.availability).toBe('simulated');
      expect(byModule.ussd.availability).toBe('unavailable');

      const ussd = await call('POST', '/api/partners/ussd/session', cookie, {
        phone: '+231770000000',
        input: '',
      });
      expect(ussd.statusCode).toBe(503);
    });

    it('supports credit terms, acceptance, repayment tracking and appeals', async () => {
      const { userId, walletId, cookie } = await makeCustomer();
      const creditId = await makeCreditOffer(userId, walletId, 'LRD');
      const accepted = await call('POST', `/api/partners/credit/${creditId}/accept`, cookie);
      expect(accepted.statusCode, accepted.body).toBe(200);
      expect(accepted.json().status).toBe('accepted');

      const repaid = await call('POST', `/api/partners/credit/${creditId}/repayments`, cookie, {
        amountMinor: '40000',
      });
      expect(repaid.statusCode, repaid.body).toBe(200);
      expect(repaid.json().status).toBe('repaid');

      const appeal = await call('POST', `/api/partners/credit/${creditId}/appeals`, cookie, {
        reason: 'The recorded balance does not match my statement',
      });
      expect(appeal.statusCode, appeal.body).toBe(200);
      expect(appeal.json().status).toBe('appealed');
    });

    it('reports only verified insurance coverage and prepares claims for review', async () => {
      const { userId, cookie } = await makeCustomer();
      const billId = await payableBill(userId, 12000);
      const policyId = randomUUID();
      await pool.query(
        `INSERT INTO insurance_policies(id,insurer_organization_id,beneficiary_user_id,policy_number,status,coverage,verified_method)
         VALUES($1,$2,$3,'POL-1','active',$4,'partner_api')`,
        [policyId, seedId('partner'), userId, JSON.stringify({ outpatient: true })],
      );

      const coverage = await call(
        'GET',
        `/api/partners/insurance/coverage?billId=${billId}`,
        cookie,
      );
      expect(coverage.statusCode, coverage.body).toBe(200);
      expect(coverage.json().available).toBe(true);
      expect(coverage.json().policies[0].verified).toBe(true);

      const claim = await call('POST', '/api/partners/insurance/claims', cookie, {
        billId,
        policyId,
        amountMinor: '12000',
      });
      expect(claim.statusCode, claim.body).toBe(200);
      expect(claim.json().status).toBe('insurer_review');
      expect(String(claim.json().message)).toContain('not an approval');
    });

    it('accrues, lists, expires and redeems sponsor-funded rewards through the ledger', async () => {
      await makeMemberCookie('program_manager');
      const sponsor = await session(await firstProgramManager());
      const programId = randomUUID();
      await pool.query(
        `INSERT INTO programs(id,organization_id,name,currency,status,allowed_categories,max_per_payment_minor,budget_minor)
         VALUES($1,$2,'Rewards Program','LRD','active',ARRAY['outpatient'],50000,100000)`,
        [programId, sponsorOrgId],
      );
      const rule = await call('POST', '/api/partners/rewards/rules', sponsor, {
        programId,
        kind: 'per_transaction_bps',
        bps: 500,
      });
      expect(rule.statusCode, rule.body).toBe(200);
      const ruleId = rule.json().rule.id;

      const { userId, cookie } = await makeCustomer();
      const accrue = await call('POST', '/api/partners/rewards/accrue', sponsor, {
        ruleId,
        beneficiaryUserId: userId,
        baseAmountMinor: '10000',
      });
      expect(accrue.statusCode, accrue.body).toBe(200);
      expect(accrue.json().amountMinor).toBe('500');
      const allocationId = accrue.json().allocationId;

      const rewards = await call('GET', '/api/partners/rewards', cookie);
      expect(rewards.json().entries.length).toBeGreaterThan(0);

      const billId = await payableBill(userId, 500);
      const redeem = await call('POST', '/api/partners/rewards/redeem', cookie, {
        allocationId,
        billId,
        amountMinor: '500',
      });
      expect(redeem.statusCode, redeem.body).toBe(200);
      expect(redeem.json().paymentIntentId).toBeTruthy();
    });

    async function firstProgramManager(): Promise<string> {
      return (
        await pool.query<{ user_id: string }>(
          "SELECT user_id FROM organization_memberships WHERE organization_id=$1 AND role='program_manager' AND status='active' LIMIT 1",
          [sponsorOrgId],
        )
      ).rows[0].user_id;
    }

    async function makeCreditOffer(
      userId: string,
      walletId: string,
      currency: string,
    ): Promise<string> {
      const allocationId = await addAllocation({
        userId,
        walletId,
        source: 'partner_credit',
        amountMinor: '40000',
        bucket: 'pending',
      });
      const creditId = randomUUID();
      await pool.query(
        `INSERT INTO credit_records(id,allocation_id,partner_organization_id,beneficiary_user_id,currency,principal_minor,fee_minor,status,terms_version,terms,due_at)
         VALUES($1,$2,$3,$4,$5,40000,0,'offered','test-v1',$6,now()+interval '90 days')`,
        [
          creditId,
          allocationId,
          seedId('partner'),
          userId,
          currency,
          JSON.stringify({
            installments: [],
            aprNote: 'Sandbox terms',
            restrictedToHealthcare: true,
          }),
        ],
      );
      return creditId;
    }
  },
);

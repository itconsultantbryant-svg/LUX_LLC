import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from '../../build-app.js';
import { createDb } from '../../db/client.js';
import { createAdapters } from '../../adapters/index.js';
import { loadEnv } from '../../config/env.js';
import { tokenHash } from '../identity/service.js';
import { LedgerService } from '../ledger/service.js';
import { seedCore, seedId } from '../ledger/seed.js';
import { FundingService } from './service.js';
import { SandboxFundingAdapter } from '../../adapters/funding.js';
describe.skipIf(process.env.FUNDING_DATABASE_TESTS !== '1')(
  'funding workflows on PostgreSQL',
  () => {
    let pool: pg.Pool,
      admin: pg.Pool,
      app: Awaited<ReturnType<typeof buildApp>>,
      service: FundingService;
    const schema = `funding_test_${randomUUID().replaceAll('-', '')}`;
    let ownerCookie: string, payerCookie: string;
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
      const ledger = new LedgerService(pool);
      await seedCore(ledger, 'test');
      service = new FundingService(ledger, new SandboxFundingAdapter(), 'test');
      const env = loadEnv({ ...process.env, STORAGE_ADAPTER: 'local', LOG_LEVEL: 'error' });
      app = await buildApp({ env, pool, db: createDb(pool), adapters: createAdapters(env) });
      async function session(user: string) {
        const token = randomBytes(32).toString('hex');
        await pool.query(
          "INSERT INTO auth_sessions(user_id,token_hash,auth_method,expires_at) VALUES($1,$2,'sandbox',now()+interval '1 hour')",
          [user, tokenHash(token)],
        );
        return `hw_session=${token}`;
      }
      ownerCookie = await session(seedId('customer'));
      payerCookie = await session(seedId('family'));
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
    });
    let requestNumber = 0;
    async function post(path: string, body: unknown, cookie = ownerCookie) {
      return app.inject({
        method: 'POST',
        url: path,
        headers: { cookie },
        remoteAddress: `127.0.0.${(++requestNumber % 200) + 1}`,
        payload: body as Record<string, unknown>,
      });
    }
    async function link() {
      const r = await post('/api/funding/links', {
        key: randomUUID(),
        label: 'M. Test',
        currencies: ['LRD', 'USD'],
        categories: ['medication'],
        expiresInDays: 30,
      });
      expect(r.statusCode, r.body).toBe(200);
      return r.json();
    }
    async function quote(token?: string) {
      const r = await post(
        '/api/funding/quotes',
        {
          key: randomUUID(),
          kind: token ? 'contribution' : 'deposit',
          amountMinor: '12345',
          currency: 'LRD',
          ...(token ? { token } : {}),
        },
        token ? payerCookie : ownerCookie,
      );
      expect(r.statusCode, r.body).toBe(200);
      return r.json();
    }
    async function authorize(p: { id: string }, cookie = ownerCookie) {
      const r = await post(`/api/funding/payments/${p.id}/authorize`, { accepted: true }, cookie);
      expect(r.statusCode, r.body).toBe(200);
      return r.json();
    }
    async function balance() {
      return (
        await pool.query(
          `SELECT COALESCE(sum(a.balance_minor),0)::text AS balance FROM ledger_accounts a JOIN funding_allocations f ON f.id=a.allocation_id WHERE f.beneficiary_user_id=$1 AND a.currency='LRD' AND a.bucket='available'`,
          [seedId('customer')],
        )
      ).rows[0].balance;
    }
    it('resolves limited identity publicly without medical data and blocks anonymous financial actions', async () => {
      const l = await link();
      expect(l.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const r = await post('/api/funding/resolve', { token: l.token }, '');
      expect(r.statusCode).toBe(200);
      expect(Object.keys(r.json()).sort()).toEqual(
        [
          'beneficiaryLabel',
          'capabilities',
          'categories',
          'currencies',
          'expiresAt',
          'restrictions',
        ].sort(),
      );
      expect((await post('/api/funding/quotes', { key: randomUUID() }, '')).statusCode).toBe(401);
    });
    it('pending and failed deposits never change available funds or issue receipts', async () => {
      const before = await balance(),
        p = await quote();
      await authorize(p);
      expect(await balance()).toBe(before);
      for (const status of ['pending', 'failed']) {
        const r = await post(`/api/funding/payments/${p.id}/simulate`, {
          eventId: randomUUID(),
          status,
        });
        expect(r.statusCode, r.body).toBe(200);
        expect(await balance()).toBe(before);
      }
      expect(
        (
          await app.inject({
            url: `/api/funding/payments/${p.id}/receipt`,
            headers: { cookie: ownerCookie },
          })
        ).statusCode,
      ).toBe(404);
    });
    it('concurrent duplicate confirmations credit only the intended beneficiary exactly once', async () => {
      const l = await link(),
        p = await quote(l.token);
      await authorize(p, payerCookie);
      const before = BigInt(await balance());
      const eventId = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          post(
            `/api/funding/payments/${p.id}/simulate`,
            { eventId: i < 3 ? eventId : randomUUID(), status: 'confirmed' },
            payerCookie,
          ),
        ),
      );
      for (const r of responses) expect(r.statusCode, r.body).toBe(200);
      expect(BigInt(await balance()) - before).toBe(12345n);
      const rows = (
        await pool.query(
          'SELECT f.beneficiary_user_id,f.allowed_categories,p.journal_id FROM funding_payments p JOIN funding_allocations f ON f.id=p.allocation_id WHERE p.id=$1',
          [p.id],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].beneficiary_user_id).toBe(seedId('customer'));
      expect(rows[0].allowed_categories).toEqual(['medication']);
      const receipt = await app.inject({
        url: `/api/funding/payments/${p.id}/receipt`,
        headers: { cookie: payerCookie },
      });
      expect(receipt.statusCode).toBe(200);
      expect(receipt.json().receiptNumber).toBe(`HWF-${p.id}`);
      expect(receipt.json().settlementVerified).toBe(false);
      // Confirmation also issues exactly one universal receipt and notifies the
      // payer (and, for a contribution, the beneficiary).
      const universal = (
        await pool.query(
          "SELECT kind,direction,to_user_id FROM transaction_receipts WHERE detail->>'paymentId'=$1",
          [p.id],
        )
      ).rows;
      expect(universal).toHaveLength(1);
      expect(universal[0].kind).toBe('contribution');
      expect(universal[0].direction).toBe('credit');
      expect(universal[0].to_user_id).toBe(seedId('customer'));
      const notices = (
        await pool.query(
          'SELECT user_id,template FROM notifications WHERE idempotency_key=$1 OR idempotency_key=$2',
          [`funding-confirmed:${p.id}`, `funding-received:${p.id}`],
        )
      ).rows;
      expect(notices).toHaveLength(2);
      expect(notices.map((n) => n.template).sort()).toEqual([
        'contribution.received',
        'contribution.sent',
      ]);
      await expect(
        pool.query("UPDATE funding_events SET outcome='failed' WHERE payment_id=$1", [p.id]),
      ).rejects.toThrow();
      await expect(
        pool.query('UPDATE funding_payments SET amount_minor=1 WHERE id=$1', [p.id]),
      ).rejects.toThrow();
      await post(
        `/api/funding/payments/${p.id}/simulate`,
        { eventId: randomUUID(), status: 'failed' },
        payerCookie,
      );
      expect(BigInt(await balance()) - before).toBe(12345n);
    });
    it('binds idempotency to actor and payload; repeated authorization does not initiate twice', async () => {
      const body = { key: randomUUID(), kind: 'deposit', amountMinor: '100', currency: 'USD' };
      const first = await post('/api/funding/quotes', body),
        retry = await post('/api/funding/quotes', body);
      expect(retry.json().id).toBe(first.json().id);
      expect((await post('/api/funding/quotes', { ...body, amountMinor: '200' })).statusCode).toBe(
        409,
      );
      await authorize(first.json());
      await authorize(first.json());
      expect(
        (
          await pool.query('SELECT count(*)::int AS n FROM funding_payments WHERE id=$1', [
            first.json().id,
          ])
        ).rows[0].n,
      ).toBe(1);
    });
    it('revocation blocks new authorizations but allows existing authorized payments to settle', async () => {
      const l = await link(),
        p = await quote(l.token),
        other = await quote(l.token);
      await authorize(p, payerCookie);
      expect((await post(`/api/funding/links/${l.id}/revoke`, {})).statusCode).toBe(200);
      expect((await post('/api/funding/resolve', { token: l.token }, '')).statusCode).toBe(404);
      expect(
        (await post(`/api/funding/payments/${other.id}/authorize`, { accepted: true }, payerCookie))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await post(
            `/api/funding/payments/${p.id}/simulate`,
            { eventId: randomUUID(), status: 'confirmed' },
            payerCookie,
          )
        ).statusCode,
      ).toBe(200);
    });
    it('rejects unsupported amounts, currencies and cross-user goal or payment access', async () => {
      for (const amountMinor of ['1.5', '0', '-1', '1e3', '9223372036854775808'])
        expect(
          (
            await post('/api/funding/quotes', {
              key: randomUUID(),
              kind: 'deposit',
              amountMinor,
              currency: 'LRD',
            })
          ).statusCode,
        ).toBe(400);
      expect(
        (
          await post('/api/funding/quotes', {
            key: randomUUID(),
            kind: 'deposit',
            amountMinor: '100',
            currency: 'EUR',
          })
        ).statusCode,
      ).toBe(400);
      const g = (
        await post('/api/funding/goals', {
          key: randomUUID(),
          label: 'Private',
          currency: 'LRD',
          targetMinor: '1000',
        })
      ).json();
      expect(
        (
          await post(
            '/api/funding/quotes',
            {
              key: randomUUID(),
              kind: 'deposit',
              amountMinor: '100',
              currency: 'LRD',
              goalId: g.id,
            },
            payerCookie,
          )
        ).statusCode,
      ).toBe(404);
      const p = await quote();
      expect(
        (await post(`/api/funding/payments/${p.id}/authorize`, { accepted: true }, payerCookie))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await post(
            `/api/funding/payments/${p.id}/simulate`,
            { eventId: randomUUID(), status: 'confirmed' },
            payerCookie,
          )
        ).statusCode,
      ).toBe(404);
    });
    it('expires support links and quotes and isolates receipt downloads', async () => {
      const c = await pool.connect();
      let expired: { id: string; token: string };
      try {
        expired = await service.createLink(c, seedId('customer'), {
          label: 'Expired',
          currencies: ['LRD'],
          categories: [],
          expiresInDays: -1,
        });
      } finally {
        c.release();
      }
      expect((await post('/api/funding/resolve', { token: expired!.token }, '')).statusCode).toBe(
        404,
      );
      const q = await quote();
      const old = (
        await pool.query(
          `INSERT INTO funding_payments(payer_user_id,beneficiary_user_id,kind,amount_minor,fee_minor,currency,categories,beneficiary_label,adapter_id,adapter_mode,quote_expires_at) SELECT payer_user_id,beneficiary_user_id,kind,amount_minor,fee_minor,currency,categories,beneficiary_label,adapter_id,adapter_mode,now()-interval '1 second' FROM funding_payments WHERE id=$1 RETURNING id`,
          [q.id],
        )
      ).rows[0];
      expect(
        (await post(`/api/funding/payments/${old.id}/authorize`, { accepted: true })).statusCode,
      ).toBe(409);
      await authorize(q);
      await post(`/api/funding/payments/${q.id}/simulate`, {
        eventId: randomUUID(),
        status: 'confirmed',
      });
      expect(
        (
          await app.inject({
            url: `/api/funding/payments/${q.id}/receipt`,
            headers: { cookie: payerCookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ url: '/api/funding', headers: { cookie: payerCookie } }))
          .json()
          .payments.some((p: { id: string }) => p.id === q.id),
      ).toBe(false);
    });
    it('rejects mismatched trusted events and production simulation', async () => {
      const p = await quote();
      await authorize(p);
      const record = (await pool.query('SELECT * FROM funding_payments WHERE id=$1', [p.id]))
        .rows[0];
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await expect(
          service.confirm(c, {
            eventId: randomUUID(),
            paymentId: p.id,
            reference: record.adapter_reference,
            amountMinor: '1',
            currency: 'LRD',
            status: 'confirmed',
          }),
        ).rejects.toThrow('does not match');
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
      const prod = new FundingService(
        new LedgerService(pool),
        new SandboxFundingAdapter(),
        'production',
      );
      expect(prod.capabilities().available).toBe(false);
      expect(() => prod.enabled()).toThrow('live payment provider');
    });
    it('requires guidance consent, explains its basis, permits editing and withdrawal without moving money', async () => {
      const before = await balance();
      const g = (
        await post('/api/funding/goals', {
          key: randomUUID(),
          label: 'Planning',
          currency: 'LRD',
          targetMinor: '10001',
        })
      ).json();
      const b = { key: randomUUID(), goalId: g.id, weeks: 10 };
      expect((await post('/api/funding/guidance', b)).statusCode).toBe(403);
      expect((await post('/api/funding/guidance/consent', { granted: true })).statusCode).toBe(200);
      const result = await post('/api/funding/guidance', b);
      expect(result.statusCode, result.body).toBe(200);
      const rec = (
        await pool.query('SELECT * FROM saving_guidance WHERE id=$1', [result.json().id])
      ).rows[0];
      expect(rec.weekly_minor).toBe('1001');
      expect(rec.basis.confirmedMinor).toBe('0');
      expect(
        (await post(`/api/funding/guidance/${rec.id}`, { action: 'change', weeklyMinor: '50' }))
          .statusCode,
      ).toBe(200);
      await post('/api/funding/guidance/consent', { granted: false });
      expect((await post('/api/funding/guidance', b)).statusCode).toBe(403);
      expect(
        (await pool.query('SELECT status FROM saving_guidance WHERE id=$1', [rec.id])).rows[0]
          .status,
      ).toBe('dismissed');
      expect(await balance()).toBe(before);
    });
  },
);

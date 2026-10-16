import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { LedgerService } from './service.js';
import { seedCore, seedId } from './seed.js';
import { walletSummary } from './wallet.js';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';
import { createAdapters } from '../../adapters/index.js';
import { loadEnv } from '../../config/env.js';
import { tokenHash } from '../identity/service.js';

describe.skipIf(process.env.LEDGER_DATABASE_TESTS !== '1')(
  'double-entry ledger on PostgreSQL',
  () => {
    let pool: pg.Pool, admin: pg.Pool, ledger: LedgerService;
    const schema = `ledger_test_${randomUUID().replaceAll('-', '')}`;
    beforeAll(async () => {
      if (
        process.env.APP_ENV !== 'test' ||
        !new URL(process.env.DATABASE_URL ?? 'http://invalid').pathname.endsWith('_test')
      )
        throw new Error('Use the isolated *_test database.');
      admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
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
      for (const entry of history.entries) {
        const sql = readFileSync(new URL(`${entry.tag}.sql`, folder), 'utf8').replaceAll(
          '"public".',
          `"${schema}".`,
        );
        await pool.query(sql);
      }
      ledger = new LedgerService(pool);
      await seedCore(ledger, 'test');
    });
    afterAll(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
    });
    async function allocation(
      options: {
        currency?: string;
        category?: string;
        expired?: boolean;
        limit?: string;
        dependent?: string;
        program?: boolean;
      } = {},
    ) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO funding_allocations(id,wallet_id,source,currency,beneficiary_user_id,allowed_categories,max_per_payment_minor,dependent_id,expires_at,program_id,program_rule_version) VALUES($1,$2,'personal_savings',$3,$4,$5,$6,$7,CASE WHEN $8 THEN now()-interval '1 day' ELSE now()+interval '1 day' END,$9,$10)`,
        [
          id,
          seedId(options.currency === 'USD' ? 'wallet-usd' : 'wallet-lrd'),
          options.currency ?? 'LRD',
          seedId('customer'),
          options.category ? [options.category] : [],
          options.limit ?? null,
          options.dependent ?? null,
          options.expired ?? false,
          options.program ? seedId('program') : null,
          options.program ? 1 : null,
        ],
      );
      await pool.query(
        `INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) SELECT $1||':'||bucket,$2,$1::uuid,bucket,'liability','credit' FROM unnest(ARRAY['available','reserved','pending','restricted']) bucket`,
        [id, options.currency ?? 'LRD'],
      );
      return id;
    }
    async function intent(amount = '100', category = 'outpatient', currency = 'LRD') {
      const row = await pool.query(
        `WITH bill AS (INSERT INTO bills(customer_user_id,provider_name,provider_organization_id,total_amount_minor,currency,category) VALUES($1,'SYNTHETIC clinic',$2,$3,$4,$5) RETURNING id) INSERT INTO payment_intents(bill_id,amount_minor,currency,status,adapter_mode,idempotency_key) SELECT id,$3,$4,'awaiting_auth','sandbox',$6 FROM bill RETURNING id`,
        [seedId('customer'), seedId('clinic'), amount, currency, category, randomUUID()],
      );
      return row.rows[0].id as string;
    }
    const credit = (
      id: string,
      amount = '100',
      bucket: 'available' | 'pending' | 'restricted' = 'available',
      currency = 'LRD',
      key = randomUUID(),
    ) =>
      ledger.credit(key, {
        allocationId: id,
        amountMinor: amount,
        currency,
        bucket,
        mode: 'sandbox',
      });
    async function balance(id: string, bucket = 'available') {
      return (
        await pool.query(
          'SELECT balance_minor::text FROM ledger_accounts WHERE allocation_id=$1 AND bucket=$2',
          [id, bucket],
        )
      ).rows[0].balance_minor;
    }
    async function account(id: string, bucket = 'available') {
      return (
        await pool.query('SELECT id FROM ledger_accounts WHERE allocation_id=$1 AND bucket=$2', [
          id,
          bucket,
        ])
      ).rows[0].id;
    }
    it('seeds all domains without usable sessions and is idempotent', async () => {
      const before = (await pool.query('SELECT count(*)::int AS n FROM journal_entries')).rows[0].n;
      await seedCore(ledger, 'test');
      expect((await pool.query('SELECT count(*)::int AS n FROM journal_entries')).rows[0].n).toBe(
        before,
      );
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM auth_sessions WHERE expires_at>now()'))
          .rows[0].n,
      ).toBe(0);
      const client = await pool.connect();
      try {
        const summary = await walletSummary(client, seedId('customer'));
        expect(summary.currencies.map((x) => x.currency)).toEqual(['LRD', 'USD']);
        expect(summary.currencies[0].allocations).toHaveLength(6);
        expect(summary.currencies[0].balances).toEqual({
          available: '88000',
          reserved: '4000',
          pending: '60000',
          restricted: '30000',
        });
        expect(summary.partnerFundsVerified).toBe(false);
      } finally {
        client.release();
      }
    });
    it('posts exact amounts beyond JavaScript safe integers and balances every journal', async () => {
      const id = await allocation();
      await credit(id, '9007199254740993');
      expect(await balance(id)).toBe('9007199254740993');
      expect(
        (
          await pool.query(
            `SELECT journal_id FROM journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'debit' THEN amount_minor::numeric ELSE -amount_minor::numeric END)<>0`,
          )
        ).rowCount,
      ).toBe(0);
    });
    it('serializes concurrent retries and rejects changed payloads', async () => {
      const id = await allocation(),
        key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 4 }, () => credit(id, '150', 'available', 'LRD', key)),
      );
      expect(new Set(results.map((x) => x.journalId)).size).toBe(1);
      expect(await balance(id)).toBe('150');
      await expect(credit(id, '151', 'available', 'LRD', key)).rejects.toThrow('different input');
    });
    it('prevents simultaneous requests from overspending', async () => {
      const id = await allocation();
      await credit(id, '100');
      const intents = await Promise.all([intent('80'), intent('80')]);
      const attempts = await Promise.allSettled(
        intents.map((paymentIntentId) =>
          ledger.reserve(randomUUID(), { allocationId: id, paymentIntentId, amountMinor: '80' }),
        ),
      );
      expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(await balance(id)).toBe('20');
      expect(await balance(id, 'reserved')).toBe('80');
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM funding_reservations WHERE allocation_id=$1',
            [id],
          )
        ).rows[0].n,
      ).toBe(1);
    });
    it('rejects fractional money, mixed currency and unbalanced raw SQL atomically', async () => {
      const lrd = await allocation(),
        usd = await allocation({ currency: 'USD' });
      expect(() => credit(lrd, '1.1')).toThrow('integer minor');
      await expect(
        ledger.post(randomUUID(), {
          currency: 'LRD',
          operation: 'adjustment',
          description: 'SYNTHETIC invalid currency',
          lines: [
            { accountId: await account(lrd), side: 'debit', amountMinor: '1' },
            { accountId: await account(usd), side: 'credit', amountMinor: '1' },
          ],
        }),
      ).rejects.toThrow('mixed currencies');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = await client.query(
          "INSERT INTO journal_entries(currency,operation,description,idempotency_key,request_hash) VALUES('LRD','adjustment','SYNTHETIC invalid',$1,$2) RETURNING id",
          [randomUUID(), 'a'.repeat(64)],
        );
        await client.query(
          "INSERT INTO journal_lines(journal_id,account_id,side,amount_minor,currency) VALUES($1,$2,'credit',1,'LRD')",
          [row.rows[0].id, await account(lrd)],
        );
        await expect(
          client.query("UPDATE journal_entries SET status='posted' WHERE id=$1", [row.rows[0].id]),
        ).rejects.toThrow('debits must equal credits');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      expect(await balance(lrd)).toBe('0');
    });
    it('keeps posted headers, lines and balances immutable and corrects by reversal', async () => {
      const id = await allocation(),
        original = await credit(id, '500');
      await expect(
        pool.query("UPDATE journal_entries SET description='edited' WHERE id=$1", [
          original.journalId,
        ]),
      ).rejects.toThrow('immutable');
      await expect(
        pool.query('DELETE FROM journal_lines WHERE journal_id=$1', [original.journalId]),
      ).rejects.toThrow('immutable');
      await expect(
        pool.query('UPDATE ledger_accounts SET balance_minor=0 WHERE allocation_id=$1', [id]),
      ).rejects.toThrow('only change through posting');
      const key = randomUUID();
      const a = await ledger.reverse(key, {
        journalId: original.journalId,
        reason: 'SYNTHETIC correction',
      });
      expect(
        await ledger.reverse(key, {
          journalId: original.journalId,
          reason: 'SYNTHETIC correction',
        }),
      ).toEqual(a);
      expect(await balance(id)).toBe('0');
      await expect(
        ledger.reverse(randomUUID(), {
          journalId: original.journalId,
          reason: 'duplicate reversal',
        }),
      ).rejects.toThrow();
    });
    it('does not spend pending, restricted, expired or ineligible funding', async () => {
      const paymentIntentId = await intent('100', 'pharmacy');
      for (const kind of ['pending', 'restricted', 'expired', 'category', 'dependent'] as const) {
        const id = await allocation({
          expired: kind === 'expired',
          category: kind === 'category' ? 'outpatient' : undefined,
          dependent: kind === 'dependent' ? seedId('dependent') : undefined,
        });
        await credit(id, '100', kind === 'pending' || kind === 'restricted' ? kind : 'available');
        await expect(
          ledger.reserve(randomUUID(), { allocationId: id, paymentIntentId, amountMinor: '50' }),
        ).rejects.toThrow();
        expect(await balance(id, 'reserved')).toBe('0');
      }
    });
    it('enforces aggregate payment caps across reservations', async () => {
      const id = await allocation({ limit: '60' });
      await credit(id, '100');
      const paymentIntentId = await intent('100');
      await ledger.reserve(randomUUID(), { allocationId: id, paymentIntentId, amountMinor: '40' });
      await expect(
        ledger.reserve(randomUUID(), { allocationId: id, paymentIntentId, amountMinor: '30' }),
      ).rejects.toThrow('per-payment limit');
      expect(await balance(id)).toBe('60');
    });
    it('captures atomically and idempotently without claiming partner settlement', async () => {
      const id = await allocation();
      await credit(id, '100');
      const paymentIntentId = await intent('100');
      await ledger.reserve(randomUUID(), { allocationId: id, paymentIntentId, amountMinor: '100' });
      const key = randomUUID();
      const captured = await ledger.capture(key, { paymentIntentId });
      expect(await ledger.capture(key, { paymentIntentId })).toEqual(captured);
      expect(await balance(id, 'reserved')).toBe('0');
      expect(
        (await pool.query('SELECT status FROM payment_intents WHERE id=$1', [paymentIntentId]))
          .rows[0].status,
      ).toBe('ledger_captured');
      expect(
        (
          await pool.query(
            'SELECT status,confirmed_at FROM partner_settlements WHERE payment_intent_id=$1',
            [paymentIntentId],
          )
        ).rows,
      ).toEqual([{ status: 'expected', confirmed_at: null }]);
      await expect(ledger.capture(randomUUID(), { paymentIntentId })).rejects.toThrow(
        'unavailable',
      );
    });
    it('releases once and rejects capture of an expired reservation', async () => {
      const id = await allocation();
      await credit(id, '100');
      const paymentIntentId = await intent('100');
      const hold = await ledger.reserve(randomUUID(), {
        allocationId: id,
        paymentIntentId,
        amountMinor: '100',
      });
      await pool.query(
        "UPDATE funding_reservations SET expires_at=now()-interval '1 second' WHERE id=$1",
        [hold.reservationId],
      );
      await expect(ledger.capture(randomUUID(), { paymentIntentId })).rejects.toThrow('expired');
      const key = randomUUID();
      const released = await ledger.release(key, { reservationId: hold.reservationId });
      expect(await ledger.release(key, { reservationId: hold.reservationId })).toEqual(released);
      expect(await balance(id)).toBe('100');
      await expect(
        ledger.release(randomUUID(), { reservationId: hold.reservationId }),
      ).rejects.toThrow('no longer active');
    });
    it('enforces program-wide caps and rejects stale rules', async () => {
      const a = await allocation({ program: true }),
        b = await allocation({ program: true });
      await credit(a, '20000');
      await credit(b, '20000');
      const paymentIntentId = await intent('30000');
      await ledger.reserve(randomUUID(), {
        allocationId: a,
        paymentIntentId,
        amountMinor: '15000',
      });
      await expect(
        ledger.reserve(randomUUID(), { allocationId: b, paymentIntentId, amountMinor: '6000' }),
      ).rejects.toThrow('per-payment limit');
      await expect(
        pool.query('UPDATE programs SET max_per_payment_minor=30000 WHERE id=$1', [
          seedId('program'),
        ]),
      ).rejects.toThrow('new version');
      await pool.query(
        'UPDATE programs SET max_per_payment_minor=30000,rule_version=2 WHERE id=$1',
        [seedId('program')],
      );
      await expect(
        ledger.reserve(randomUUID(), { allocationId: b, paymentIntentId, amountMinor: '1000' }),
      ).rejects.toThrow('rules have changed');
    });
    it('converts only with two balanced journals and an exact quote, atomically', async () => {
      const from = await allocation(),
        to = await allocation({ currency: 'USD' });
      await credit(from, '1000');
      const key = randomUUID(),
        input = {
          fromAllocationId: from,
          toAllocationId: to,
          fromAmountMinor: '200',
          toAmountMinor: '100',
          rate: '0.5',
          quoteReference: 'SYNTHETIC-QUOTE',
        };
      const conversion = await ledger.convert(key, input);
      expect(await ledger.convert(key, input)).toEqual(conversion);
      expect(await balance(from)).toBe('800');
      expect(await balance(to)).toBe('100');
      await expect(
        ledger.convert(randomUUID(), { ...input, toAmountMinor: '101' }),
      ).rejects.toThrow('exact minor-unit quote');
      expect(await balance(from)).toBe('800');
      expect(await balance(to)).toBe('100');
      await expect(
        pool.query('DELETE FROM currency_conversions WHERE id=$1', [conversion.conversionId]),
      ).rejects.toThrow('immutable');
    });
    it('returns wallet records only for the authenticated owner through the API', async () => {
      const env = loadEnv({
        DATABASE_URL: process.env.DATABASE_URL,
        APP_ENV: 'test',
        STORAGE_ADAPTER: 'local',
        LOG_LEVEL: 'fatal',
      });
      const app = await buildApp({ pool, db: createDb(pool), env, adapters: createAdapters(env) });
      const ownerToken = 'a'.repeat(64),
        otherToken = 'b'.repeat(64);
      await pool.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method) VALUES($1,$2,now()+interval '1 hour','sandbox'),($3,$4,now()+interval '1 hour','sandbox')",
        [tokenHash(ownerToken), seedId('customer'), tokenHash(otherToken), seedId('family')],
      );
      try {
        expect((await app.inject({ method: 'GET', url: '/api/wallet' })).statusCode).toBe(401);
        const own = await app.inject({
          method: 'GET',
          url: '/api/wallet',
          headers: { cookie: `hw_session=${ownerToken}` },
        });
        expect(own.statusCode).toBe(200);
        expect(own.json().currencies).toHaveLength(2);
        const other = await app.inject({
          method: 'GET',
          url: `/api/wallet?ownerUserId=${seedId('customer')}`,
          headers: { cookie: `hw_session=${otherToken}` },
        });
        expect(other.statusCode).toBe(200);
        expect(other.json().currencies).toEqual([]);
      } finally {
        await app.close();
      }
    });
    it('reconciles cached balances to immutable journal lines', async () => {
      expect(
        (
          await pool.query(
            `SELECT a.id FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries j ON j.id=l.journal_id GROUP BY a.id HAVING a.balance_minor::numeric<>coalesce(sum(CASE WHEN j.status='posted' THEN CASE WHEN l.side=a.normal_side THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END ELSE 0 END),0)`,
          )
        ).rowCount,
      ).toBe(0);
    });
  },
);

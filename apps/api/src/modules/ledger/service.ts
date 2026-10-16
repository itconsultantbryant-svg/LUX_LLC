import { createHash } from 'node:crypto';
import type pg from 'pg';

export const buckets = ['available', 'reserved', 'pending', 'restricted'] as const;
export type Bucket = (typeof buckets)[number];
export type JournalLine = { accountId: string; side: 'debit' | 'credit'; amountMinor: string };
export type JournalInput = {
  currency: string;
  operation: string;
  description: string;
  lines: JournalLine[];
  reversalOf?: string;
  referenceType?: string;
  referenceId?: string;
  actorUserId?: string;
};
export class LedgerError extends Error {}
export function money(value: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value))
    throw new LedgerError('Use positive integer minor units encoded as a decimal string.');
  const amount = BigInt(value);
  if (amount > 9223372036854775807n) throw new LedgerError('Amount exceeds the supported range.');
  return amount;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
function hash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function currency(value: string) {
  if (!/^[A-Z]{3}$/.test(value)) throw new LedgerError('Invalid currency.');
}

/** Internal trusted service. Callers must authorize the business operation before invoking it. */
function validateCredit(input: { amountMinor: string; currency: string; bucket: string }) {
  money(input.amountMinor);
  currency(input.currency);
  if (!['available', 'pending', 'restricted'].includes(input.bucket))
    throw new LedgerError('Invalid funding bucket.');
}
export class LedgerService {
  constructor(readonly pool: pg.Pool) {}
  async operation<T>(
    key: string,
    name: string,
    input: unknown,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 200)
      throw new LedgerError('An idempotency key of at most 200 characters is required.');
    const digest = hash({ name, input });
    const client = await this.pool.connect();
    try {
      await client.query(
        "BEGIN; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='120s'",
      );
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('financial:'||$1,0))", [
        key,
      ]);
      const prior = await client.query(
        'SELECT request_hash,result FROM financial_operations WHERE idempotency_key=$1',
        [key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== digest)
          throw new LedgerError('Idempotency key was already used with different input.');
        await client.query('COMMIT');
        return prior.rows[0].result as T;
      }
      const result = await work(client);
      await client.query(
        'INSERT INTO financial_operations(idempotency_key,request_hash,operation,result) VALUES($1,$2,$3,$4)',
        [key, digest, name, JSON.stringify(result)],
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async postInTransaction(
    client: pg.PoolClient,
    key: string,
    input: JournalInput,
  ): Promise<{ journalId: string }> {
    currency(input.currency);
    if (input.lines.length < 2 || input.lines.length > 100)
      throw new LedgerError('A journal requires 2–100 lines.');
    let net = 0n;
    for (const line of input.lines) {
      if (!['debit', 'credit'].includes(line.side)) throw new LedgerError('Invalid journal side.');
      net += money(line.amountMinor) * (line.side === 'debit' ? 1n : -1n);
    }
    if (net !== 0n) throw new LedgerError('Journal debits must equal credits.');
    const result = await client.query(
      `INSERT INTO journal_entries(currency,operation,description,idempotency_key,request_hash,reversal_of,reference_type,reference_id,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        input.currency,
        input.operation,
        input.description,
        key,
        hash(input),
        input.reversalOf ?? null,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.actorUserId ?? null,
      ],
    );
    const journalId = result.rows[0].id as string;
    await client.query(
      `INSERT INTO journal_lines(journal_id,account_id,side,amount_minor,currency) SELECT $1,x."accountId"::uuid,x.side,x."amountMinor"::bigint,$2 FROM jsonb_to_recordset($3::jsonb) AS x("accountId" text,side text,"amountMinor" text)`,
      [journalId, input.currency, JSON.stringify(input.lines)],
    );
    await client.query("UPDATE journal_entries SET status='posted' WHERE id=$1", [journalId]);
    await client.query(
      "INSERT INTO audit_events(actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,'ledger.posted','journal',$2,$3)",
      [
        input.actorUserId ?? null,
        journalId,
        JSON.stringify({ operation: input.operation, currency: input.currency }),
      ],
    );
    return { journalId };
  }
  post(key: string, input: JournalInput) {
    const normalized = {
      ...input,
      lines: [...input.lines].sort((a, b) =>
        `${a.accountId}:${a.side}:${a.amountMinor}`.localeCompare(
          `${b.accountId}:${b.side}:${b.amountMinor}`,
        ),
      ),
    };
    return this.operation(key, 'post', normalized, (client) =>
      this.postInTransaction(client, key, normalized),
    );
  }
  async account(client: pg.PoolClient, allocationId: string, bucket: Bucket): Promise<string> {
    const row = await client.query(
      'SELECT id FROM ledger_accounts WHERE allocation_id=$1 AND bucket=$2',
      [allocationId, bucket],
    );
    if (!row.rows[0]) throw new LedgerError('Allocation account not found.');
    return row.rows[0].id;
  }
  async clearing(
    client: pg.PoolClient,
    currencyCode: string,
    type: 'receivable' | 'payable' | 'fx',
  ): Promise<string> {
    const row = await client.query(
      `INSERT INTO ledger_accounts(code,currency,kind,normal_side,allow_negative) VALUES($1,$2,$3,$4,true) ON CONFLICT(code) DO NOTHING RETURNING id`,
      [
        `${type === 'fx' ? 'currency_exchange' : `partner_${type}`}:${currencyCode}`,
        currencyCode,
        type !== 'payable' ? 'asset' : 'liability',
        type !== 'payable' ? 'debit' : 'credit',
      ],
    );
    if (row.rows[0]) return row.rows[0].id;
    return (
      await client.query('SELECT id FROM ledger_accounts WHERE code=$1', [
        `${type === 'fx' ? 'currency_exchange' : `partner_${type}`}:${currencyCode}`,
      ])
    ).rows[0].id;
  }
  /** Creates ledger credit only. It does NOT attest to a partner's cash balance or settlement. */
  credit(
    key: string,
    input: {
      allocationId: string;
      amountMinor: string;
      currency: string;
      bucket: Exclude<Bucket, 'reserved'>;
      mode: 'sandbox' | 'live';
    },
  ) {
    validateCredit(input);
    return this.operation(key, 'credit', input, (client) => this.creditWithin(client, key, input));
  }
  /**
   * Credit within a caller-managed transaction. Used when the allocation is
   * created in the same transaction (e.g. a reward accrual), so a separate
   * connection would not see the uncommitted allocation.
   */
  async creditWithin(
    client: pg.PoolClient,
    key: string,
    input: {
      allocationId: string;
      amountMinor: string;
      currency: string;
      bucket: Exclude<Bucket, 'reserved'>;
      mode: 'sandbox' | 'live';
    },
  ) {
    validateCredit(input);
    const allocation = (
      await client.query('SELECT * FROM funding_allocations WHERE id=$1 FOR SHARE', [
        input.allocationId,
      ])
    ).rows[0];
    if (!allocation || allocation.currency !== input.currency || allocation.status !== 'active')
      throw new LedgerError('Allocation is unavailable or currency mismatched.');
    const credit = await this.account(client, input.allocationId, input.bucket);
    const debit = await this.clearing(client, input.currency, 'receivable');
    const posted = await this.postInTransaction(client, key, {
      currency: input.currency,
      operation: 'funding_credit',
      description: 'Platform funding allocation; partner settlement unconfirmed',
      referenceType: 'allocation',
      referenceId: input.allocationId,
      lines: [
        { accountId: debit, side: 'debit', amountMinor: input.amountMinor },
        { accountId: credit, side: 'credit', amountMinor: input.amountMinor },
      ],
    });
    await client.query(
      "INSERT INTO partner_settlements(journal_id,direction,amount_minor,currency,status,adapter_mode) VALUES($1,'inbound',$2,$3,'expected',$4)",
      [posted.journalId, input.amountMinor, input.currency, input.mode],
    );
    return posted;
  }
  /** Deliberate internal adjustment, not a public way to unlock pending/restricted funds. */
  move(
    key: string,
    input: {
      allocationId: string;
      from: Bucket;
      to: Bucket;
      amountMinor: string;
      currency: string;
      reason: string;
    },
  ) {
    money(input.amountMinor);
    if (
      input.from === input.to ||
      input.from === 'reserved' ||
      input.to === 'reserved' ||
      !buckets.includes(input.from) ||
      !buckets.includes(input.to) ||
      !input.reason.trim()
    )
      throw new LedgerError(
        'Use the reservation lifecycle for reserved funds and supply a reason.',
      );
    return this.operation(key, 'move', input, async (client) => {
      const from = await this.account(client, input.allocationId, input.from),
        to = await this.account(client, input.allocationId, input.to);
      return this.postInTransaction(client, key, {
        currency: input.currency,
        operation: 'bucket_adjustment',
        description: input.reason,
        referenceType: 'allocation',
        referenceId: input.allocationId,
        lines: [
          { accountId: from, side: 'debit', amountMinor: input.amountMinor },
          { accountId: to, side: 'credit', amountMinor: input.amountMinor },
        ],
      });
    });
  }
  private async eligible(
    client: pg.PoolClient,
    allocationId: string,
    intentId: string,
    amount: bigint,
  ) {
    const intent = (
      await client.query(
        `SELECT p.*,b.customer_user_id,b.dependent_id,b.provider_organization_id,b.category,b.total_amount_minor AS bill_amount FROM payment_intents p JOIN bills b ON b.id=p.bill_id WHERE p.id=$1 FOR UPDATE OF p,b`,
        [intentId],
      )
    ).rows[0];
    if (!intent || ['paid', 'failed', 'cancelled', 'ledger_captured'].includes(intent.status))
      throw new LedgerError('Payment intent is unavailable.');
    if (intent.adapter_mode === 'live')
      await client.query('SELECT assert_provider_payable($1)', [intent.bill_id]);
    if (BigInt(intent.amount_minor) > BigInt(intent.bill_amount ?? 0))
      throw new LedgerError('Payment exceeds the bill amount.');
    const allocation = (
      await client.query(
        'SELECT *,now() AS database_now FROM funding_allocations WHERE id=$1 FOR SHARE',
        [allocationId],
      )
    ).rows[0];
    if (
      !allocation ||
      allocation.currency !== intent.currency ||
      allocation.beneficiary_user_id !== intent.customer_user_id ||
      allocation.dependent_id !== intent.dependent_id
    )
      throw new LedgerError('Funding beneficiary, dependent or currency does not match.');
    const now = new Date(allocation.database_now).getTime();
    const checkTerms = (terms: typeof allocation, active: string) => {
      if (
        terms.status !== active ||
        (terms.starts_at && new Date(terms.starts_at).getTime() > now) ||
        (terms.expires_at && new Date(terms.expires_at).getTime() <= now)
      )
        throw new LedgerError('Funding is inactive or expired.');
      if (terms.allowed_categories.length && !terms.allowed_categories.includes(intent.category))
        throw new LedgerError('This category is not permitted by the allocation.');
      if (
        terms.allowed_provider_ids.length &&
        !terms.allowed_provider_ids.includes(intent.provider_organization_id)
      )
        throw new LedgerError('This provider is not permitted by the allocation.');
      // Unknown program rules fail closed until an explicit evaluator exists.
      if (Object.keys(terms.rules).length)
        throw new LedgerError('This allocation requires additional program rule review.');
    };
    checkTerms(allocation, 'active');
    let program;
    if (allocation.program_id) {
      program = (
        await client.query('SELECT * FROM programs WHERE id=$1 FOR SHARE', [allocation.program_id])
      ).rows[0];
      if (
        !program ||
        program.rule_version !== allocation.program_rule_version ||
        program.currency !== intent.currency
      )
        throw new LedgerError('Program rules have changed; review the allocation.');
      checkTerms(program, 'active');
    }
    const cap = async (limit: string | null, programId?: string) => {
      if (!limit) return;
      const used = (
        await client.query(
          `SELECT coalesce(sum(r.amount_minor),0)::text AS amount FROM funding_reservations r JOIN funding_allocations f ON f.id=r.allocation_id WHERE r.payment_intent_id=$1 AND r.status IN ('active','captured') AND ${programId ? 'f.program_id=$2' : 'f.id=$2'}`,
          [intentId, programId ?? allocationId],
        )
      ).rows[0].amount;
      if (BigInt(used) + amount > BigInt(limit))
        throw new LedgerError('Funding exceeds the per-payment limit.');
    };
    await cap(allocation.max_per_payment_minor);
    if (program) await cap(program.max_per_payment_minor, allocation.program_id);
    return { intent, allocation };
  }
  reserve(
    key: string,
    input: { allocationId: string; paymentIntentId: string; amountMinor: string },
  ) {
    return this.operation(key, 'reserve', input, (client) =>
      this.reserveWithin(client, key, input),
    );
  }
  /**
   * Reserve within a caller-managed transaction. Callers are responsible for
   * atomicity and idempotency (e.g. an enclosing `withSession` transaction).
   */
  async reserveWithin(
    client: pg.PoolClient,
    key: string,
    input: { allocationId: string; paymentIntentId: string; amountMinor: string },
  ) {
    const amount = money(input.amountMinor);
    const { intent, allocation } = await this.eligible(
      client,
      input.allocationId,
      input.paymentIntentId,
      amount,
    );
    const sum = (
      await client.query(
        "SELECT coalesce(sum(amount_minor),0)::text AS amount FROM funding_reservations WHERE payment_intent_id=$1 AND status IN ('active','captured')",
        [input.paymentIntentId],
      )
    ).rows[0].amount;
    if (BigInt(sum) + amount > BigInt(intent.amount_minor))
      throw new LedgerError('Reservation exceeds the payment intent.');
    const from = await this.account(client, input.allocationId, 'available'),
      to = await this.account(client, input.allocationId, 'reserved');
    const posted = await this.postInTransaction(client, key, {
      currency: intent.currency,
      operation: 'reserve',
      description: 'Reserve healthcare payment',
      referenceType: 'payment_intent',
      referenceId: input.paymentIntentId,
      lines: [
        { accountId: from, side: 'debit', amountMinor: input.amountMinor },
        { accountId: to, side: 'credit', amountMinor: input.amountMinor },
      ],
    });
    const row = await client.query(
      `INSERT INTO funding_reservations(allocation_id,payment_intent_id,amount_minor,currency,reserve_journal_id,expires_at) VALUES($1,$2,$3,$4,$5,least(now()+interval '15 minutes',coalesce($6::timestamptz,'infinity'::timestamptz))) RETURNING id`,
      [
        input.allocationId,
        input.paymentIntentId,
        input.amountMinor,
        intent.currency,
        posted.journalId,
        allocation.expires_at,
      ],
    );
    return { ...posted, reservationId: row.rows[0].id as string };
  }
  release(key: string, input: { reservationId: string }) {
    return this.operation(key, 'release', input, async (client) => {
      const initial = (
        await client.query('SELECT payment_intent_id FROM funding_reservations WHERE id=$1', [
          input.reservationId,
        ])
      ).rows[0];
      if (!initial) throw new LedgerError('Reservation not found.');
      await client.query('SELECT id FROM payment_intents WHERE id=$1 FOR UPDATE', [
        initial.payment_intent_id,
      ]);
      const row = (
        await client.query('SELECT * FROM funding_reservations WHERE id=$1 FOR UPDATE', [
          input.reservationId,
        ])
      ).rows[0];
      if (row.status !== 'active') throw new LedgerError('Reservation is no longer active.');
      const terms = (
        await client.query(
          'SELECT *,now() AS database_now FROM funding_allocations WHERE id=$1 FOR SHARE',
          [row.allocation_id],
        )
      ).rows[0];
      const expired =
        terms.status !== 'active' ||
        (terms.expires_at && new Date(terms.expires_at) <= new Date(terms.database_now));
      const from = await this.account(client, row.allocation_id, 'reserved'),
        to = await this.account(client, row.allocation_id, expired ? 'restricted' : 'available');
      const posted = await this.postInTransaction(client, key, {
        currency: row.currency,
        operation: 'release',
        description: 'Release payment reservation',
        referenceType: 'reservation',
        referenceId: row.id,
        lines: [
          { accountId: from, side: 'debit', amountMinor: row.amount_minor },
          { accountId: to, side: 'credit', amountMinor: row.amount_minor },
        ],
      });
      await client.query(
        "UPDATE funding_reservations SET status='released',terminal_journal_id=$2 WHERE id=$1",
        [row.id, posted.journalId],
      );
      return posted;
    });
  }
  capture(key: string, input: { paymentIntentId: string }) {
    return this.operation(key, 'capture', input, (client) =>
      this.captureWithin(client, key, input.paymentIntentId),
    );
  }
  /**
   * Capture within a caller-managed transaction (e.g. a verified payment
   * callback). Idempotent: refuses a second capture of the same intent.
   */
  async captureWithin(client: pg.PoolClient, key: string, paymentIntentId: string) {
    const intent = (
      await client.query('SELECT * FROM payment_intents WHERE id=$1 FOR UPDATE', [paymentIntentId])
    ).rows[0];
    if (
      !intent ||
      ['ledger_captured', 'paid', 'succeeded', 'failed', 'cancelled', 'reversed'].includes(
        intent.status,
      )
    )
      throw new LedgerError('Payment intent is unavailable.');
    const rows = (
      await client.query(
        "SELECT *,expires_at<=now() AS expired FROM funding_reservations WHERE payment_intent_id=$1 AND status='active' ORDER BY id FOR UPDATE",
        [intent.id],
      )
    ).rows;
    if (
      !rows.length ||
      rows.some((row) => row.expired) ||
      rows.reduce((total, row) => total + BigInt(row.amount_minor), 0n) !==
        BigInt(intent.amount_minor)
    )
      throw new LedgerError('Payment must be fully reserved and reservations must not be expired.');
    const lines: JournalLine[] = [];
    for (const row of rows) {
      await this.eligible(client, row.allocation_id, intent.id, 0n);
      lines.push({
        accountId: await this.account(client, row.allocation_id, 'reserved'),
        side: 'debit',
        amountMinor: row.amount_minor,
      });
    }
    lines.push({
      accountId: await this.clearing(client, intent.currency, 'payable'),
      side: 'credit',
      amountMinor: String(intent.amount_minor),
    });
    const posted = await this.postInTransaction(client, key, {
      currency: intent.currency,
      operation: 'capture',
      description: 'Ledger capture; partner settlement unconfirmed',
      referenceType: 'payment_intent',
      referenceId: intent.id,
      lines,
    });
    await client.query(
      "UPDATE funding_reservations SET status='captured',terminal_journal_id=$2 WHERE payment_intent_id=$1 AND status='active'",
      [intent.id, posted.journalId],
    );
    await client.query(
      "UPDATE payment_intents SET status='ledger_captured',updated_at=now() WHERE id=$1",
      [intent.id],
    );
    await client.query(
      "INSERT INTO partner_settlements(payment_intent_id,journal_id,direction,amount_minor,currency,status,adapter_mode) VALUES($1,$2,'outbound',$3,$4,'expected',$5)",
      [intent.id, posted.journalId, intent.amount_minor, intent.currency, intent.adapter_mode],
    );
    return posted;
  }
  convert(
    key: string,
    input: {
      fromAllocationId: string;
      toAllocationId: string;
      fromAmountMinor: string;
      toAmountMinor: string;
      rate: string;
      quoteReference: string;
    },
  ) {
    money(input.fromAmountMinor);
    money(input.toAmountMinor);
    if (!/^(0|[1-9][0-9]{0,18})(\.[0-9]{1,18})?$/.test(input.rate) || !input.quoteReference.trim())
      throw new LedgerError('An exact minor-unit rate and quote reference are required.');
    return this.operation(key, 'convert', input, async (client) => {
      const allocations = (
        await client.query(
          'SELECT *,now() AS database_now FROM funding_allocations WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',
          [[input.fromAllocationId, input.toAllocationId]],
        )
      ).rows;
      const from = allocations.find((row) => row.id === input.fromAllocationId),
        to = allocations.find((row) => row.id === input.toAllocationId);
      if (
        !from ||
        !to ||
        from.currency === to.currency ||
        from.beneficiary_user_id !== to.beneficiary_user_id
      )
        throw new LedgerError('Conversion requires two currencies for the same beneficiary.');
      for (const row of [from, to]) {
        if (
          row.source !== 'personal_savings' ||
          row.status !== 'active' ||
          row.dependent_id ||
          row.program_id ||
          row.allowed_categories.length ||
          row.allowed_provider_ids.length ||
          row.max_per_payment_minor ||
          Object.keys(row.rules).length ||
          (row.expires_at && new Date(row.expires_at) <= new Date(row.database_now)) ||
          (row.starts_at && new Date(row.starts_at) > new Date(row.database_now))
        )
          throw new LedgerError('Only unrestricted personal savings may be converted.');
      }
      const exchange = new Map<string, string>();
      for (const code of [from.currency, to.currency].sort())
        exchange.set(code, await this.clearing(client, code, 'fx'));
      const sourceAccount = await this.account(client, from.id, 'available');
      const destinationAccount = await this.account(client, to.id, 'available');
      await client.query(
        'SELECT id FROM ledger_accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',
        [[sourceAccount, destinationAccount, ...exchange.values()]],
      );
      const source = await this.postInTransaction(client, `${key}:from`, {
        currency: from.currency,
        operation: 'currency_conversion',
        description: 'Explicit quoted currency conversion',
        lines: [
          {
            accountId: sourceAccount,
            side: 'debit',
            amountMinor: input.fromAmountMinor,
          },
          {
            accountId: exchange.get(from.currency)!,
            side: 'credit',
            amountMinor: input.fromAmountMinor,
          },
        ],
      });
      const destination = await this.postInTransaction(client, `${key}:to`, {
        currency: to.currency,
        operation: 'currency_conversion',
        description: 'Explicit quoted currency conversion',
        lines: [
          {
            accountId: exchange.get(to.currency)!,
            side: 'debit',
            amountMinor: input.toAmountMinor,
          },
          {
            accountId: destinationAccount,
            side: 'credit',
            amountMinor: input.toAmountMinor,
          },
        ],
      });
      const result = await client.query(
        'INSERT INTO currency_conversions(from_currency,to_currency,from_amount_minor,to_amount_minor,rate,quote_reference,from_journal_id,to_journal_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [
          from.currency,
          to.currency,
          input.fromAmountMinor,
          input.toAmountMinor,
          input.rate,
          input.quoteReference,
          source.journalId,
          destination.journalId,
          key,
        ],
      );
      return {
        conversionId: result.rows[0].id as string,
        fromJournalId: source.journalId,
        toJournalId: destination.journalId,
      };
    });
  }
  /**
   * Restore captured funds to their funding allocations after a confirmed
   * refund. This is a reviewed payment adjustment, not a detachment of the
   * original capture journal, so the ledger keeps both records.
   */
  refund(key: string, input: { paymentIntentId: string; amountMinor: string; reason: string }) {
    return this.operation(key, 'refund', input, (client) => this.refundWithin(client, key, input));
  }
  /**
   * Refund inside a caller-managed transaction (e.g. a provider refund route
   * that already holds row locks on the intent through its session).
   */
  async refundWithin(
    client: pg.PoolClient,
    key: string,
    input: { paymentIntentId: string; amountMinor: string; reason: string },
  ): Promise<{ journalId: string }> {
    const refundAmount = money(input.amountMinor);
    if (!input.reason.trim()) throw new LedgerError('A refund reason is required.');
    const intent = (
      await client.query('SELECT * FROM payment_intents WHERE id=$1 FOR UPDATE', [
        input.paymentIntentId,
      ])
    ).rows[0];
    if (!intent) throw new LedgerError('Payment intent not found.');
    if (!['succeeded', 'ledger_captured', 'paid'].includes(intent.status))
      throw new LedgerError('Only a captured payment can be refunded.');
    const prior = (
      await client.query(
        "SELECT id FROM journal_entries WHERE reference_type='refund' AND reference_id=$1 LIMIT 1",
        [intent.id],
      )
    ).rows[0];
    if (prior) throw new LedgerError('This payment has already been refunded.');
    const reservations = (
      await client.query(
        "SELECT * FROM funding_reservations WHERE payment_intent_id=$1 AND status='captured' ORDER BY id FOR UPDATE",
        [intent.id],
      )
    ).rows;
    if (!reservations.length) throw new LedgerError('No captured reservations to restore.');
    const capturedTotal = reservations.reduce((total, row) => total + BigInt(row.amount_minor), 0n);
    if (refundAmount > capturedTotal) throw new LedgerError('Refund exceeds the captured amount.');
    const lines: JournalLine[] = [
      {
        accountId: await this.clearing(client, intent.currency, 'payable'),
        side: 'debit',
        amountMinor: refundAmount.toString(),
      },
    ];
    let remaining = refundAmount;
    for (let index = 0; index < reservations.length; index += 1) {
      const row = reservations[index];
      const portion =
        index === reservations.length - 1
          ? remaining
          : (BigInt(row.amount_minor) * refundAmount) / capturedTotal;
      if (portion <= 0n) continue;
      lines.push({
        accountId: await this.account(client, row.allocation_id, 'available'),
        side: 'credit',
        amountMinor: portion.toString(),
      });
      remaining -= portion;
    }
    if (remaining !== 0n) throw new LedgerError('Refund could not be allocated exactly.');
    const posted = await this.postInTransaction(client, key, {
      currency: intent.currency,
      operation: 'payment_refund',
      description: input.reason,
      referenceType: 'refund',
      referenceId: intent.id,
      lines,
    });
    await client.query(
      "UPDATE funding_reservations SET status='refunded' WHERE payment_intent_id=$1 AND status='captured'",
      [intent.id],
    );
    await client.query(
      "UPDATE payment_intents SET status='reversed',updated_at=now() WHERE id=$1",
      [intent.id],
    );
    return posted;
  }
  reverse(key: string, input: { journalId: string; reason: string }) {
    if (!input.reason.trim()) throw new LedgerError('A reversal reason is required.');
    return this.operation(key, 'reverse', input, async (client) => {
      const original = (
        await client.query(
          "SELECT * FROM journal_entries WHERE id=$1 AND status='posted' FOR SHARE",
          [input.journalId],
        )
      ).rows[0];
      if (!original) throw new LedgerError('Posted journal not found.');
      if (['reserve', 'release', 'capture', 'currency_conversion'].includes(original.operation))
        throw new LedgerError(
          'Use the reservation lifecycle or a reviewed payment adjustment; do not detach a payment from its journal.',
        );
      const rows = (
        await client.query(
          'SELECT account_id,side,amount_minor FROM journal_lines WHERE journal_id=$1',
          [input.journalId],
        )
      ).rows;
      return this.postInTransaction(client, key, {
        currency: original.currency,
        operation: 'reversal',
        description: input.reason,
        reversalOf: input.journalId,
        lines: rows.map((row) => ({
          accountId: row.account_id,
          side: row.side === 'debit' ? 'credit' : 'debit',
          amountMinor: row.amount_minor,
        })),
      });
    });
  }
}

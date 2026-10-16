import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import type { FundingAdapter, FundingEvent } from '../../adapters/funding.js';
import { IdentityError } from '../identity/service.js';
import { LedgerService, buckets, money } from '../ledger/service.js';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const restrictions =
  'Healthcare payments only; no cash withdrawal. Contributions do not grant access to medical records. Link expiry stops new authorizations; already authorized payments may still settle.';
export const simulationLabel =
  'SIMULATION — no real money moves. International transfers are simulated, not a live remittance service.';
export const unavailable = () =>
  new IdentityError(404, 'This record or support link is unavailable, expired, or revoked.');
export class FundingService {
  constructor(
    readonly ledger: LedgerService,
    readonly adapter: FundingAdapter,
    readonly environment: string,
  ) {}
  enabled() {
    if (
      this.adapter.mode === 'sandbox' &&
      !['development', 'test', 'demo'].includes(this.environment)
    )
      throw new IdentityError(
        503,
        'Funding is unavailable until a live payment provider is configured.',
      );
  }
  capabilities() {
    const enabled =
      this.adapter.mode === 'live' || ['development', 'test', 'demo'].includes(this.environment);
    return {
      available: enabled,
      currencies: enabled ? this.adapter.currencies : [],
      international: enabled && this.adapter.international,
      mode: this.adapter.mode,
      label: this.adapter.mode === 'sandbox' ? simulationLabel : 'Provider-confirmed payments',
      restrictions,
    };
  }
  // Runs within the caller's authenticated transaction. Authorization is checked before cache reads.
  async once<T>(
    c: pg.PoolClient,
    actor: string,
    key: string,
    name: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    const id = `funding:${actor}:${key}`;
    const hash = digest(JSON.stringify({ name, input }));
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id]);
    const prior = (
      await c.query(
        'SELECT request_hash,result FROM financial_operations WHERE idempotency_key=$1',
        [id],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_hash !== hash)
        throw new IdentityError(
          409,
          'This request key was used for different details. Start a new request.',
        );
      return prior.result;
    }
    const result = await work();
    await c.query(
      'INSERT INTO financial_operations(idempotency_key,request_hash,operation,result) VALUES($1,$2,$3,$4)',
      [id, hash, name, JSON.stringify(result)],
    );
    return result;
  }
  async link(c: pg.PoolClient, token: string) {
    const link = (
      await c.query(
        `SELECT l.* FROM support_links l JOIN users u ON u.id=l.owner_user_id WHERE l.token_hash=$1 AND l.revoked_at IS NULL AND l.expires_at>now() AND u.suspended_at IS NULL FOR SHARE OF l,u`,
        [digest(token)],
      )
    ).rows[0];
    if (!link) throw unavailable();
    return link;
  }
  async createLink(
    c: pg.PoolClient,
    owner: string,
    input: { label: string; currencies: string[]; categories: string[]; expiresInDays: number },
  ) {
    const token = randomBytes(32).toString('base64url');
    const result = (
      await c.query(
        `INSERT INTO support_links(owner_user_id,token_hash,beneficiary_label,currencies,categories,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 day') RETURNING id,expires_at`,
        [
          owner,
          digest(token),
          input.label,
          input.currencies,
          input.categories,
          input.expiresInDays,
        ],
      )
    ).rows[0];
    return { ...result, token };
  }
  async quote(
    c: pg.PoolClient,
    payer: string,
    input: {
      kind: 'deposit' | 'contribution';
      amountMinor: string;
      currency: string;
      token?: string;
      goalId?: string;
      international: boolean;
    },
  ) {
    this.enabled();
    money(input.amountMinor);
    if (
      !this.adapter.currencies.includes(input.currency) ||
      (input.international && !this.adapter.international)
    )
      throw new IdentityError(
        400,
        'This provider does not support the selected currency or transfer type.',
      );
    let beneficiary = payer,
      label = 'Your HealthWallet',
      categories: string[] = [],
      linkId = null;
    if (input.kind === 'contribution') {
      if (!input.token || input.goalId)
        throw new IdentityError(400, 'A valid support link is required.');
      const link = await this.link(c, input.token);
      if (!link.currencies.includes(input.currency))
        throw new IdentityError(400, 'This support link does not accept that currency.');
      beneficiary = link.owner_user_id;
      label = link.beneficiary_label;
      categories = link.categories;
      linkId = link.id;
    } else if (input.token)
      throw new IdentityError(400, 'Deposits cannot target another beneficiary.');
    if (input.goalId) {
      const goal = (
        await c.query(
          'SELECT id FROM saving_goals WHERE id=$1 AND owner_user_id=$2 AND currency=$3 FOR SHARE',
          [input.goalId, payer, input.currency],
        )
      ).rows[0];
      if (!goal) throw unavailable();
    }
    const fee = this.adapter.fee(input.amountMinor, input.currency);
    if (BigInt(fee) < 0n || BigInt(input.amountMinor) + BigInt(fee) > 9223372036854775807n)
      throw new IdentityError(400, 'The total exceeds provider limits.');
    const payment = (
      await c.query(
        `INSERT INTO funding_payments(payer_user_id,beneficiary_user_id,goal_id,support_link_id,kind,amount_minor,fee_minor,currency,categories,beneficiary_label,adapter_id,adapter_mode,international,quote_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()+interval '10 minutes') RETURNING *`,
        [
          payer,
          beneficiary,
          input.goalId ?? null,
          linkId,
          input.kind,
          input.amountMinor,
          fee,
          input.currency,
          categories,
          label,
          this.adapter.id,
          this.adapter.mode,
          input.international,
        ],
      )
    ).rows[0];
    return this.view(payment);
  }
  view(p: Record<string, unknown>) {
    return {
      id: p.id,
      kind: p.kind,
      amountMinor: p.amount_minor,
      feeMinor: p.fee_minor,
      totalMinor: (BigInt(String(p.amount_minor)) + BigInt(String(p.fee_minor))).toString(),
      currency: p.currency,
      status: p.status,
      beneficiaryLabel: p.beneficiary_label,
      categories: p.categories,
      restrictions,
      mode: p.adapter_mode,
      international: p.international,
      simulationLabel: p.adapter_mode === 'sandbox' ? simulationLabel : null,
      quoteExpiresAt: p.quote_expires_at,
      confirmedAt: p.confirmed_at,
      createdAt: p.created_at,
      receiptNumber: p.status === 'confirmed' ? `HWF-${p.id}` : null,
    };
  }
  async authorize(c: pg.PoolClient, payer: string, id: string) {
    this.enabled();
    const p = (
      await c.query(
        'SELECT *,quote_expires_at>now() AS valid FROM funding_payments WHERE id=$1 AND payer_user_id=$2 FOR UPDATE',
        [id, payer],
      )
    ).rows[0];
    if (!p) throw unavailable();
    if (p.status !== 'quoted') return this.view(p);
    if (!p.valid)
      throw new IdentityError(409, 'This quote expired. Review a new quote before authorizing.');
    if (p.support_link_id) {
      const link = (
        await c.query(
          'SELECT id FROM support_links WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',
          [p.support_link_id],
        )
      ).rows[0];
      if (!link) throw unavailable();
    }
    const beneficiary = (
      await c.query('SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL FOR SHARE', [
        p.beneficiary_user_id,
      ])
    ).rows[0];
    if (!beneficiary) throw unavailable();
    if (p.adapter_id !== this.adapter.id || p.adapter_mode !== this.adapter.mode)
      throw new IdentityError(409, 'Provider configuration changed. Request a new quote.');
    // Adapter must use paymentId as its provider idempotency key. Retry after a timeout is safe.
    const result = await this.adapter.initiate({
      paymentId: p.id,
      amountMinor: (BigInt(p.amount_minor) + BigInt(p.fee_minor)).toString(),
      currency: p.currency,
    });
    const updated = (
      await c.query(
        "UPDATE funding_payments SET status='pending',adapter_reference=$2,authorized_at=now() WHERE id=$1 RETURNING *",
        [id, result.reference],
      )
    ).rows[0];
    return this.view(updated);
  }
  /** Trusted adapter events only. Never expose this method directly to an unauthenticated JSON body. */
  async confirm(c: pg.PoolClient, event: FundingEvent) {
    this.enabled();
    const p = (
      await c.query('SELECT * FROM funding_payments WHERE id=$1 FOR UPDATE', [event.paymentId])
    ).rows[0];
    if (
      !p ||
      p.status === 'quoted' ||
      p.adapter_id !== this.adapter.id ||
      p.adapter_mode !== this.adapter.mode ||
      p.adapter_reference !== event.reference ||
      p.currency !== event.currency ||
      (BigInt(p.amount_minor) + BigInt(p.fee_minor)).toString() !== event.amountMinor
    )
      throw new IdentityError(409, 'Payment event does not match an authorized payment.');
    const hash = digest(JSON.stringify(event));
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${this.adapter.id}:${event.eventId}`,
    ]);
    const prior = (
      await c.query('SELECT payload_hash FROM funding_events WHERE provider=$1 AND event_id=$2', [
        this.adapter.id,
        event.eventId,
      ])
    ).rows[0];
    if (prior && prior.payload_hash !== hash)
      throw new IdentityError(409, 'Conflicting provider event.');
    if (prior) return this.view(p);
    await c.query(
      'INSERT INTO funding_events(provider,event_id,payment_id,payload_hash,outcome) VALUES($1,$2,$3,$4,$5)',
      [this.adapter.id, event.eventId, p.id, hash, event.status],
    );
    if (p.status === 'confirmed') return this.view(p); // Late failures never undo a confirmed credit.
    if (event.status !== 'confirmed') {
      if (p.status === 'pending' && event.status === 'failed')
        await c.query("UPDATE funding_payments SET status='failed' WHERE id=$1", [p.id]);
      return this.view({ ...p, status: p.status === 'failed' ? 'failed' : event.status });
    }
    // A late authoritative success can reconcile a failed attempt, still exactly once.
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `funding-wallet:${p.beneficiary_user_id}:${p.currency}`,
    ]);
    let wallet = (
      await c.query(
        'SELECT id FROM wallets WHERE owner_user_id=$1 AND currency=$2 ORDER BY created_at,id LIMIT 1',
        [p.beneficiary_user_id, p.currency],
      )
    ).rows[0];
    if (!wallet)
      wallet = (
        await c.query('INSERT INTO wallets(owner_user_id,currency) VALUES($1,$2) RETURNING id', [
          p.beneficiary_user_id,
          p.currency,
        ])
      ).rows[0];
    const allocation = (
      await c.query(
        `INSERT INTO funding_allocations(wallet_id,beneficiary_user_id,currency,source,allowed_categories) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [
          wallet.id,
          p.beneficiary_user_id,
          p.currency,
          p.kind === 'deposit' ? 'personal_savings' : 'family_contributions',
          p.categories,
        ],
      )
    ).rows[0];
    for (const bucket of buckets)
      await c.query(
        `INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) VALUES($1,$2,$3,$4,'liability','credit')`,
        [`funding:${p.id}:${bucket}`, p.currency, allocation.id, bucket],
      );
    const debit = await this.ledger.clearing(c, p.currency, 'receivable');
    const credit = await this.ledger.account(c, allocation.id, 'available');
    const posted = await this.ledger.postInTransaction(c, `funding-confirmed:${p.id}`, {
      currency: p.currency,
      operation: 'funding_confirmed',
      description:
        this.adapter.mode === 'sandbox'
          ? 'Simulated confirmed funding; no real funds'
          : 'Provider-confirmed funding',
      referenceType: 'funding_payment',
      referenceId: p.id,
      lines: [
        { accountId: debit, side: 'debit', amountMinor: p.amount_minor },
        { accountId: credit, side: 'credit', amountMinor: p.amount_minor },
      ],
    });
    // Payment confirmation and partner settlement are distinct. A simulation is never cash evidence.
    await c.query(
      `INSERT INTO partner_settlements(journal_id,direction,amount_minor,currency,status,adapter_mode,partner_reference,evidence) VALUES($1,'inbound',$2,$3,'expected',$4,$5,$6)`,
      [
        posted.journalId,
        p.amount_minor,
        p.currency,
        p.adapter_mode,
        p.adapter_reference,
        JSON.stringify({
          paymentEvent: event.eventId,
          simulation: p.adapter_mode === 'sandbox',
          settlementVerified: false,
        }),
      ],
    );
    const updated = (
      await c.query(
        "UPDATE funding_payments SET status='confirmed',confirmed_at=now(),journal_id=$2,allocation_id=$3 WHERE id=$1 RETURNING *",
        [p.id, posted.journalId, allocation.id],
      )
    ).rows[0];
    return this.view(updated);
  }
}

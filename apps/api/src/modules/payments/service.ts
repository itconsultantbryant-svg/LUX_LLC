import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  canTransitionPayment,
  isTerminalPaymentState,
  PAYMENT_SIMULATION_LABEL,
  UNCONFIRMED_SETTLEMENT_NOTE,
  type PaymentState,
} from '@healthwallet/shared';
import type { PaymentAdapter, VerifiedPaymentCallback } from '../../adapters/types.js';
import { IdentityError } from '../identity/service.js';
import { Access } from '../security/access.js';
import { LedgerService } from '../ledger/service.js';
import { NotificationsService } from '../notifications/service.js';
import { ReceiptsService } from '../receipts/service.js';
import { billAccess, latest, ensurePayableIntent } from '../providers/service.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');

const userLabel = async (client: pg.PoolClient, id: string): Promise<string> => {
  const row = (
    await client.query<{ label: string }>(
      'SELECT COALESCE(display_name, phone_e164) AS label FROM users WHERE id=$1',
      [id],
    )
  ).rows[0];
  return row?.label ?? 'Member';
};

export type PaymentIntentRow = {
  id: string;
  bill_id: string;
  amount_minor: string;
  currency: string;
  status: string;
  adapter_mode: 'sandbox' | 'live';
  adapter_reference: string | null;
  simulation_label: string | null;
  authorized_at: Date | null;
  confirmed_at: Date | null;
  failure_code: string | null;
  last_event_sequence: number;
};

export type PaymentView = {
  paymentIntentId: string;
  billId: string;
  state: PaymentState;
  amountMinor: string;
  currency: string;
  adapterMode: 'sandbox' | 'live';
  adapterReference: string | null;
  authorizedAt: string | null;
  confirmedAt: string | null;
  lastEventSequence: number;
  failureCode: string | null;
  receiptId: string | null;
  refund: { id: string; status: string; amountMinor: string } | null;
  simulated: boolean;
  simulationLabel: string | null;
  settlementNote: string;
};

export function stateOf(row: Pick<PaymentIntentRow, 'status'>): PaymentState {
  // The ledger layer marks a captured intent `ledger_captured`; internally that
  // is a pending provider confirmation.
  if (row.status === 'ledger_captured') return 'pending';
  if (row.status === 'awaiting_auth') return 'awaiting_authorization';
  if (row.status === 'paid') return 'succeeded';
  return row.status as PaymentState;
}

/**
 * Provider bill-payment lifecycle. A browser redirect is never trusted: only a
 * signature-verified, replay-protected provider callback may confirm a payment,
 * after which the ledger capture and the receipt are produced together.
 */
export class PaymentsService {
  readonly receipts = new ReceiptsService();
  readonly notifications = new NotificationsService();
  constructor(
    readonly ledger: LedgerService,
    readonly adapter: PaymentAdapter,
    readonly environment: string,
  ) {}

  private enabled() {
    if (
      this.adapter.mode === 'sandbox' &&
      !['development', 'test', 'demo'].includes(this.environment)
    )
      throw new IdentityError(
        503,
        'Provider payments are unavailable until a live payment provider is configured.',
      );
  }

  label(): string | null {
    return this.adapter.mode === 'sandbox' ? PAYMENT_SIMULATION_LABEL : null;
  }

  private async load(a: Access, intentId: string): Promise<PaymentIntentRow> {
    const intent = (
      await a.client.query<PaymentIntentRow>('SELECT * FROM payment_intents WHERE id=$1', [
        intentId,
      ])
    ).rows[0];
    if (!intent) throw new IdentityError(404, 'This payment is unavailable.');
    await billAccess(a, intent.bill_id);
    return intent;
  }

  async view(a: Access, intentId: string): Promise<PaymentView> {
    return this.project(a.client, await this.load(a, intentId));
  }

  private async project(client: pg.PoolClient, row: PaymentIntentRow): Promise<PaymentView> {
    const receipt = (
      await client.query<{ id: string }>(
        "SELECT id FROM receipts WHERE payment_intent_id=$1 AND status='issued'",
        [row.id],
      )
    ).rows[0];
    const refund = (
      await client.query<{ id: string; status: string; amount_minor: string }>(
        'SELECT id,status,amount_minor FROM refunds WHERE payment_intent_id=$1',
        [row.id],
      )
    ).rows[0];
    return {
      paymentIntentId: row.id,
      billId: row.bill_id,
      state: stateOf(row),
      amountMinor: String(row.amount_minor),
      currency: row.currency,
      adapterMode: row.adapter_mode,
      adapterReference: row.adapter_reference,
      authorizedAt: row.authorized_at ? new Date(row.authorized_at).toISOString() : null,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
      lastEventSequence: row.last_event_sequence,
      failureCode: row.failure_code,
      receiptId: receipt?.id ?? null,
      refund: refund
        ? { id: refund.id, status: refund.status, amountMinor: String(refund.amount_minor) }
        : null,
      simulated: row.adapter_mode === 'sandbox',
      simulationLabel: row.simulation_label,
      settlementNote: UNCONFIRMED_SETTLEMENT_NOTE,
    };
  }

  /** Create or reuse the bill's payment intent in `awaiting_authorization`. */
  async initiate(a: Access, billId: string, input: { key: string }): Promise<PaymentView> {
    this.enabled();
    const { bill } = await billAccess(a, billId, true);
    const rev = await latest(a.client, bill.id);
    const intent = await ensurePayableIntent(a.client, bill, rev, {
      adapterMode: this.adapter.mode,
      appEnv: this.environment,
      key: `payment:initiate:${bill.id}:${input.key}`,
    });
    const row = (
      await a.client.query<PaymentIntentRow>('SELECT * FROM payment_intents WHERE id=$1', [
        intent.id,
      ])
    ).rows[0];
    await a.audit('payment.initiated', 'payment_intent', intent.id, {
      created: intent.created,
      state: row.status,
    });
    return this.project(a.client, row);
  }

  /** Customer authorizes and the provider is asked to process the payment. */
  async authorize(a: Access, intentId: string, input: { key: string }): Promise<PaymentView> {
    this.enabled();
    if (!this.adapter.initiatePayment)
      throw new IdentityError(503, 'The payment provider cannot initiate payments.');
    const existing = await this.load(a, intentId);
    const { bill, customer } = await billAccess(a, existing.bill_id, true);
    if (!customer) throw new IdentityError(403, 'Only the customer can authorize this payment.');
    if (stateOf(existing) === 'succeeded' || stateOf(existing) === 'reversed')
      return this.project(a.client, existing);
    if (isTerminalPaymentState(stateOf(existing)))
      throw new IdentityError(409, 'This payment can no longer be authorized.');
    const result = await this.adapter.initiatePayment({
      reference: existing.id,
      amountMinor: String(existing.amount_minor),
      currency: existing.currency,
      idempotencyKey: `payment:authorize:${existing.id}:${input.key}`,
      narrative: `Healthcare payment for bill ${bill.id}`,
    });
    const nextState: PaymentState =
      result.state === 'failed'
        ? 'failed'
        : result.state === 'succeeded'
          ? 'submitted'
          : result.state;
    await a.client.query(
      `UPDATE payment_intents SET status=$2, adapter_reference=$3, simulation_label=$4, authorized_at=coalesce(authorized_at, now()), failure_code=$5, updated_at=now() WHERE id=$1`,
      [
        existing.id,
        nextState,
        result.adapterReference,
        result.simulationLabel ?? this.label(),
        result.state === 'failed' ? 'provider_rejected' : null,
      ],
    );
    await a.audit('payment.authorized', 'payment_intent', existing.id, {
      provider: this.adapter.id,
      state: nextState,
      simulated: this.adapter.mode === 'sandbox',
    });
    const row = (
      await a.client.query<PaymentIntentRow>('SELECT * FROM payment_intents WHERE id=$1', [
        existing.id,
      ])
    ).rows[0];
    return this.project(a.client, row);
  }

  /** Ask the provider for the authoritative status (read-only; never fabricates). */
  async refreshStatus(a: Access, intentId: string): Promise<PaymentView> {
    const intent = await this.load(a, intentId);
    if (!this.adapter.getStatus || isTerminalPaymentState(stateOf(intent)))
      return this.project(a.client, intent);
    const result = await this.adapter.getStatus({
      reference: intent.id,
      adapterReference: intent.adapter_reference,
    });
    await a.audit('payment.status_queried', 'payment_intent', intent.id, {
      providerState: result.state,
    });
    return this.project(a.client, intent);
  }

  /**
   * Verify and apply a provider callback. Safe under duplication, out-of-order
   * delivery, and unverified/absent signatures.
   */
  async handleCallback(
    rawBody: Buffer,
    signature: string | null,
  ): Promise<{ accepted: boolean; reason: string; state: PaymentState | 'unknown' }> {
    if (!this.adapter.verifyCallback)
      return { accepted: false, reason: 'callbacks_unsupported', state: 'unknown' };
    const verified = this.adapter.verifyCallback({ rawBody, signature });
    if (!verified.valid || !verified.event)
      return { accepted: false, reason: verified.reason ?? 'invalid_callback', state: 'unknown' };
    const event = verified.event;
    return this.ledger.operation(
      `payment-callback:${event.provider}:${event.eventId}`,
      'payment_callback',
      event,
      async (client) => this.applyEvent(client, event, rawBody),
    );
  }

  private async applyEvent(
    client: pg.PoolClient,
    event: NonNullable<VerifiedPaymentCallback['event']>,
    rawBody: Buffer,
  ): Promise<{ accepted: boolean; reason: string; state: PaymentState | 'unknown' }> {
    const intent = (
      await client.query<PaymentIntentRow>(
        `SELECT * FROM payment_intents WHERE id::text=$1 OR adapter_reference=$1 ORDER BY (id::text=$1) DESC LIMIT 1 FOR UPDATE`,
        [event.reference],
      )
    ).rows[0];
    if (!intent) return { accepted: false, reason: 'unknown_payment', state: 'unknown' };

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO bill_payment_events(provider,event_id,payment_intent_id,status,sequence,amount_minor,currency,payload_hash,signature_valid,occurred_at,raw)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)
       ON CONFLICT (provider,event_id) DO NOTHING RETURNING id`,
      [
        event.provider,
        event.eventId,
        intent.id,
        event.status,
        event.sequence,
        event.amountMinor,
        event.currency,
        digest(rawBody.toString('utf8')),
        event.occurredAt,
        JSON.stringify(event),
      ],
    );
    if (!inserted.rows[0])
      return { accepted: false, reason: 'duplicate_event', state: stateOf(intent) };
    const eventRowId = inserted.rows[0].id;

    const current = stateOf(intent);
    const incoming = event.status as PaymentState;
    if (event.sequence <= intent.last_event_sequence && event.status !== 'succeeded') {
      await client.query(
        "UPDATE bill_payment_events SET outcome='stale',processed_at=now() WHERE id=$1",
        [eventRowId],
      );
      return { accepted: false, reason: 'stale_event', state: current };
    }
    if (event.status === 'succeeded' && (current === 'succeeded' || current === 'reversed')) {
      await client.query(
        "UPDATE bill_payment_events SET outcome='duplicate_success',processed_at=now() WHERE id=$1",
        [eventRowId],
      );
      return { accepted: false, reason: 'already_succeeded', state: current };
    }
    if (!canTransitionPayment(current, incoming)) {
      await client.query(
        "UPDATE bill_payment_events SET outcome='rejected_transition',processed_at=now() WHERE id=$1",
        [eventRowId],
      );
      return {
        accepted: false,
        reason: `illegal_transition ${current}->${incoming}`,
        state: current,
      };
    }

    if (event.status === 'succeeded') {
      await this.confirmSuccess(client, intent, eventRowId, event);
    } else {
      await client.query(
        `UPDATE payment_intents SET status=$2, failure_code=$3, updated_at=now(), last_event_sequence=greatest(last_event_sequence,$4) WHERE id=$1`,
        [
          intent.id,
          incoming,
          event.status === 'failed' ? (event.reason ?? 'provider_failed') : null,
          event.sequence,
        ],
      );
      await client.query(
        "UPDATE bill_payment_events SET outcome='applied',processed_at=now() WHERE id=$1",
        [eventRowId],
      );
    }
    return { accepted: true, reason: 'applied', state: event.status };
  }

  private async confirmSuccess(
    client: pg.PoolClient,
    intent: PaymentIntentRow,
    eventRowId: string,
    event: NonNullable<VerifiedPaymentCallback['event']>,
  ): Promise<void> {
    const amountMinor = event.amountMinor;
    const sequence = event.sequence;
    if (BigInt(amountMinor) !== BigInt(intent.amount_minor))
      throw new IdentityError(409, 'The confirmed amount does not match the payment intent.');
    await this.ledger.captureWithin(client, `payment:capture:${intent.id}`, intent.id);
    const settlement = (
      await client.query<{ id: string }>(
        'SELECT id FROM partner_settlements WHERE payment_intent_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1',
        [intent.id],
      )
    ).rows[0];
    if (!settlement)
      throw new IdentityError(503, 'Payment capture did not record a settlement reference.');
    // A signature-verified provider callback is the confirmation evidence that
    // makes the outbound settlement citable; the receipt trigger requires it.
    await client.query(
      `UPDATE partner_settlements
          SET status='confirmed', partner_reference=$2, evidence=$3, confirmed_at=now()
        WHERE id=$1 AND status='expected'`,
      [
        settlement.id,
        event.eventId,
        JSON.stringify({
          verified: true,
          provider: event.provider,
          eventId: event.eventId,
          sequence: event.sequence,
          amountMinor: event.amountMinor,
          currency: event.currency,
          occurredAt: event.occurredAt,
        }),
      ],
    );
    const receipt = await client.query<{ id: string }>(
      `INSERT INTO receipts(payment_intent_id,settlement_id,number,amount_minor,currency,status,issued_at)
       VALUES($1,$2,$3,$4,$5,'issued',now())
       ON CONFLICT (payment_intent_id) DO NOTHING RETURNING id`,
      [
        intent.id,
        settlement.id,
        `HWP-${intent.id.slice(0, 8).toUpperCase()}`,
        intent.amount_minor,
        intent.currency,
      ],
    );
    await client.query(
      `UPDATE payment_intents SET status='succeeded', confirmed_at=now(), updated_at=now(), last_event_sequence=greatest(last_event_sequence,$2) WHERE id=$1`,
      [intent.id, sequence],
    );
    await client.query('UPDATE bill_payment_events SET outcome=$2,processed_at=now() WHERE id=$1', [
      eventRowId,
      receipt.rows[0] ? 'applied_receipt_issued' : 'applied_receipt_existing',
    ]);
    await client.query(
      `INSERT INTO audit_events(actor_user_id,event_type,entity_type,entity_id,payload)
       VALUES(NULL,'payment.confirmed','payment_intent',$1,$2)`,
      [
        intent.id,
        JSON.stringify({
          receiptIssued: Boolean(receipt.rows[0]),
          settlementId: settlement.id,
          simulated: intent.adapter_mode === 'sandbox',
        }),
      ],
    );
    // Beyond the provider receipt, every money movement also gets one universal
    // receipt and an in-app notification for the customer who paid.
    const bill = (
      await client.query<{ customer_user_id: string; provider_name: string }>(
        'SELECT customer_user_id, provider_name FROM bills WHERE id=$1',
        [intent.bill_id],
      )
    ).rows[0];
    const universal = await this.receipts.issue(client, {
      kind: 'payment',
      direction: 'debit',
      fromUserId: bill?.customer_user_id ?? null,
      fromLabel: bill ? await userLabel(client, bill.customer_user_id) : 'Member',
      toUserId: null,
      toLabel: bill?.provider_name ?? 'Care provider',
      amountMinor: intent.amount_minor,
      currency: intent.currency,
      reference: intent.id,
      detail: {
        paymentIntentId: intent.id,
        billId: intent.bill_id,
        simulation: intent.adapter_mode === 'sandbox',
      },
    });
    if (bill)
      await this.notifications.notify(client, {
        userId: bill.customer_user_id,
        template: 'payment.succeeded',
        title: 'Payment complete',
        body: `${universal.number} · ${intent.currency} ${intent.amount_minor} to ${bill.provider_name}.`,
        data: {
          receiptId: universal.id,
          receiptNumber: universal.number,
          paymentIntentId: intent.id,
          billId: intent.bill_id,
        },
        idempotencyKey: `payment-succeeded:${intent.id}`,
      });
  }

  /**
   * Refund a captured payment. Only after the provider accepts the refund is the
   * intent moved to `reversed` and the capture's funds restored; the original
   * capture journal is never altered.
   */
  async refund(
    a: Access,
    intentId: string,
    input: { key: string; amountMinor?: string; reason: string },
  ): Promise<PaymentView> {
    const intent = await this.load(a, intentId);
    if (stateOf(intent) !== 'succeeded')
      throw new IdentityError(409, 'Only a succeeded payment can be refunded.');
    const existing = (
      await a.client.query('SELECT id,status FROM refunds WHERE payment_intent_id=$1', [intent.id])
    ).rows[0];
    if (existing)
      return this.project(a.client, {
        ...intent,
        status: existing.status === 'succeeded' ? 'reversed' : intent.status,
      });
    if (!this.adapter.refund)
      throw new IdentityError(503, 'This payment provider does not support refunds.');
    const amountMinor = input.amountMinor ?? String(intent.amount_minor);
    const result = await this.adapter.refund({
      reference: intent.id,
      adapterReference: intent.adapter_reference,
      amountMinor,
      currency: intent.currency,
      idempotencyKey: `payment:refund:${intent.id}:${input.key}`,
      reason: input.reason,
    });
    if (result.state !== 'succeeded')
      throw new IdentityError(409, 'The provider did not accept the refund.');
    const refund = (
      await a.client.query<{ id: string }>(
        "INSERT INTO refunds(payment_intent_id,amount_minor,currency,status,reason,adapter_reference,created_by) VALUES($1,$2,$3,'requested',$4,$5,$6) RETURNING id",
        [
          intent.id,
          amountMinor,
          intent.currency,
          input.reason,
          result.adapterReference,
          a.actor.id,
        ],
      )
    ).rows[0];
    const posted = await this.ledger.refundWithin(a.client, `payment:refund-ledger:${intent.id}`, {
      paymentIntentId: intent.id,
      amountMinor,
      reason: input.reason,
    });
    // A reversed payment restores the allocations it consumed; any single-use
    // voucher that was redeemed into those allocations becomes eligible again.
    await a.client.query(
      `UPDATE vouchers SET status='issued', redeemed_at=NULL
        WHERE status='redeemed'
          AND allocation_id IN (
            SELECT allocation_id FROM funding_reservations
             WHERE payment_intent_id=$1 AND status='refunded'
          )`,
      [intent.id],
    );
    await a.client.query("UPDATE refunds SET status='succeeded',journal_id=$2 WHERE id=$1", [
      refund.id,
      posted.journalId,
    ]);
    await a.audit('payment.refunded', 'payment_intent', intent.id, {
      refundId: refund.id,
      amountMinor,
    });
    // Record the movement back as a universal receipt too: a full refund
    // reverses the original receipt, a partial one issues a linked reversal.
    const original = await this.receipts.byReference(a.client, intent.id);
    const refundBill = (
      await a.client.query<{ customer_user_id: string; provider_name: string }>(
        'SELECT customer_user_id, provider_name FROM bills WHERE id=$1',
        [intent.bill_id],
      )
    ).rows[0];
    if (
      original &&
      original.status === 'completed' &&
      original.amount_minor === String(amountMinor)
    )
      await this.receipts.reverse(a.client, original, a.actor.id, input.reason);
    else
      await this.receipts.issue(a.client, {
        kind: 'reversal',
        direction: 'credit',
        fromUserId: null,
        fromLabel: refundBill?.provider_name ?? 'Care provider',
        toUserId: refundBill?.customer_user_id ?? null,
        toLabel: refundBill ? await userLabel(a.client, refundBill.customer_user_id) : 'Member',
        amountMinor: String(amountMinor),
        currency: intent.currency,
        reference: intent.id,
        reversalOfId: original?.id ?? null,
        detail: {
          paymentIntentId: intent.id,
          partial: true,
          reason: input.reason,
          originalNumber: original?.number ?? null,
        },
      });
    if (refundBill)
      await this.notifications.notify(a.client, {
        userId: refundBill.customer_user_id,
        template: 'payment.refunded',
        title: 'Payment refunded',
        body: `${intent.currency} ${amountMinor} returned to your Health Wallet.`,
        data: { paymentIntentId: intent.id, amountMinor: String(amountMinor) },
        idempotencyKey: `payment-refunded:${intent.id}`,
      });
    const updated = (
      await a.client.query<PaymentIntentRow>('SELECT * FROM payment_intents WHERE id=$1', [
        intent.id,
      ])
    ).rows[0];
    return this.project(a.client, updated);
  }
}

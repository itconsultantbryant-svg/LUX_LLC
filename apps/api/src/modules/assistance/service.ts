import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  ASSISTANCE_PLAN_VERSION,
  type FundingPlan,
  type AssistanceSource,
} from '@healthwallet/shared';
import { IdentityError } from '../identity/service.js';
import { Access } from '../security/access.js';
import { LedgerService } from '../ledger/service.js';
import { billAccess, latest, ensurePayableIntent } from '../providers/service.js';
import { buildFundingPlan, persistPlan } from './engine.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');

export type ApplyResult = {
  paymentIntentId: string;
  reservations: Array<{ allocationId: string; amountMinor: string; reservationId: string }>;
  plan: FundingPlan;
  message: string;
};

/**
 * Funding assistance. Plans are deterministic and read-only; every action that
 * moves money reserves through the ledger, which re-checks allocation
 * restrictions. Nothing here can exceed the payment intent or bypass policy.
 */
export class AssistanceService {
  constructor(
    readonly ledger: LedgerService,
    readonly adapterMode: 'sandbox' | 'live',
    readonly environment: string,
  ) {}

  private enabled() {
    if (
      this.adapterMode === 'sandbox' &&
      !['development', 'test', 'demo'].includes(this.environment)
    )
      throw new IdentityError(
        503,
        'Funding assistance is unavailable until a live payment provider is configured.',
      );
  }

  private async once<T>(
    c: pg.PoolClient,
    actor: string,
    key: string,
    name: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    const id = `assistance:${actor}:${key}`;
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

  /** Build (and snapshot) the current funding plan. Read-only against money. */
  async plan(a: Access, billId: string, persist: boolean): Promise<FundingPlan> {
    this.enabled();
    const { bill } = await billAccess(a, billId);
    const plan = await buildFundingPlan(a.client, bill.id, { simulationLabel: this.label() });
    if (persist) await persistPlan(a.client, plan, a.actor.id);
    return plan;
  }

  private label(): string | null {
    return this.adapterMode === 'sandbox'
      ? 'SIMULATION — funding assistance uses sandbox funds; no real money moves.'
      : null;
  }

  async applyFunds(
    a: Access,
    billId: string,
    input: { key: string; allocationIds?: string[] },
  ): Promise<ApplyResult> {
    this.enabled();
    const { bill, customer } = await billAccess(a, billId, true);
    if (!customer) throw new IdentityError(403, 'The customer must authorize using their funds.');
    return this.once(
      a.client,
      a.actor.id,
      input.key,
      'assistance-apply-funds',
      { billId, allocationIds: input.allocationIds ?? null },
      async () => {
        const rev = await latest(a.client, bill.id);
        const intent = await ensurePayableIntent(a.client, bill, rev, {
          adapterMode: this.adapterMode,
          appEnv: this.environment,
          key: `assistance:${bill.id}:${input.key}`,
        });
        const before = await buildFundingPlan(a.client, bill.id, { simulationLabel: this.label() });
        const targets = before.sources.filter(
          (s: AssistanceSource) =>
            s.eligible && (!input.allocationIds || input.allocationIds.includes(s.allocationId)),
        );
        const reservedSoFar = BigInt(
          (
            await a.client.query<{ amount: string }>(
              "SELECT COALESCE(sum(amount_minor),0)::text AS amount FROM funding_reservations WHERE payment_intent_id=$1 AND status IN ('active','captured')",
              [intent.id],
            )
          ).rows[0].amount,
        );
        let remaining = BigInt(intent.amountMinor) - reservedSoFar;
        const reservations: ApplyResult['reservations'] = [];
        for (const source of targets) {
          if (remaining <= 0n) break;
          const available = BigInt(source.availableMinor);
          const amount = available < remaining ? available : remaining;
          if (amount <= 0n) continue;
          const held = await this.ledger.reserveWithin(
            a.client,
            `assistance:${input.key}:${source.allocationId}`,
            {
              allocationId: source.allocationId,
              paymentIntentId: intent.id,
              amountMinor: amount.toString(),
            },
          );
          reservations.push({
            allocationId: source.allocationId,
            amountMinor: amount.toString(),
            reservationId: held.reservationId,
          });
          remaining -= amount;
        }
        const plan = await buildFundingPlan(a.client, bill.id, { simulationLabel: this.label() });
        await persistPlan(a.client, plan, a.actor.id);
        await a.audit('assistance.funds_applied', 'bill', bill.id, {
          paymentIntentId: intent.id,
          reserved: reservations.length,
        });
        return {
          paymentIntentId: intent.id,
          reservations,
          plan,
          message:
            reservations.length > 0
              ? 'Funds reserved. This is a hold, not payment or proof of settlement.'
              : 'No eligible funds were available to reserve. No funds moved.',
        };
      },
    );
  }

  async applyVoucher(
    a: Access,
    billId: string,
    input: { key: string; voucherAllocationId: string },
  ): Promise<ApplyResult & { voucherRedeemed: boolean }> {
    this.enabled();
    const { bill, customer } = await billAccess(a, billId, true);
    if (!customer)
      throw new IdentityError(403, 'The customer must authorize applying their voucher.');
    return this.once(
      a.client,
      a.actor.id,
      input.key,
      'assistance-apply-voucher',
      { billId, voucherAllocationId: input.voucherAllocationId },
      async () => {
        const voucher = (
          await a.client.query<{ id: string; status: string; allocation_id: string }>(
            'SELECT id,status,allocation_id FROM vouchers WHERE allocation_id=$1 FOR UPDATE',
            [input.voucherAllocationId],
          )
        ).rows[0];
        if (!voucher) throw new IdentityError(404, 'Voucher is unavailable.');
        if (voucher.status !== 'issued')
          throw new IdentityError(409, 'This voucher has already been used or is not active.');
        const rev = await latest(a.client, bill.id);
        const intent = await ensurePayableIntent(a.client, bill, rev, {
          adapterMode: this.adapterMode,
          appEnv: this.environment,
          key: `assistance:voucher:${bill.id}:${input.key}`,
        });
        const before = await buildFundingPlan(a.client, bill.id, { simulationLabel: this.label() });
        const source = before.sources.find(
          (s) => s.allocationId === input.voucherAllocationId && s.eligible,
        );
        if (!source) throw new IdentityError(409, 'This voucher is not eligible for this bill.');
        const reservedSoFar = BigInt(
          (
            await a.client.query<{ amount: string }>(
              "SELECT COALESCE(sum(amount_minor),0)::text AS amount FROM funding_reservations WHERE payment_intent_id=$1 AND status IN ('active','captured')",
              [intent.id],
            )
          ).rows[0].amount,
        );
        const remaining = BigInt(intent.amountMinor) - reservedSoFar;
        const available = BigInt(source.availableMinor);
        const amount = available < remaining ? available : remaining;
        if (amount <= 0n) throw new IdentityError(409, 'Nothing left to apply this voucher to.');
        const held = await this.ledger.reserveWithin(
          a.client,
          `assistance:voucher:${input.key}:${source.allocationId}`,
          {
            allocationId: source.allocationId,
            paymentIntentId: intent.id,
            amountMinor: amount.toString(),
          },
        );
        await a.client.query(
          "UPDATE vouchers SET status='redeemed', redeemed_at=now() WHERE id=$1 AND status='issued'",
          [voucher.id],
        );
        const plan = await buildFundingPlan(a.client, bill.id, { simulationLabel: this.label() });
        await persistPlan(a.client, plan, a.actor.id);
        await a.audit('assistance.voucher_applied', 'bill', bill.id, {
          paymentIntentId: intent.id,
          voucherId: voucher.id,
        });
        return {
          paymentIntentId: intent.id,
          reservations: [
            {
              allocationId: source.allocationId,
              amountMinor: amount.toString(),
              reservationId: held.reservationId,
            },
          ],
          plan,
          voucherRedeemed: true,
          message: 'Voucher applied and reserved. This is a hold, not proof of settlement.',
        };
      },
    );
  }

  async requestSupport(
    a: Access,
    billId: string,
    input: {
      kind: 'shortfall_support' | 'help';
      amountMinor?: string;
      currency?: string;
      reason: string;
    },
  ): Promise<{ id: string; status: string; message: string }> {
    const { bill, customer } = await billAccess(a, billId);
    if (!customer)
      throw new IdentityError(
        403,
        'Only the customer or an authorized caregiver can request help.',
      );
    const existing = (
      await a.client.query(
        "SELECT id,status FROM support_requests WHERE bill_id=$1 AND kind=$2 AND status IN ('open','acknowledged') LIMIT 1",
        [bill.id, input.kind],
      )
    ).rows[0];
    if (existing)
      return {
        id: existing.id,
        status: existing.status,
        message: 'A support request is already open for this bill.',
      };
    const row = (
      await a.client.query<{ id: string; status: string }>(
        'INSERT INTO support_requests(bill_id,requester_user_id,kind,amount_minor,currency,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status',
        [
          bill.id,
          a.actor.id,
          input.kind,
          input.amountMinor ?? null,
          input.currency ?? bill.currency,
          input.reason,
        ],
      )
    ).rows[0];
    await a.audit('assistance.support_requested', 'bill', bill.id, {
      supportRequestId: row.id,
      kind: input.kind,
    });
    return {
      id: row.id,
      status: row.status,
      message: 'A person will review your request. This is not a guarantee of funds or coverage.',
    };
  }

  async exploreFinancing(
    a: Access,
    billId: string,
    input: { creditRecordId: string },
  ): Promise<{ id: string; status: string; message: string }> {
    const { bill, customer } = await billAccess(a, billId);
    if (!customer)
      throw new IdentityError(
        403,
        'Only the customer or an authorized caregiver can ask about financing.',
      );
    const credit = (
      await a.client.query<{
        id: string;
        partner_organization_id: string;
        currency: string;
        principal_minor: string;
        status: string;
      }>(
        'SELECT id,partner_organization_id,currency,principal_minor,status FROM credit_records WHERE id=$1 AND beneficiary_user_id=$2',
        [input.creditRecordId, bill.customer_user_id],
      )
    ).rows[0];
    if (!credit || !['offered', 'accepted'].includes(credit.status))
      throw new IdentityError(404, 'No eligible financing offer is available.');
    const row = (
      await a.client.query<{ id: string; status: string }>(
        'INSERT INTO financing_inquiries(bill_id,requester_user_id,credit_record_id,partner_organization_id,currency,amount_minor) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status',
        [
          bill.id,
          a.actor.id,
          credit.id,
          credit.partner_organization_id,
          credit.currency,
          credit.principal_minor,
        ],
      )
    ).rows[0];
    await a.audit('assistance.financing_explored', 'bill', bill.id, {
      financingInquiryId: row.id,
      creditRecordId: credit.id,
    });
    return {
      id: row.id,
      status: row.status,
      message:
        'Inquiry sent to the partner. Terms are disclosed before you accept. No funds moved yet.',
    };
  }

  /** Public view of a bill's assistance state for the API response. */
  async view(a: Access, billId: string) {
    const plan = await this.plan(a, billId, true);
    const supports = (
      await a.client.query(
        'SELECT id,kind,status,amount_minor,currency,reason,created_at FROM support_requests WHERE bill_id=$1 ORDER BY created_at DESC',
        [billId],
      )
    ).rows;
    const inquiries = (
      await a.client.query(
        'SELECT id,status,amount_minor,currency,created_at FROM financing_inquiries WHERE bill_id=$1 ORDER BY created_at DESC',
        [billId],
      )
    ).rows;
    return {
      plan,
      supportRequests: supports,
      financingInquiries: inquiries,
      planVersion: ASSISTANCE_PLAN_VERSION,
    };
  }
}

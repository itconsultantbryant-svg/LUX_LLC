import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentEventSchema, PAYMENT_SIMULATION_LABEL } from '@healthwallet/shared';
import type {
  PaymentAdapter,
  PaymentChargeInput,
  PaymentChargeResult,
  PaymentInitiationInput,
  PaymentProviderResult,
  PaymentRefundInput,
  PaymentCallbackVerificationInput,
  VerifiedPaymentCallback,
} from './types.js';

const DEFAULT_SANDBOX_SECRET = 'sandbox-payment-callback-secret';

/**
 * Simulated Orange Money–style payment adapter.
 *
 * The sandbox never reports success on initiation: a signed, replay-checked
 * callback is required to confirm a payment, mirroring the live constraint that
 * a browser redirect is not proof of success.
 * Replacement point: swap for confirmed Orange Liberia interfaces when
 * credentials and sandbox APIs are issued. No signed commercial agreement or
 * live settlement is implied.
 */
export class SandboxPaymentAdapter implements PaymentAdapter {
  readonly id = 'orange-money.sandbox-simulated';
  readonly mode = 'sandbox' as const;

  constructor(private readonly secret: string = DEFAULT_SANDBOX_SECRET) {}

  private valid(input: { amountMinor: string; currency: string }): boolean {
    return (
      typeof input.amountMinor === 'string' &&
      /^[1-9][0-9]{0,18}$/.test(input.amountMinor) &&
      BigInt(input.amountMinor) <= 9223372036854775807n &&
      /^[A-Z]{3}$/.test(input.currency)
    );
  }

  private pending(input: PaymentInitiationInput, prefix: string): PaymentProviderResult {
    if (!this.valid(input))
      return {
        mode: 'sandbox',
        state: 'failed',
        adapterReference: `${prefix}_fail_${input.idempotencyKey}`,
        simulationLabel: 'SIMULATION — invalid amount; no live Orange Money call',
        raw: { reason: 'amount_must_be_positive' },
      };
    return {
      mode: 'sandbox',
      state: 'pending',
      adapterReference: `${prefix}_${input.idempotencyKey}`,
      simulationLabel: PAYMENT_SIMULATION_LABEL,
      raw: { currency: input.currency, amountMinor: input.amountMinor, narrative: input.narrative },
    };
  }

  async charge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    if (!this.valid(input)) {
      return {
        mode: 'sandbox',
        status: 'failed',
        adapterReference: `sim_fail_${input.idempotencyKey}`,
        simulationLabel: 'SIMULATION — invalid amount; no live Orange Money call',
        raw: { reason: 'amount_must_be_positive' },
      };
    }
    return {
      mode: 'sandbox',
      status: 'succeeded',
      adapterReference: `sim_ok_${input.idempotencyKey}`,
      simulationLabel: 'SIMULATION — sandbox payment only; not live Orange Money settlement',
      raw: {
        currency: input.currency,
        amountMinor: input.amountMinor,
        narrative: input.narrative,
      },
    };
  }

  async initiateDeposit(input: PaymentInitiationInput): Promise<PaymentProviderResult> {
    return this.pending(input, 'sim_dep');
  }

  async initiatePayment(input: PaymentInitiationInput): Promise<PaymentProviderResult> {
    return this.pending(input, 'sim_pay');
  }

  async getStatus(input: {
    reference: string;
    adapterReference: string | null;
  }): Promise<PaymentProviderResult> {
    return {
      mode: 'sandbox',
      state: 'pending',
      adapterReference: input.adapterReference ?? `sim_unknown_${input.reference}`,
      simulationLabel: PAYMENT_SIMULATION_LABEL,
      raw: { narrative: 'Sandbox status is authoritative only via a signed callback.' },
    };
  }

  async refund(input: PaymentRefundInput): Promise<PaymentProviderResult> {
    if (!this.valid(input))
      return {
        mode: 'sandbox',
        state: 'failed',
        adapterReference: `sim_refund_fail_${input.idempotencyKey}`,
        simulationLabel: PAYMENT_SIMULATION_LABEL,
        raw: { reason: 'invalid_refund_amount' },
      };
    return {
      mode: 'sandbox',
      state: 'succeeded',
      adapterReference: `sim_refund_${input.idempotencyKey}`,
      simulationLabel: PAYMENT_SIMULATION_LABEL,
      raw: { reason: input.reason, sourcedFrom: input.adapterReference },
    };
  }

  signCallback(rawBody: Buffer): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  verifyCallback(input: PaymentCallbackVerificationInput): VerifiedPaymentCallback {
    if (!input.signature) return { valid: false, reason: 'missing_signature' };
    const expected = this.signCallback(input.rawBody);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(input.signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return { valid: false, reason: 'invalid_signature' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      return { valid: false, reason: 'malformed_body' };
    }
    const event = PaymentEventSchema.safeParse(parsed);
    if (!event.success) return { valid: false, reason: 'invalid_event' };
    return { valid: true, event: event.data };
  }
}

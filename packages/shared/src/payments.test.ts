import { describe, expect, it } from 'vitest';
import {
  canTransitionPayment,
  isTerminalPaymentState,
  PAYMENT_CALLBACK_STATUSES,
  PAYMENT_STATES,
  PAYMENT_SUCCESS_STATES,
  PAYMENT_TERMINAL_STATES,
  PaymentEventSchema,
  PaymentStateSchema,
  RefundSchema,
  type PaymentState,
} from './payments.js';

describe('payment lifecycle constants', () => {
  it('keeps success and terminal sets consistent with the full state list', () => {
    for (const state of PAYMENT_SUCCESS_STATES) expect(PAYMENT_STATES).toContain(state);
    for (const state of PAYMENT_TERMINAL_STATES) expect(PAYMENT_STATES).toContain(state);
    for (const state of PAYMENT_SUCCESS_STATES) expect(PAYMENT_TERMINAL_STATES).toContain(state);
  });

  it('treats only succeeded as a receipt-issuing success state', () => {
    expect(PAYMENT_SUCCESS_STATES).toEqual(['succeeded']);
  });

  it('classifies each state as terminal or not', () => {
    const expected: Record<PaymentState, boolean> = {
      created: false,
      awaiting_authorization: false,
      submitted: false,
      pending: false,
      succeeded: true,
      failed: true,
      expired: true,
      cancelled: true,
      reversed: true,
    };
    for (const state of PAYMENT_STATES) {
      expect(isTerminalPaymentState(state), state).toBe(expected[state]);
    }
  });

  it('parses every declared state and rejects unknown ones', () => {
    for (const state of PAYMENT_STATES) expect(PaymentStateSchema.parse(state)).toBe(state);
    expect(() => PaymentStateSchema.parse('refunded')).toThrow();
  });

  it('lets a provider report only post-initiation statuses', () => {
    for (const status of PAYMENT_CALLBACK_STATUSES) expect(PAYMENT_STATES).toContain(status);
    expect(PAYMENT_CALLBACK_STATUSES).not.toContain('created');
    expect(PAYMENT_CALLBACK_STATUSES).not.toContain('awaiting_authorization');
  });
});

describe('canTransitionPayment', () => {
  // The full, exhaustive transition table. Any state pair not listed here must
  // be rejected; a payment may never move to an undeclared target.
  const allowed: Partial<Record<PaymentState, PaymentState[]>> = {
    created: ['awaiting_authorization', 'cancelled', 'expired', 'failed'],
    awaiting_authorization: ['submitted', 'pending', 'succeeded', 'failed', 'expired', 'cancelled'],
    submitted: ['pending', 'succeeded', 'failed', 'expired', 'cancelled'],
    pending: ['succeeded', 'failed', 'expired', 'cancelled'],
    failed: ['succeeded'],
    expired: ['succeeded'],
    succeeded: ['reversed'],
    cancelled: [],
    reversed: [],
  };

  it('accepts exactly the approved transitions and rejects every other pair', () => {
    for (const from of PAYMENT_STATES) {
      for (const to of PAYMENT_STATES) {
        const shouldAllow = (allowed[from] ?? []).includes(to);
        expect(canTransitionPayment(from, to), `${from} -> ${to}`).toBe(shouldAllow);
      }
    }
  });

  it('never allows a payment to leave cancelled or reversed', () => {
    for (const to of PAYMENT_STATES) {
      expect(canTransitionPayment('cancelled', to)).toBe(false);
      expect(canTransitionPayment('reversed', to)).toBe(false);
    }
  });

  it('allows a late success to reconcile a failed or expired attempt only', () => {
    expect(canTransitionPayment('failed', 'succeeded')).toBe(true);
    expect(canTransitionPayment('expired', 'succeeded')).toBe(true);
    expect(canTransitionPayment('failed', 'pending')).toBe(false);
    expect(canTransitionPayment('expired', 'cancelled')).toBe(false);
  });

  it('permits a refund (reversal) only from a succeeded payment', () => {
    expect(canTransitionPayment('succeeded', 'reversed')).toBe(true);
    for (const from of PAYMENT_STATES.filter((s) => s !== 'succeeded')) {
      expect(canTransitionPayment(from, 'reversed'), from).toBe(false);
    }
  });

  it('has no self-transitions', () => {
    for (const state of PAYMENT_STATES) expect(canTransitionPayment(state, state)).toBe(false);
  });

  it('resolves every transition target to a declared state', () => {
    for (const from of PAYMENT_STATES) {
      for (const to of PAYMENT_STATES) {
        if (canTransitionPayment(from, to)) expect(PAYMENT_STATES).toContain(to);
      }
    }
  });
});

describe('PaymentEventSchema', () => {
  const base = {
    provider: 'sandbox',
    eventId: 'evt-1',
    reference: 'intent-1',
    status: 'succeeded' as const,
    sequence: 1,
    amountMinor: '1500000',
    currency: 'LRD',
    occurredAt: '2026-10-01T00:00:00.000Z',
  };

  it('accepts a well-formed verified event', () => {
    expect(PaymentEventSchema.parse(base)).toMatchObject({ status: 'succeeded' });
  });

  it('rejects a zero or malformed amount', () => {
    expect(() => PaymentEventSchema.parse({ ...base, amountMinor: '0' })).toThrow();
    expect(() => PaymentEventSchema.parse({ ...base, amountMinor: '01' })).toThrow();
    expect(() => PaymentEventSchema.parse({ ...base, amountMinor: '-5' })).toThrow();
  });

  it('rejects a currency that is not a three-letter code', () => {
    expect(() => PaymentEventSchema.parse({ ...base, currency: 'LR' })).toThrow();
    expect(() => PaymentEventSchema.parse({ ...base, currency: 'lrd' })).toThrow();
  });

  it('rejects a negative or non-integer sequence', () => {
    expect(() => PaymentEventSchema.parse({ ...base, sequence: -1 })).toThrow();
    expect(() => PaymentEventSchema.parse({ ...base, sequence: 1.5 })).toThrow();
  });

  it('rejects a status the provider is not allowed to report', () => {
    expect(() => PaymentEventSchema.parse({ ...base, status: 'created' })).toThrow();
  });
});

describe('RefundSchema', () => {
  it('defaults the adapter reference to null and validates the shape', () => {
    const refund = RefundSchema.parse({
      id: 'r1',
      paymentIntentId: 'p1',
      amountMinor: '1500000',
      currency: 'LRD',
      status: 'requested',
      reason: 'duplicate charge',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(refund.adapterReference).toBeNull();
    expect(refund.status).toBe('requested');
  });

  it('rejects an unknown refund status', () => {
    expect(() =>
      RefundSchema.parse({
        id: 'r1',
        paymentIntentId: 'p1',
        amountMinor: '1500000',
        currency: 'LRD',
        status: 'reversed',
        reason: 'x',
        createdAt: '2026-10-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});

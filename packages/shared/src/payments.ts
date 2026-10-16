import { z } from 'zod';

/**
 * Provider payment lifecycle, shared between the API and the web app.
 *
 * A browser redirect is never evidence of success: the authoritative provider
 * callback (verified and replay-protected) is the only thing that may move a
 * payment to a success terminal state and issue a receipt.
 */
export const PAYMENT_STATES = [
  'created',
  'awaiting_authorization',
  'submitted',
  'pending',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
  'reversed',
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];
export const PaymentStateSchema = z.enum(PAYMENT_STATES);

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  created: 'Created',
  awaiting_authorization: 'Awaiting customer authorization',
  submitted: 'Submitted to provider',
  pending: 'Pending provider confirmation',
  succeeded: 'Succeeded',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  reversed: 'Reversed / refunded',
};

/** Terminal-success state. Only this state may issue a receipt. */
export const PAYMENT_SUCCESS_STATES: readonly PaymentState[] = ['succeeded'];

export const PAYMENT_TERMINAL_STATES: readonly PaymentState[] = [
  'succeeded',
  'failed',
  'expired',
  'cancelled',
  'reversed',
];

export function isTerminalPaymentState(state: PaymentState): boolean {
  return PAYMENT_TERMINAL_STATES.includes(state);
}

const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  created: ['awaiting_authorization', 'cancelled', 'expired', 'failed'],
  awaiting_authorization: ['submitted', 'pending', 'succeeded', 'failed', 'expired', 'cancelled'],
  submitted: ['pending', 'succeeded', 'failed', 'expired', 'cancelled'],
  pending: ['succeeded', 'failed', 'expired', 'cancelled'],
  // A late authoritative success may reconcile a previously failed/expired attempt.
  failed: ['succeeded'],
  expired: ['succeeded'],
  succeeded: ['reversed'],
  cancelled: [],
  reversed: [],
};

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return ALLOWED_PAYMENT_TRANSITIONS[from].includes(to);
}

export const PAYMENT_SIMULATION_LABEL =
  'SIMULATION — sandbox payment only; no real money moves and no partner settlement is asserted.';

export const UNCONFIRMED_SETTLEMENT_NOTE =
  'A ledger capture is a platform record, not proof that a partner has settled funds.';

/** Statuses a provider may report in a callback. Mirrors the lifecycle above. */
export const PAYMENT_CALLBACK_STATUSES = [
  'submitted',
  'pending',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
  'reversed',
] as const;
export type PaymentCallbackStatus = (typeof PAYMENT_CALLBACK_STATUSES)[number];
export const PaymentCallbackStatusSchema = z.enum(PAYMENT_CALLBACK_STATUSES);

/**
 * A verified provider callback event. `sequence` is a monotonic provider counter
 * used to safely ignore out-of-order and duplicated deliveries.
 */
export const PaymentEventSchema = z.object({
  provider: z.string().min(1).max(64),
  eventId: z.string().min(1).max(200),
  reference: z.string().min(1).max(200),
  status: PaymentCallbackStatusSchema,
  sequence: z.number().int().nonnegative(),
  amountMinor: z.string().regex(/^[1-9][0-9]{0,18}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string(),
  reason: z.string().max(500).optional(),
});
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;

export const PaymentEventResultSchema = z.object({
  accepted: z.boolean(),
  reason: z.string(),
  state: PaymentStateSchema,
  receiptIssued: z.boolean(),
});
export type PaymentEventResult = z.infer<typeof PaymentEventResultSchema>;

export const REFUND_STATUSES = ['requested', 'succeeded', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const RefundStatusSchema = z.enum(REFUND_STATUSES);

export const RefundSchema = z.object({
  id: z.string(),
  paymentIntentId: z.string(),
  amountMinor: z.string(),
  currency: z.string(),
  status: RefundStatusSchema,
  reason: z.string(),
  adapterReference: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type Refund = z.infer<typeof RefundSchema>;

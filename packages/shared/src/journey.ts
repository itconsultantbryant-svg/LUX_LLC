import { z } from 'zod';

export const JOURNEY_STAGES = [
  'bill_submitted',
  'extraction_completed',
  'review_required',
  'review_decided',
  'customer_confirmed',
  'funding_available',
  'payment_captured',
  'receipt_issued',
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export const JourneyStageSchema = z.enum(JOURNEY_STAGES);

export const JOURNEY_STAGE_LABELS: Record<JourneyStage, string> = {
  bill_submitted: 'Bill submitted',
  extraction_completed: 'Document read by AI',
  review_required: 'Review required',
  review_decided: 'Review decided',
  customer_confirmed: 'Customer confirmed',
  funding_available: 'Funding available',
  payment_captured: 'Payment captured',
  receipt_issued: 'Receipt issued',
};

/**
 * Canonical outcome labels used by the M-01/M-02 metrics instrumentation.
 * Mirrors the customer payment journey documented in ACCEPTANCE_CRITERIA_PAYMENT_JOURNEY.md.
 */
export const JOURNEY_OUTCOMES = ['paid', 'rejected', 'returned', 'expired', 'failed'] as const;
export type JourneyOutcome = (typeof JOURNEY_OUTCOMES)[number];

export const JourneyOutcomeSchema = z.enum(JOURNEY_OUTCOMES);

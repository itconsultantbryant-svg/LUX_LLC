import { z } from 'zod';

export const FeeLineSchema = z.object({
  code: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,18})$/),
  currency: z.string().length(3),
  basis: z.string().min(1).max(400),
});

export const FeeScheduleSchema = z.object({
  version: z.string().min(1).max(60),
  status: z.enum(['sandbox', 'confirmed']),
  effectiveFrom: z.string(),
  currency: z.string().length(3),
  lines: z.array(FeeLineSchema),
  note: z.string().min(1).max(600),
});

export type FeeLine = z.infer<typeof FeeLineSchema>;
export type FeeSchedule = z.infer<typeof FeeScheduleSchema>;

/**
 * Transparent fee disclosure. No percentage or partner fee is asserted before
 * Orange Liberia confirms an interface; the sandbox schedule is exactly zero.
 */
export const FEE_SCHEDULE: FeeSchedule = {
  version: 'sandbox-fees-v1',
  status: 'sandbox',
  effectiveFrom: '2026-10-01',
  currency: 'LRD',
  lines: [
    {
      code: 'deposit',
      label: 'Healthcare wallet deposit',
      amountMinor: '0',
      currency: 'LRD',
      basis: 'Zero during sandbox. Partner deposit fee schedule is unconfirmed.',
    },
    {
      code: 'contribution',
      label: 'Family / diaspora contribution',
      amountMinor: '0',
      currency: 'LRD',
      basis:
        'Zero during sandbox. International transfer fees are not live and are simulated only.',
    },
    {
      code: 'provider_payment',
      label: 'Verified provider payment',
      amountMinor: '0',
      currency: 'LRD',
      basis: 'Zero during sandbox. Orange Money interface fees are unconfirmed.',
    },
    {
      code: 'platform_service',
      label: 'Platform service fee',
      amountMinor: '0',
      currency: 'LRD',
      basis: 'Not charged during sandbox. No percentage is asserted before partner confirmation.',
    },
  ],
  note: 'Sandbox fee disclosure only. No fee is charged and no live partner fee has been confirmed. Amounts are exact minor units.',
};

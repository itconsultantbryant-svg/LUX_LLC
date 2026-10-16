import { z } from 'zod';

/**
 * Funding assistance for validated healthcare bills.
 *
 * Every figure in a funding plan is produced by a deterministic eligibility
 * engine from authorized ledger and coverage records. AI may only *explain* an
 * already-computed plan; it never invents balances, coverage, approvals or
 * repayment terms. See `AssistanceExplanationSchema`.
 */

export const FUNDING_SOURCE_LABELS = {
  personal_savings: 'Personal savings',
  family_contributions: 'Family contributions',
  employer_benefits: 'Employer benefits',
  sponsor_vouchers: 'Sponsor vouchers',
  rewards: 'Rewards',
  partner_credit: 'Partner credit',
} as const;

export type FundingSourceKind = keyof typeof FUNDING_SOURCE_LABELS;

export const FUNDING_SOURCE_KINDS = Object.keys(FUNDING_SOURCE_LABELS) as [
  FundingSourceKind,
  ...FundingSourceKind[],
];
export const FundingSourceKindSchema = z.enum(FUNDING_SOURCE_KINDS);

export const ASSISTANCE_PLAN_VERSION = 'funding-assistance-v1';

export const ASSISTANCE_RESTRICTIONS =
  'Healthcare payments only. Funds cannot be withdrawn as cash and can only pay verified healthcare bills.';

export const ASSISTANCE_SIMULATION_LABEL =
  'SIMULATION — sandbox funding only; no real money moves and no partner settlement is asserted.';

/** Why an allocation cannot contribute to this bill, or null when it can. */
export const ALLOCATION_BLOCK_REASONS = [
  'inactive',
  'not_started',
  'expired',
  'category_restriction',
  'provider_restriction',
  'program_inactive',
  'program_expired',
  'program_rules_changed',
  'requires_review',
  'currency_mismatch',
  'beneficiary_mismatch',
  'zero_balance',
] as const;
export const AllocationBlockReasonSchema = z.enum(ALLOCATION_BLOCK_REASONS);
export type AllocationBlockReason = z.infer<typeof AllocationBlockReasonSchema>;

export const AssistanceSourceSchema = z.object({
  allocationId: z.string(),
  source: FundingSourceKindSchema,
  label: z.string(),
  availableMinor: z.string(),
  eligible: z.boolean(),
  restricted: z.boolean(),
  blockReason: AllocationBlockReasonSchema.nullable().default(null),
});
export type AssistanceSource = z.infer<typeof AssistanceSourceSchema>;

export const ASSISTANCE_ACTIONS = [
  'use_funds',
  'apply_voucher',
  'request_support',
  'explore_financing',
  'request_help',
] as const;
export const AssistanceActionSchema = z.enum(ASSISTANCE_ACTIONS);
export type AssistanceAction = z.infer<typeof AssistanceActionSchema>;

export const ASSISTANCE_ACTION_LABELS: Record<AssistanceAction, string> = {
  use_funds: 'Use eligible available funds',
  apply_voucher: 'Apply an eligible voucher',
  request_support: 'Request support for the shortfall',
  explore_financing: 'Explore a partner financing option',
  request_help: 'Request help',
};

export const AssistanceActionOptionSchema = z.object({
  action: AssistanceActionSchema,
  available: z.boolean(),
  reason: z.string(),
});
export type AssistanceActionOption = z.infer<typeof AssistanceActionOptionSchema>;

/**
 * Verified insurance contribution. `available` is false whenever no verified
 * insurance dataset is connected; the engine never infers coverage.
 */
export const InsuranceCoverageSchema = z.object({
  available: z.boolean(),
  amountMinor: z.string(),
  records: z.array(
    z.object({
      id: z.string(),
      insurer: z.string().nullable(),
      status: z.string(),
    }),
  ),
  reason: z.string(),
});
export type InsuranceCoverage = z.infer<typeof InsuranceCoverageSchema>;

export const FundingPlanSchema = z.object({
  billId: z.string(),
  currency: z.string(),
  billAmountMinor: z.string(),
  eligibleSavingsMinor: z.string(),
  eligibleContributionsMinor: z.string(),
  eligibleVouchersMinor: z.string(),
  otherEligibleMinor: z.string(),
  eligibleInsuranceMinor: z.string(),
  totalEligibleMinor: z.string(),
  allocatedMinor: z.string(),
  shortfallMinor: z.string(),
  insurance: InsuranceCoverageSchema,
  sources: z.array(AssistanceSourceSchema),
  actions: z.array(AssistanceActionOptionSchema),
  restrictions: z.array(z.string()),
  policyVersion: z.string(),
  planVersion: z.string(),
  simulationLabel: z.string().nullable(),
  createdAt: z.string(),
});
export type FundingPlan = z.infer<typeof FundingPlanSchema>;

/**
 * An AI explanation of a deterministic plan. `groundedOn` lists the ledger
 * fields the text may reference; the model is not allowed to add figures
 * outside those fields.
 */
export const AssistanceExplanationSchema = z.object({
  text: z.string().max(2000),
  groundedOn: z.array(z.string()),
  recommendedAction: AssistanceActionSchema.nullable().default(null),
  generatedBy: z.enum(['assistant', 'deterministic']),
  modelVersion: z.string().nullable().default(null),
  unaudited: z.boolean().default(true),
  disclaimer: z.string(),
});
export type AssistanceExplanation = z.infer<typeof AssistanceExplanationSchema>;

export const ASSISTANCE_DISCLAIMER =
  'This explanation is generated from approved records. It is not financial, legal or insurance advice, and it cannot authorize a payment.';

const zero = '0';

/** A plan with only the bill known and no eligible funding resolved yet. */
export function emptyFundingPlan(input: {
  billId: string;
  currency: string;
  billAmountMinor: string;
  policyVersion: string;
  simulationLabel?: string | null;
  createdAt?: string;
}): FundingPlan {
  const shortfall = input.billAmountMinor;
  return {
    billId: input.billId,
    currency: input.currency,
    billAmountMinor: input.billAmountMinor,
    eligibleSavingsMinor: zero,
    eligibleContributionsMinor: zero,
    eligibleVouchersMinor: zero,
    otherEligibleMinor: zero,
    eligibleInsuranceMinor: zero,
    totalEligibleMinor: zero,
    allocatedMinor: zero,
    shortfallMinor: shortfall,
    insurance: {
      available: false,
      amountMinor: zero,
      records: [],
      reason: 'No verified insurance dataset is connected.',
    },
    sources: [],
    actions: ASSISTANCE_ACTIONS.map((action) => ({
      action,
      available: action === 'request_help' || action === 'request_support',
      reason: 'Funding has not been resolved yet.',
    })),
    restrictions: [ASSISTANCE_RESTRICTIONS],
    policyVersion: input.policyVersion,
    planVersion: ASSISTANCE_PLAN_VERSION,
    simulationLabel: input.simulationLabel ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

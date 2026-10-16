import { z } from 'zod';

/**
 * Configurable partner modules. Each module reports an honest availability
 * state; unavailable capabilities are surfaced explicitly and never faked.
 */
export const PARTNER_MODULES = ['health_credit', 'insurance', 'rewards', 'ussd'] as const;
export type PartnerModule = (typeof PARTNER_MODULES)[number];
export const PartnerModuleSchema = z.enum(PARTNER_MODULES);

export const PARTNER_MODULE_LABELS: Record<PartnerModule, string> = {
  health_credit: 'Health credit',
  insurance: 'Insurance',
  rewards: 'Rewards',
  ussd: 'USSD',
};

export const MODULE_AVAILABILITY_STATES = [
  'available',
  'simulated',
  'unavailable',
  'pending_approval',
] as const;
export type ModuleAvailability = (typeof MODULE_AVAILABILITY_STATES)[number];
export const ModuleAvailabilitySchema = z.enum(MODULE_AVAILABILITY_STATES);

export const MODULE_AVAILABILITY_LABELS: Record<ModuleAvailability, string> = {
  available: 'Available',
  simulated: 'Available (simulated)',
  unavailable: 'Unavailable',
  pending_approval: 'Pending partner approval',
};

export const PartnerModuleStatusSchema = z.object({
  module: PartnerModuleSchema,
  label: z.string(),
  availability: ModuleAvailabilitySchema,
  simulated: z.boolean(),
  reason: z.string(),
  capabilities: z.array(z.string()),
  simulationLabel: z.string().nullable(),
});
export type PartnerModuleStatus = z.infer<typeof PartnerModuleStatusSchema>;

export const PartnerModulesResponseSchema = z.object({
  modules: z.array(PartnerModuleStatusSchema),
  generatedAt: z.string(),
});
export type PartnerModulesResponse = z.infer<typeof PartnerModulesResponseSchema>;

export const SIMULATION_PREFIX = 'SIMULATION — ';

/**
 * Health credit: terms are partner-defined. The platform discloses them and
 * records explicit customer acceptance; it never grants credit or sets terms.
 */
export const CREDIT_TERMS_VERSION = 'partner-credit-terms-v1';

export const CreditTermsSchema = z.object({
  termsVersion: z.string(),
  principalMinor: z.string(),
  feeMinor: z.string(),
  currency: z.string().length(3),
  installments: z.array(
    z.object({
      dueDate: z.string(),
      amountMinor: z.string(),
    }),
  ),
  aprNote: z.string(),
  earlyRepaymentNote: z.string(),
  restrictedToHealthcare: z.boolean().default(true),
});
export type CreditTerms = z.infer<typeof CreditTermsSchema>;

export const CREDIT_STATUSES = [
  'offered',
  'accepted',
  'declined',
  'repaying',
  'repaid',
  'defaulted',
  'appealed',
  'written_off',
] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];

/**
 * Insurance: coverage is only reported from verified policy records. Uploaded
 * documents never imply active coverage or claim approval.
 */
export const CLAIM_STATUSES = [
  'preparing',
  'submitted',
  'insurer_review',
  'approved',
  'partially_approved',
  'denied',
  'appealed',
  'paid',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const InsuranceCoverageInquirySchema = z.object({
  policyId: z.uuid().optional(),
  billId: z.uuid().optional(),
});
export type InsuranceCoverageInquiry = z.infer<typeof InsuranceCoverageInquirySchema>;

/** Rewards: sponsor-funded rules, accrual/redemption/reversal/expiry. */
export const REWARD_ENTRY_TYPES = ['accrual', 'redemption', 'reversal', 'expiry'] as const;
export type RewardEntryType = (typeof REWARD_ENTRY_TYPES)[number];

export const REWARD_RULE_KINDS = [
  'per_transaction_bps',
  'flat_per_transaction',
  'campaign',
] as const;
export type RewardRuleKind = (typeof REWARD_RULE_KINDS)[number];

/** USSD: short sessions; never display a live dial code without provisioning. */
export const USSD_MENU_ACTIONS = [
  'balance',
  'vouchers',
  'provider_lookup',
  'authorize_payment',
  'exit',
] as const;
export type UssdMenuAction = (typeof USSD_MENU_ACTIONS)[number];

export const USSD_SESSION_TTL_SECONDS = 120;

import type pg from 'pg';
import {
  ASSISTANCE_PLAN_VERSION,
  ASSISTANCE_RESTRICTIONS,
  ASSISTANCE_SIMULATION_LABEL,
  APPROVED_VALIDATION_POLICY,
  FUNDING_SOURCE_LABELS,
  type AllocationBlockReason,
  type AssistanceActionOption,
  type AssistanceSource,
  type FundingPlan,
  type FundingSourceKind,
} from '@healthwallet/shared';
import { IdentityError } from '../identity/service.js';
import {
  loadValidationContext,
  type AllocationRow,
  type ValidationContext,
} from '../validation/context.js';

/** Sources the assistance engine may draw from. Partner credit is explored separately. */
const FUNDABLE_SOURCES: FundingSourceKind[] = [
  'personal_savings',
  'family_contributions',
  'employer_benefits',
  'sponsor_vouchers',
  'rewards',
];

function asSourceKind(source: string): FundingSourceKind | null {
  return source in FUNDING_SOURCE_LABELS ? (source as FundingSourceKind) : null;
}

/**
 * Deterministic, read-only restriction evaluation. This mirrors the ledger's
 * `eligible` checks so the plan never promises funds the ledger will refuse.
 */
export function classifyAllocation(
  allocation: AllocationRow,
  ctx: Pick<ValidationContext, 'bill' | 'now'>,
): AllocationBlockReason | null {
  const now = ctx.now.getTime();
  if (allocation.status !== 'active') return 'inactive';
  if (allocation.starts_at && new Date(allocation.starts_at).getTime() > now) return 'not_started';
  if (allocation.expires_at && new Date(allocation.expires_at).getTime() <= now) return 'expired';
  if (Object.keys(allocation.rules ?? {}).length) return 'requires_review';
  if (allocation.program_id) {
    if (allocation.program_status !== 'active') return 'program_inactive';
    if (allocation.program_expires_at && new Date(allocation.program_expires_at).getTime() <= now)
      return 'program_expired';
    if (
      allocation.program_rule_version_current !== null &&
      allocation.program_rule_version_current !== allocation.program_rule_version
    )
      return 'program_rules_changed';
    if (Object.keys(allocation.program_rules ?? {}).length) return 'requires_review';
  }
  const categories = new Set([
    ...allocation.allowed_categories,
    ...(allocation.program_allowed_categories ?? []),
  ]);
  if (categories.size && !categories.has(ctx.bill.category)) return 'category_restriction';
  const providers = new Set([
    ...allocation.allowed_provider_ids,
    ...(allocation.program_allowed_provider_ids ?? []),
  ]);
  if (
    providers.size &&
    (!ctx.bill.provider_organization_id || !providers.has(ctx.bill.provider_organization_id))
  )
    return 'provider_restriction';
  if (BigInt(allocation.available_minor) === 0n) return 'zero_balance';
  return null;
}

function isRestricted(allocation: AllocationRow): boolean {
  return Boolean(
    allocation.program_id ||
    allocation.allowed_categories.length ||
    allocation.allowed_provider_ids.length ||
    (allocation.program_allowed_categories?.length ?? 0) ||
    (allocation.program_allowed_provider_ids?.length ?? 0),
  );
}

export type BuildPlanOptions = {
  simulationLabel?: string | null;
  createdAt?: string;
};

export async function buildFundingPlan(
  client: pg.PoolClient,
  billId: string,
  options: BuildPlanOptions = {},
): Promise<FundingPlan> {
  const ctx = await loadValidationContext(client, billId);
  const bill = ctx.bill;
  if (bill.total_amount_minor === null || !bill.currency)
    throw new IdentityError(
      409,
      'This bill needs a currency and total before funding can be assessed.',
    );

  const sources: AssistanceSource[] = [];
  const eligibleBySource: Record<FundingSourceKind, bigint> = {
    personal_savings: 0n,
    family_contributions: 0n,
    employer_benefits: 0n,
    sponsor_vouchers: 0n,
    rewards: 0n,
    partner_credit: 0n,
  };

  for (const allocation of ctx.allocations) {
    const kind = asSourceKind(allocation.source);
    if (!kind || !FUNDABLE_SOURCES.includes(kind)) continue;
    const blockReason = classifyAllocation(allocation, ctx);
    const available = BigInt(allocation.available_minor);
    const eligible = blockReason === null && available > 0n;
    if (eligible) eligibleBySource[kind] += available;
    sources.push({
      allocationId: allocation.id,
      source: kind,
      label: FUNDING_SOURCE_LABELS[kind],
      availableMinor: available.toString(),
      eligible,
      restricted: isRestricted(allocation),
      blockReason,
    });
  }

  // Verified insurance contribution is only reported when a verified dataset
  // exists. The engine never infers active coverage from documents alone.
  const insurance = ctx.insuranceDataset
    ? {
        available: false,
        amountMinor: '0',
        records: [] as Array<{ id: string; insurer: string | null; status: string }>,
        reason:
          'An insurance dataset is present but no verified policy matched this beneficiary and service. Coverage is never inferred from uploaded documents.',
      }
    : {
        available: false,
        amountMinor: '0',
        records: [] as Array<{ id: string; insurer: string | null; status: string }>,
        reason:
          'No verified insurance dataset is connected. Coverage is never inferred from uploaded documents.',
      };

  const savings = eligibleBySource.personal_savings;
  const contributions = eligibleBySource.family_contributions;
  const vouchers = eligibleBySource.sponsor_vouchers;
  const other = eligibleBySource.employer_benefits + eligibleBySource.rewards;
  const insuranceMinor = insurance.available ? BigInt(insurance.amountMinor) : 0n;
  const totalEligible = savings + contributions + vouchers + other + insuranceMinor;

  const billAmount = BigInt(bill.total_amount_minor);

  // Funds already reserved against the bill's payment intent still cover it.
  const reservedRow = (
    await client.query<{ amount: string }>(
      `SELECT COALESCE(sum(r.amount_minor),0)::text AS amount
         FROM funding_reservations r
         JOIN payment_intents p ON p.id=r.payment_intent_id
        WHERE p.bill_id=$1 AND p.status NOT IN ('failed','cancelled') AND r.status IN ('active','captured')`,
      [billId],
    )
  ).rows[0];
  const reservedMinor = BigInt(reservedRow?.amount ?? '0');
  const remainingBill = billAmount > reservedMinor ? billAmount - reservedMinor : 0n;
  const shortfall = remainingBill > totalEligible ? remainingBill - totalEligible : 0n;

  const financing = (
    await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM credit_records WHERE beneficiary_user_id=$1 AND currency=$2 AND status IN ('offered','accepted')",
      [bill.customer_user_id, bill.currency],
    )
  ).rows[0];

  const actions: AssistanceActionOption[] = [
    {
      action: 'use_funds',
      available: totalEligible > 0n && remainingBill > 0n,
      reason:
        totalEligible > 0n
          ? `Apply up to ${(remainingBill < totalEligible ? remainingBill : totalEligible).toString()} minor units from eligible funds.`
          : 'No eligible funds are available for this bill.',
    },
    {
      action: 'apply_voucher',
      available: vouchers > 0n,
      reason:
        vouchers > 0n
          ? 'A sponsor voucher is eligible for this service.'
          : 'No eligible voucher is available for this service.',
    },
    {
      action: 'request_support',
      available: shortfall > 0n,
      reason:
        shortfall > 0n
          ? `Request support for the ${shortfall.toString()} minor-unit shortfall.`
          : 'No shortfall to fund.',
    },
    {
      action: 'explore_financing',
      available: BigInt(financing?.count ?? '0') > 0n,
      reason:
        BigInt(financing?.count ?? '0') > 0n
          ? 'A partner has an eligible financing offer. Terms are disclosed before acceptance.'
          : 'No partner financing option is currently available.',
    },
    {
      action: 'request_help',
      available: true,
      reason: 'Ask a person for help understanding or resolving this bill.',
    },
  ];

  return {
    billId,
    currency: bill.currency,
    billAmountMinor: billAmount.toString(),
    eligibleSavingsMinor: savings.toString(),
    eligibleContributionsMinor: contributions.toString(),
    eligibleVouchersMinor: vouchers.toString(),
    otherEligibleMinor: other.toString(),
    eligibleInsuranceMinor: insuranceMinor.toString(),
    totalEligibleMinor: totalEligible.toString(),
    allocatedMinor: reservedMinor.toString(),
    shortfallMinor: shortfall.toString(),
    insurance,
    sources,
    actions,
    restrictions: [ASSISTANCE_RESTRICTIONS],
    policyVersion: APPROVED_VALIDATION_POLICY.version,
    planVersion: ASSISTANCE_PLAN_VERSION,
    simulationLabel:
      options.simulationLabel === undefined ? ASSISTANCE_SIMULATION_LABEL : options.simulationLabel,
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

export async function persistPlan(
  client: pg.PoolClient,
  plan: FundingPlan,
  createdBy: string | null,
): Promise<string> {
  const row = (
    await client.query<{ id: string }>(
      `INSERT INTO bill_funding_plans(bill_id,currency,bill_amount_minor,eligible_savings_minor,eligible_contributions_minor,eligible_vouchers_minor,other_eligible_minor,eligible_insurance_minor,total_eligible_minor,allocated_minor,shortfall_minor,insurance,sources,actions,policy_version,plan_version,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        plan.billId,
        plan.currency,
        plan.billAmountMinor,
        plan.eligibleSavingsMinor,
        plan.eligibleContributionsMinor,
        plan.eligibleVouchersMinor,
        plan.otherEligibleMinor,
        plan.eligibleInsuranceMinor,
        plan.totalEligibleMinor,
        plan.allocatedMinor,
        plan.shortfallMinor,
        JSON.stringify(plan.insurance),
        JSON.stringify(plan.sources),
        JSON.stringify(plan.actions),
        plan.policyVersion,
        plan.planVersion,
        createdBy,
      ],
    )
  ).rows[0];
  return row.id;
}

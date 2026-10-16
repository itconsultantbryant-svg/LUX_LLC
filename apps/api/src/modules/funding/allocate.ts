/**
 * Deterministic funding allocation.
 * AI may rank sources externally; this function owns the math.
 */

export interface FundingSource {
  currency: string;
  id: string;
  label: string;
  availableMinor: bigint;
  restrictedCategories?: string[];
}

export interface FundingAllocationInput {
  currency: string;
  billAmountMinor: bigint;
  billCategory?: string;
  sources: FundingSource[];
}

export interface FundingAllocationLine {
  sourceId: string;
  label: string;
  allocatedMinor: bigint;
  restricted: boolean;
  reason?: string;
}

export interface FundingAllocationResult {
  lines: FundingAllocationLine[];
  allocatedTotalMinor: bigint;
  shortfallMinor: bigint;
}

export function allocateFunding(input: FundingAllocationInput): FundingAllocationResult {
  if (
    typeof input.billAmountMinor !== 'bigint' ||
    input.sources.some((source) => typeof source.availableMinor !== 'bigint')
  )
    throw new Error('Money must use bigint minor units');
  if (input.billAmountMinor < 0n) {
    throw new Error('billAmountMinor must be >= 0');
  }

  if (
    !/^[A-Z]{3}$/.test(input.currency) ||
    input.sources.some((source) => source.currency !== input.currency)
  )
    throw new Error('Funding sources must match the bill currency; convert explicitly first');

  let remaining = input.billAmountMinor;
  const lines: FundingAllocationLine[] = [];

  for (const source of input.sources) {
    if (remaining <= 0n) {
      lines.push({
        sourceId: source.id,
        label: source.label,
        allocatedMinor: 0n,
        restricted: false,
        reason: 'not_needed',
      });
      continue;
    }

    const categoryBlocked =
      Array.isArray(source.restrictedCategories) &&
      source.restrictedCategories.length > 0 &&
      !source.restrictedCategories.includes(input.billCategory ?? '');

    if (categoryBlocked) {
      lines.push({
        sourceId: source.id,
        label: source.label,
        allocatedMinor: 0n,
        restricted: true,
        reason: 'category_restriction',
      });
      continue;
    }

    const available = source.availableMinor > 0n ? source.availableMinor : 0n;
    const take = available < remaining ? available : remaining;
    remaining -= take;
    lines.push({
      sourceId: source.id,
      label: source.label,
      allocatedMinor: take,
      restricted: false,
      reason: take === 0n ? 'insufficient_source_balance' : undefined,
    });
  }

  return {
    lines,
    allocatedTotalMinor: input.billAmountMinor - remaining,
    shortfallMinor: remaining,
  };
}

import {
  AI_LIMITATION_NOTE,
  CHECK_LABELS,
  type CheckName,
  type CheckResult,
  type CheckSeverity,
  type CheckSource,
  type ValidationFinding,
  type ValidationPolicy,
} from '@healthwallet/shared';
import { SUPPORTED_CURRENCIES } from '../extraction/heuristic.js';
import type { AllocationRow, DuplicateCandidate, ValidationContext } from './context.js';

type FindingInput = {
  check: CheckName;
  result: CheckResult;
  severity: CheckSeverity;
  source?: CheckSource;
  evidence?: Record<string, unknown>;
  missingInfo?: string[];
  recommendedAction: string;
  modelVersion?: string | null;
};

function finding(policy: ValidationPolicy, input: FindingInput): ValidationFinding {
  return {
    check: input.check,
    label: CHECK_LABELS[input.check],
    result: input.result,
    severity: input.severity,
    source: input.source ?? 'deterministic',
    evidence: input.evidence ?? {},
    missingInfo: input.missingInfo ?? [],
    recommendedAction: input.recommendedAction,
    modelVersion: input.modelVersion ?? null,
    policyVersion: policy.version,
  };
}

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const normalizeRef = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function referenceSimilarity(a: string, b: string): number {
  const left = normalizeRef(a);
  const right = normalizeRef(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = (() => {
    const m = left.length;
    const n = right.length;
    const prev = new Array<number>(n + 1);
    const curr = new Array<number>(n + 1);
    for (let j = 0; j <= n; j += 1) prev[j] = j;
    for (let i = 1; i <= m; i += 1) {
      curr[0] = i;
      for (let j = 1; j <= n; j += 1)
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
        );
      for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
    }
    return prev[n];
  })();
  return 1 - distance / Math.max(left.length, right.length);
}

function allocationUsable(allocation: AllocationRow, now: number): boolean {
  const base =
    allocation.status === 'active' &&
    (!allocation.starts_at || new Date(allocation.starts_at).getTime() <= now) &&
    (!allocation.expires_at || new Date(allocation.expires_at).getTime() > now) &&
    Object.keys(allocation.rules ?? {}).length === 0;
  if (!base) return false;
  if (!allocation.program_id) return true;
  return (
    allocation.program_status === 'active' &&
    (!allocation.program_starts_at || new Date(allocation.program_starts_at).getTime() <= now) &&
    (!allocation.program_expires_at || new Date(allocation.program_expires_at).getTime() > now) &&
    allocation.program_rule_version_current === allocation.program_rule_version &&
    Object.keys(allocation.program_rules ?? {}).length === 0
  );
}

function allocationPermits(allocation: AllocationRow, ctx: ValidationContext): boolean {
  if (
    allocation.allowed_categories.length &&
    !allocation.allowed_categories.includes(ctx.bill.category)
  )
    return false;
  if (
    allocation.allowed_provider_ids.length &&
    !allocation.allowed_provider_ids.includes(ctx.bill.provider_organization_id ?? '')
  )
    return false;
  return true;
}

export function checkRequiredFields(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  const missing: string[] = [];
  if (!ctx.bill.currency) missing.push('currency');
  if (ctx.bill.total_amount_minor === null) missing.push('totalAmountMinor');
  if (!ctx.bill.provider_organization_id) missing.push('providerOrganizationId');
  if (!ctx.revision) missing.push('itemized invoice revision');
  else {
    if (!ctx.revision.reference) missing.push('reference');
    if (!ctx.revision.issue_date) missing.push('issueDate');
    if (!ctx.revision.items?.length) missing.push('lineItems');
    if (!ctx.revision.total_minor) missing.push('revisionTotal');
  }
  if (ctx.documents.length === 0) missing.push('billDocument');
  return finding(policy, {
    check: 'required_fields',
    result: missing.length ? 'fail' : 'pass',
    severity: missing.length ? 'error' : 'info',
    evidence: { missing },
    missingInfo: missing,
    recommendedAction: missing.length
      ? 'Provide the missing bill details and run validation again.'
      : 'No action needed.',
  });
}

export function checkBillArithmetic(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (!ctx.revision || ctx.items.length === 0)
    return finding(policy, {
      check: 'bill_arithmetic',
      result: 'unavailable',
      severity: 'info',
      missingInfo: ['itemized line items'],
      recommendedAction: 'Add itemized line items before arithmetic can be checked.',
    });
  const itemTotalSum = ctx.items.reduce(
    (sum, item) => sum + BigInt(item.quantity) * BigInt(item.unit_amount_minor),
    0n,
  );
  const itemLevelOk = ctx.items.every(
    (item) =>
      BigInt(item.total_amount_minor) === BigInt(item.quantity) * BigInt(item.unit_amount_minor),
  );
  const revisionTotal = BigInt(ctx.revision.total_minor);
  const billTotal =
    ctx.bill.total_amount_minor === null ? null : BigInt(ctx.bill.total_amount_minor);
  const currencyOk = ctx.items.every(
    (item) => item.currency === ctx.revision?.currency && item.currency === ctx.bill.currency,
  );
  const revisionOk = itemTotalSum === revisionTotal;
  const billOk = billTotal !== null && revisionTotal === billTotal;
  const ok = itemLevelOk && revisionOk && billOk && currencyOk;
  return finding(policy, {
    check: 'bill_arithmetic',
    result: ok ? 'pass' : 'fail',
    severity: ok ? 'info' : 'error',
    evidence: {
      itemTotalSum: itemTotalSum.toString(),
      revisionTotal: revisionTotal.toString(),
      billTotal: billTotal?.toString() ?? null,
      itemLevelOk,
      revisionOk,
      billOk,
      currencyOk,
    },
    missingInfo: currencyOk ? [] : ['consistent currency across items, revision and bill'],
    recommendedAction: ok
      ? 'No action needed.'
      : 'Correct the line items or total so the arithmetic agrees.',
  });
}

export function checkCustomerEligibility(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (!ctx.customer)
    return finding(policy, {
      check: 'customer_eligibility',
      result: 'fail',
      severity: 'blocking',
      recommendedAction: 'Decline with explanation: the customer account is not available.',
    });
  if (ctx.customer.suspended_at)
    return finding(policy, {
      check: 'customer_eligibility',
      result: 'fail',
      severity: 'blocking',
      evidence: { suspendedAt: ctx.customer.suspended_at },
      recommendedAction: 'Decline with explanation: the customer account is suspended.',
    });
  const healthConsent = ctx.consents.find((c) => c.consent_type === 'health_data' && c.granted);
  if (!healthConsent)
    return finding(policy, {
      check: 'customer_eligibility',
      result: 'uncertain',
      severity: 'warning',
      missingInfo: ['health_data consent'],
      recommendedAction: 'Ask the customer to grant health data consent before continuing.',
    });
  return finding(policy, {
    check: 'customer_eligibility',
    result: 'pass',
    severity: 'info',
    evidence: { consentVersion: healthConsent.version },
    recommendedAction: 'No action needed.',
  });
}

export function checkProviderVerification(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (!ctx.provider)
    return finding(policy, {
      check: 'provider_verification',
      result: 'fail',
      severity: 'error',
      missingInfo: ['provider'],
      recommendedAction: 'Await or request a verified provider record.',
    });
  const now = ctx.now.getTime();
  const detailsMatch =
    ctx.latestVerification?.verified_details &&
    ctx.latestVerification.verified_details.legalName === ctx.provider.legal_name &&
    ctx.latestVerification.verified_details.licenseNumber === ctx.provider.license_number;
  const verified =
    ctx.provider.status === 'verified' &&
    ctx.organizationStatus === 'approved' &&
    ctx.latestVerification?.method === 'registry_check' &&
    ctx.latestVerification?.status === 'verified' &&
    !!ctx.latestVerification.valid_until &&
    new Date(ctx.latestVerification.valid_until).getTime() > now &&
    detailsMatch;
  if (!verified)
    return finding(policy, {
      check: 'provider_verification',
      result: 'fail',
      severity: 'error',
      evidence: {
        providerStatus: ctx.provider.status,
        organizationStatus: ctx.organizationStatus,
        verificationMethod: ctx.latestVerification?.method ?? null,
        verificationStatus: ctx.latestVerification?.status ?? null,
        validUntil: ctx.latestVerification?.valid_until ?? null,
      },
      recommendedAction: 'Await provider confirmation and current registry verification.',
    });
  const confirmed =
    !!ctx.revision &&
    ctx.confirmations.some(
      (c) => c.kind === ctx.revision?.confirmation_kind && c.revision === ctx.revision?.revision,
    );
  if (!confirmed)
    return finding(policy, {
      check: 'provider_verification',
      result: 'fail',
      severity: 'error',
      evidence: { providerVerified: true, providerConfirmed: false },
      missingInfo: ['provider confirmation of the current revision'],
      recommendedAction: 'Await provider confirmation of the current invoice.',
    });
  return finding(policy, {
    check: 'provider_verification',
    result: 'pass',
    severity: 'info',
    evidence: { validUntil: ctx.latestVerification?.valid_until ?? null },
    recommendedAction: 'No action needed.',
  });
}

function sameServiceDate(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.slice(0, 10) === b.slice(0, 10);
}

export function checkExactDuplicate(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (ctx.bill.total_amount_minor === null || !ctx.bill.currency)
    return finding(policy, {
      check: 'exact_duplicate',
      result: 'unavailable',
      severity: 'info',
      missingInfo: ['bill total and currency'],
      recommendedAction: 'Resolve missing bill details before duplicate detection.',
    });
  const exact = ctx.duplicates.filter((candidate) => {
    if (candidate.provider_organization_id !== ctx.bill.provider_organization_id) return false;
    if (BigInt(candidate.total_amount_minor) !== BigInt(ctx.bill.total_amount_minor ?? 0))
      return false;
    const referenceMatch =
      candidate.reference &&
      ctx.revision?.reference &&
      normalizeRef(candidate.reference) === normalizeRef(ctx.revision.reference);
    const dateMatch = sameServiceDate(candidate.issue_date, ctx.revision?.issue_date ?? null);
    return Boolean(referenceMatch || dateMatch);
  });
  if (exact.length)
    return finding(policy, {
      check: 'exact_duplicate',
      result: 'fail',
      severity: 'blocking',
      evidence: {
        matches: exact.map((m) => ({ billId: m.id, status: m.status, reference: m.reference })),
      },
      recommendedAction: 'Do not pay automatically: send the suspected duplicate to human review.',
    });
  return finding(policy, {
    check: 'exact_duplicate',
    result: 'pass',
    severity: 'info',
    recommendedAction: 'No action needed.',
  });
}

export function checkNearDuplicate(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (ctx.bill.total_amount_minor === null || !ctx.bill.currency)
    return finding(policy, {
      check: 'near_duplicate',
      result: 'unavailable',
      severity: 'info',
      missingInfo: ['bill total and currency'],
      recommendedAction: 'Resolve missing bill details before near-duplicate detection.',
    });
  const total = BigInt(ctx.bill.total_amount_minor);
  const tolerance = (total * BigInt(policy.nearDuplicateToleranceBps)) / 10000n;
  const windowMs = policy.nearDuplicateWindowDays * 24 * 60 * 60 * 1000;
  const near = ctx.duplicates.filter((candidate) => {
    if (candidate.provider_organization_id !== ctx.bill.provider_organization_id) return false;
    const diff = BigInt(candidate.total_amount_minor) - total;
    if (diff < -tolerance || diff > tolerance) return false;
    const referenceSimilarityValue =
      candidate.reference && ctx.revision?.reference
        ? referenceSimilarity(candidate.reference, ctx.revision.reference)
        : 0;
    const referenceClose = referenceSimilarityValue >= policy.nearDuplicateReferenceSimilarity;
    const date = candidate.issue_date
      ? new Date(candidate.issue_date)
      : new Date(candidate.created_at);
    const withinWindow = ctx.now.getTime() - date.getTime() <= windowMs;
    return withinWindow && (referenceClose || diff === 0n);
  });
  if (near.length)
    return finding(policy, {
      check: 'near_duplicate',
      result: 'uncertain',
      severity: 'warning',
      evidence: {
        matches: near.map((m) => ({
          billId: m.id,
          status: m.status,
          totalMinor: m.total_amount_minor,
          reference: m.reference,
        })),
      },
      recommendedAction: 'Review the possible near-duplicate with a person before paying.',
    });
  return finding(policy, {
    check: 'near_duplicate',
    result: 'pass',
    severity: 'info',
    recommendedAction: 'No action needed.',
  });
}

export function checkDocumentConsistency(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  const run = ctx.aiRun;
  if (!run || !run.output)
    return finding(policy, {
      check: 'document_consistency',
      result: 'unavailable',
      severity: 'info',
      source: 'ai',
      missingInfo: ['extracted document fields'],
      recommendedAction: 'Run document extraction before comparing it with the bill.',
    });
  const out = run.output;
  if (out.unreadable)
    return finding(policy, {
      check: 'document_consistency',
      result: 'uncertain',
      severity: 'warning',
      source: 'ai',
      modelVersion: run.model_version,
      evidence: { unreadable: true, limitation: AI_LIMITATION_NOTE },
      recommendedAction: 'Route the document to human assistance; it could not be read.',
    });
  const conflicts: Array<{ field: string; document: unknown; bill: unknown }> = [];
  const fields = out.fields;
  if (fields.currency && ctx.revision && fields.currency !== ctx.revision.currency)
    conflicts.push({ field: 'currency', document: fields.currency, bill: ctx.revision.currency });
  if (
    fields.providerName &&
    ctx.bill.provider_name &&
    normalize(fields.providerName) !== normalize(ctx.bill.provider_name)
  )
    conflicts.push({
      field: 'providerName',
      document: fields.providerName,
      bill: ctx.bill.provider_name,
    });
  if (
    fields.totalAmountMinor !== null &&
    ctx.revision &&
    BigInt(fields.totalAmountMinor) !== BigInt(ctx.revision.total_minor)
  )
    conflicts.push({
      field: 'totalAmountMinor',
      document: fields.totalAmountMinor,
      bill: ctx.revision.total_minor,
    });
  if (
    out.derivedTotalMinor !== null &&
    ctx.revision &&
    BigInt(out.derivedTotalMinor) !== BigInt(ctx.revision.total_minor)
  )
    conflicts.push({
      field: 'derivedTotalMinor',
      document: out.derivedTotalMinor,
      bill: ctx.revision.total_minor,
    });
  if (
    fields.serviceDate &&
    ctx.revision &&
    !sameServiceDate(fields.serviceDate, ctx.revision.issue_date)
  )
    conflicts.push({
      field: 'serviceDate',
      document: fields.serviceDate,
      bill: ctx.revision.issue_date,
    });
  if (
    fields.billReference &&
    ctx.revision?.reference &&
    normalizeRef(fields.billReference) !== normalizeRef(ctx.revision.reference)
  )
    conflicts.push({
      field: 'billReference',
      document: fields.billReference,
      bill: ctx.revision.reference,
    });
  if (conflicts.length)
    return finding(policy, {
      check: 'document_consistency',
      result: 'fail',
      severity: 'error',
      source: 'ai',
      modelVersion: run.model_version,
      evidence: { conflicts, limitation: AI_LIMITATION_NOTE },
      recommendedAction:
        'Reconcile the document with the bill; a person must confirm which is correct.',
    });
  return finding(policy, {
    check: 'document_consistency',
    result: 'pass',
    severity: 'info',
    source: 'ai',
    modelVersion: run.model_version,
    evidence: { limitation: AI_LIMITATION_NOTE },
    recommendedAction: 'No action needed.',
  });
}

export function checkAvailableFunding(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (ctx.bill.total_amount_minor === null || !ctx.bill.currency)
    return finding(policy, {
      check: 'available_funding',
      result: 'unavailable',
      severity: 'info',
      missingInfo: ['bill total and currency'],
      recommendedAction: 'Resolve the bill total and currency before checking funding.',
    });
  if (!SUPPORTED_CURRENCIES.includes(ctx.bill.currency as (typeof SUPPORTED_CURRENCIES)[number]))
    return finding(policy, {
      check: 'available_funding',
      result: 'fail',
      severity: 'error',
      evidence: { currency: ctx.bill.currency },
      recommendedAction: 'Only LRD and USD are supported for payment.',
    });
  const now = ctx.now.getTime();
  const available = ctx.allocations
    .filter((a) => allocationUsable(a, now))
    .reduce((sum, a) => sum + BigInt(a.available_minor), 0n);
  const required = BigInt(ctx.bill.total_amount_minor);
  const ok = available >= required;
  return finding(policy, {
    check: 'available_funding',
    result: ok ? 'pass' : 'fail',
    severity: ok ? 'info' : 'error',
    evidence: {
      available: available.toString(),
      required: required.toString(),
      currency: ctx.bill.currency,
    },
    missingInfo: ok
      ? []
      : [`funding shortfall of ${(required - available).toString()} minor units`],
    recommendedAction: ok
      ? 'No action needed.'
      : 'Add funds or adjust funding sources so the available balance covers the bill.',
  });
}

export function checkFundingRestrictions(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  const now = ctx.now.getTime();
  const relevant = ctx.allocations.filter(
    (a) => allocationUsable(a, now) && BigInt(a.available_minor) > 0n,
  );
  if (relevant.length === 0)
    return finding(policy, {
      check: 'funding_restrictions',
      result: 'not_applicable',
      severity: 'info',
      evidence: { reason: 'no_usable_allocations' },
      recommendedAction: 'Available funding is handled by the funding balance check.',
    });
  const usable = relevant.filter((a) => allocationPermits(a, ctx));
  if (usable.length)
    return finding(policy, {
      check: 'funding_restrictions',
      result: 'pass',
      severity: 'info',
      evidence: { permittedSources: usable.map((a) => a.source) },
      recommendedAction: 'No action needed.',
    });
  return finding(policy, {
    check: 'funding_restrictions',
    result: 'fail',
    severity: 'error',
    evidence: {
      blocked: relevant.map((a) => ({
        source: a.source,
        allowedCategories: a.allowed_categories,
        allowedProviderIds: a.allowed_provider_ids,
      })),
      billCategory: ctx.bill.category,
      providerOrganizationId: ctx.bill.provider_organization_id,
    },
    recommendedAction:
      'A reviewer or program manager must approve funding outside its restrictions.',
  });
}

export function checkPriceAnomaly(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (!ctx.priceDataset)
    return finding(policy, {
      check: 'price_anomaly',
      result: 'unavailable',
      severity: 'info',
      source: 'external',
      evidence: { datasetPresent: false },
      missingInfo: ['a credible price comparison dataset'],
      recommendedAction:
        'Price anomalies are only checked where a credible comparison dataset exists.',
    });
  return finding(policy, {
    check: 'price_anomaly',
    result: 'not_applicable',
    severity: 'info',
    source: 'external',
    evidence: { datasetPresent: true },
    recommendedAction: 'No comparison rows matched this bill.',
  });
}

export function checkCoverageEligibility(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  if (ctx.coverage.length === 0)
    return finding(policy, {
      check: 'coverage_eligibility',
      result: 'unavailable',
      severity: 'info',
      source: 'external',
      evidence: { insuranceDataset: ctx.insuranceDataset, records: 0 },
      missingInfo: ['a verified insurance or voucher eligibility record'],
      recommendedAction:
        'Coverage is only checked where verified records exist; bill the customer funds instead.',
    });
  const now = ctx.now.getTime();
  const eligible = ctx.coverage.filter(
    (record) =>
      record.status !== 'cancelled' &&
      (!record.expires_at || new Date(record.expires_at).getTime() > now) &&
      (record.allowed_categories.length === 0 ||
        record.allowed_categories.includes(ctx.bill.category)) &&
      (record.allowed_provider_ids.length === 0 ||
        record.allowed_provider_ids.includes(ctx.bill.provider_organization_id ?? '')),
  );
  if (eligible.length)
    return finding(policy, {
      check: 'coverage_eligibility',
      result: 'pass',
      severity: 'info',
      source: 'external',
      evidence: { records: eligible.map((r) => ({ kind: r.kind, id: r.id })) },
      recommendedAction: 'No action needed.',
    });
  return finding(policy, {
    check: 'coverage_eligibility',
    result: 'fail',
    severity: 'warning',
    source: 'external',
    evidence: {
      records: ctx.coverage.map((r) => ({
        kind: r.kind,
        id: r.id,
        allowedCategories: r.allowed_categories,
        expiresAt: r.expires_at,
      })),
      billCategory: ctx.bill.category,
    },
    recommendedAction:
      'The verified coverage does not cover this service; a reviewer must confirm.',
  });
}

export function checkAiDocumentAnalysis(
  ctx: ValidationContext,
  policy: ValidationPolicy,
): ValidationFinding {
  const run = ctx.aiRun;
  if (!run || !run.output)
    return finding(policy, {
      check: 'ai_document_analysis',
      result: 'unavailable',
      severity: 'info',
      source: 'ai',
      missingInfo: ['document extraction'],
      recommendedAction: 'Run document extraction before AI-supported analysis.',
    });
  const out = run.output;
  const untrusted = out.evidence.some((item) => item.kind === 'untrusted');
  const lowConfidence = (run.confidence_bps ?? 0) < 7500;
  const evidence = {
    confidenceBps: run.confidence_bps,
    unreadable: out.unreadable,
    ambiguous: out.ambiguous,
    untrustedInstructions: untrusted,
    limitation: AI_LIMITATION_NOTE,
    treatmentOccurredConclusion: false,
  };
  const base = { modelVersion: run.model_version, source: 'ai' as const, evidence };
  if (out.unreadable)
    return finding(policy, {
      check: 'ai_document_analysis',
      result: 'uncertain',
      severity: 'warning',
      ...base,
      recommendedAction: 'Route to human assistance; AI could not read the document.',
    });
  if (untrusted)
    return finding(policy, {
      check: 'ai_document_analysis',
      result: 'fail',
      severity: 'blocking',
      ...base,
      recommendedAction:
        'Treat in-document instructions as untrusted data and review the bill as potential fraud.',
    });
  if (out.ambiguous.length)
    return finding(policy, {
      check: 'ai_document_analysis',
      result: 'uncertain',
      severity: 'warning',
      ...base,
      missingInfo: out.ambiguous.map((field) => `confirmation for ${field}`),
      recommendedAction: 'Ask the customer to confirm the ambiguous fields.',
    });
  if (lowConfidence)
    return finding(policy, {
      check: 'ai_document_analysis',
      result: 'warn',
      severity: 'error',
      ...base,
      recommendedAction: 'A person must confirm the extraction because confidence is low.',
    });
  return finding(policy, {
    check: 'ai_document_analysis',
    result: 'pass',
    severity: 'info',
    ...base,
    recommendedAction: `No action needed. ${AI_LIMITATION_NOTE}`,
  });
}

export const CHECKS = [
  checkRequiredFields,
  checkBillArithmetic,
  checkCustomerEligibility,
  checkProviderVerification,
  checkExactDuplicate,
  checkNearDuplicate,
  checkDocumentConsistency,
  checkAvailableFunding,
  checkFundingRestrictions,
  checkPriceAnomaly,
  checkCoverageEligibility,
  checkAiDocumentAnalysis,
];

export function runChecks(ctx: ValidationContext, policy: ValidationPolicy): ValidationFinding[] {
  return CHECKS.map((check) => check(ctx, policy));
}

export type { DuplicateCandidate };

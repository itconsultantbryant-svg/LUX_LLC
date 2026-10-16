import { z } from 'zod';

/**
 * Hybrid validation: deterministic rules, AI-supported analysis and verified
 * external records. AI is used only to compare a document against the bill and
 * to surface inconsistencies and untrusted content. It is never used to decide
 * that treatment occurred, and it never authorizes money movement.
 */

export const CHECK_NAMES = [
  'required_fields',
  'bill_arithmetic',
  'customer_eligibility',
  'provider_verification',
  'exact_duplicate',
  'near_duplicate',
  'document_consistency',
  'available_funding',
  'funding_restrictions',
  'price_anomaly',
  'coverage_eligibility',
  'ai_document_analysis',
] as const;

export const CheckNameSchema = z.enum(CHECK_NAMES);
export type CheckName = z.infer<typeof CheckNameSchema>;

export const CHECK_LABELS: Record<CheckName, string> = {
  required_fields: 'Required fields',
  bill_arithmetic: 'Bill arithmetic',
  customer_eligibility: 'Customer eligibility',
  provider_verification: 'Provider verification status',
  exact_duplicate: 'Exact duplicates',
  near_duplicate: 'Potential near-duplicates',
  document_consistency: 'Inconsistent document details',
  available_funding: 'Available funding',
  funding_restrictions: 'Funding restrictions',
  price_anomaly: 'Price anomalies',
  coverage_eligibility: 'Insurance or voucher eligibility',
  ai_document_analysis: 'AI document analysis',
};

/** `unavailable` means the check could not run for lack of a verified dataset. */
export const CheckResultSchema = z.enum([
  'pass',
  'info',
  'warn',
  'fail',
  'uncertain',
  'unavailable',
  'not_applicable',
]);
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const CheckSeveritySchema = z.enum(['info', 'warning', 'error', 'blocking']);
export type CheckSeverity = z.infer<typeof CheckSeveritySchema>;

/** Provenance of a finding. AI findings can never authorize payment. */
export const CheckSourceSchema = z.enum(['deterministic', 'ai', 'external']);
export type CheckSource = z.infer<typeof CheckSourceSchema>;

export const RouteSchema = z.enum([
  'auto_accept',
  'needs_correction',
  'await_provider',
  'await_review',
  'decline',
]);
export type Route = z.infer<typeof RouteSchema>;

export const CustomerStatusSchema = z.enum([
  'needs_correction',
  'validation_complete',
  'awaiting_provider',
  'awaiting_review',
  'ready_for_payment',
  'payment_pending',
  'paid',
  'declined',
]);
export type CustomerStatus = z.infer<typeof CustomerStatusSchema>;

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  needs_correction: 'Needs your correction',
  validation_complete: 'Validation complete',
  awaiting_provider: 'Awaiting provider confirmation',
  awaiting_review: 'Awaiting review',
  ready_for_payment: 'Ready for payment authorization',
  payment_pending: 'Payment pending',
  paid: 'Paid',
  declined: 'Declined with explanation',
};

export const ValidationFindingSchema = z.object({
  check: CheckNameSchema,
  label: z.string(),
  result: CheckResultSchema,
  severity: CheckSeveritySchema,
  source: CheckSourceSchema,
  evidence: z.record(z.string(), z.unknown()).default({}),
  missingInfo: z.array(z.string()).default([]),
  recommendedAction: z.string().max(500),
  modelVersion: z.string().nullable().default(null),
  policyVersion: z.string(),
});
export type ValidationFinding = z.infer<typeof ValidationFindingSchema>;

/** Human review actions. Every action requires a recorded reason. */
export const ReviewerActionSchema = z.enum([
  'request_clarification',
  'correct_finding',
  'approve',
  'decline',
  'escalate',
  'appeal',
  'resolve',
]);
export type ReviewerAction = z.infer<typeof ReviewerActionSchema>;

export const AI_LIMITATION_NOTE =
  'AI compares the document with the bill and flags inconsistencies. It cannot establish, from a bill alone, whether treatment actually occurred.';

export const VALIDATION_POLICY_VERSION = 'lux-validation-v1';
export const RULES_MODEL_VERSION = 'hybrid-rules-v1';

export const ValidationPolicySchema = z.object({
  version: z.string(),
  status: z.enum(['approved', 'draft', 'retired']),
  approvedBy: z.string(),
  approvedAt: z.string(),
  /** Bills above this become high-risk and always require human review. */
  autoAcceptMaxMinor: z.string(),
  /** Largest amount a single reviewer may authorize without escalation. */
  reviewerAuthorityMinor: z.string(),
  nearDuplicateWindowDays: z.number().int().min(1).max(365),
  /** Amount tolerance for a near-duplicate, in basis points. */
  nearDuplicateToleranceBps: z.number().int().min(0).max(10000),
  /** Reference similarity (0..1) above which a reference counts as near-identical. */
  nearDuplicateReferenceSimilarity: z.number().min(0).max(1),
  /** Approved routing for each check when it fails or is uncertain. */
  checkRoutes: z.record(CheckNameSchema, RouteSchema),
});
export type ValidationPolicy = z.infer<typeof ValidationPolicySchema>;

export const APPROVED_VALIDATION_POLICY: ValidationPolicy = {
  version: VALIDATION_POLICY_VERSION,
  status: 'approved',
  approvedBy: 'LUX HealthTrust program office',
  approvedAt: '2026-01-01T00:00:00.000Z',
  autoAcceptMaxMinor: '500000',
  reviewerAuthorityMinor: '250000',
  nearDuplicateWindowDays: 45,
  nearDuplicateToleranceBps: 200,
  nearDuplicateReferenceSimilarity: 0.85,
  checkRoutes: {
    required_fields: 'needs_correction',
    bill_arithmetic: 'needs_correction',
    customer_eligibility: 'decline',
    provider_verification: 'await_provider',
    exact_duplicate: 'await_review',
    near_duplicate: 'await_review',
    document_consistency: 'await_review',
    available_funding: 'needs_correction',
    funding_restrictions: 'await_review',
    price_anomaly: 'await_review',
    coverage_eligibility: 'await_review',
    ai_document_analysis: 'await_review',
  },
};

/** Route precedence: the safest human-oversight outcome wins. */
const ROUTE_PRECEDENCE: Route[] = [
  'decline',
  'await_review',
  'await_provider',
  'needs_correction',
  'auto_accept',
];

const ROUTE_CUSTOMER_STATUS: Record<Route, CustomerStatus> = {
  decline: 'declined',
  await_review: 'awaiting_review',
  await_provider: 'awaiting_provider',
  needs_correction: 'needs_correction',
  auto_accept: 'validation_complete',
};

export function isTriggering(finding: ValidationFinding): boolean {
  if (finding.result === 'fail' || finding.result === 'uncertain') return true;
  return (
    finding.result === 'warn' && (finding.severity === 'error' || finding.severity === 'blocking')
  );
}

export type RouteDecision = {
  route: Route;
  customerStatus: CustomerStatus;
  triggers: CheckName[];
  /** True when the safest route is automatic acceptance of a valid, low-risk bill. */
  autoAccepted: boolean;
};

/**
 * Approved automated routing. Uncertain, conflicting, high-risk and exceptional
 * cases are never forced into automatic approval: any triggering finding routes
 * to its policy action, and the safest action across all findings wins.
 */
export function decideRoute(
  findings: ValidationFinding[],
  policy: ValidationPolicy,
  totalMinor: bigint,
): RouteDecision {
  const triggers = findings.filter(isTriggering);
  const routes = new Set<Route>();
  for (const finding of triggers) routes.add(policy.checkRoutes[finding.check] ?? 'await_review');

  const highRisk = totalMinor > BigInt(policy.autoAcceptMaxMinor);
  if (highRisk) routes.add('await_review');

  const ordered = ROUTE_PRECEDENCE.filter((route) => routes.has(route));
  const route = ordered[0] ?? 'auto_accept';

  const statuses = new Set(findings.filter((f) => f.result === 'pass').map((f) => f.check));
  const fundingOk = statuses.has('available_funding') && statuses.has('funding_restrictions');
  const customerStatus: CustomerStatus =
    route === 'auto_accept'
      ? fundingOk
        ? 'ready_for_payment'
        : 'validation_complete'
      : ROUTE_CUSTOMER_STATUS[route];

  return {
    route,
    customerStatus,
    triggers: triggers.map((f) => f.check),
    autoAccepted: route === 'auto_accept',
  };
}

export function overallResult(findings: ValidationFinding[]) {
  if (findings.some((f) => f.result === 'fail')) return 'fail' as const;
  if (findings.some((f) => f.result === 'uncertain')) return 'uncertain' as const;
  if (findings.some((f) => f.result === 'warn')) return 'warn' as const;
  return 'pass' as const;
}

type PaymentLike = { status: string } | null;

/** Combine the validation decision with the payment lifecycle for the customer. */
export function deriveCustomerStatus(
  runStatus: CustomerStatus,
  payment: PaymentLike,
): CustomerStatus {
  if (payment) {
    if (['paid', 'captured', 'ledger_captured', 'succeeded'].includes(payment.status))
      return 'paid';
    if (!['failed', 'cancelled'].includes(payment.status)) return 'payment_pending';
  }
  return runStatus;
}

export const ValidationRunSchema = z.object({
  id: z.string(),
  billId: z.string(),
  policyVersion: z.string(),
  modelVersion: z.string(),
  route: RouteSchema,
  customerStatus: CustomerStatusSchema,
  overall: z.enum(['pass', 'warn', 'fail', 'uncertain']),
  totalMinor: z.string(),
  currency: z.string(),
  findings: z.array(ValidationFindingSchema),
  createdAt: z.string(),
});
export type ValidationRun = z.infer<typeof ValidationRunSchema>;

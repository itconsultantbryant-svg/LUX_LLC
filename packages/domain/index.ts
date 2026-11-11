import { z } from "zod";
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 409,
    message = code.replaceAll("_", " "),
  ) {
    super(message);
  }
}
export const currency = z.enum(["USD", "LRD"]);
export const minor = z.string().regex(/^(0|[1-9]\d{0,11})$/);
export type FeeMode = "UNCONFIGURED" | "INSURER_ADDED" | "FACILITY_DEDUCTED";
export function fees(base: bigint, mode: FeeMode) {
  if (base <= 0n) throw new DomainError("INVALID_AMOUNT", 422);
  if (mode === "UNCONFIGURED") throw new DomainError("FEE_POLICY_UNCONFIGURED");
  const total = (base * 2n + 50n) / 100n; // half up; odd residual belongs to Orange
  const lux = total / 2n,
    orange = total - lux;
  return {
    base: String(base),
    total: String(total),
    lux: String(lux),
    orange: String(orange),
    insurerDebit: String(mode === "INSURER_ADDED" ? base + total : base),
    facilityNet: String(mode === "FACILITY_DEDUCTED" ? base - total : base),
    mode,
  };
}
export const claimStates = [
  "DRAFT",
  "SUBMITTED",
  "VALIDATING",
  "AWAITING_REVIEW",
  "NEEDS_INFORMATION",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type ClaimState = (typeof claimStates)[number];
const claimTransitions: Record<ClaimState, readonly ClaimState[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["VALIDATING", "WITHDRAWN"],
  VALIDATING: ["AWAITING_REVIEW", "NEEDS_INFORMATION"],
  AWAITING_REVIEW: [
    "NEEDS_INFORMATION",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "WITHDRAWN",
  ],
  NEEDS_INFORMATION: ["DRAFT", "WITHDRAWN"],
  APPROVED: [],
  PARTIALLY_APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};
export function transitionClaim(from: ClaimState, to: ClaimState) {
  if (!claimTransitions[from]?.includes(to))
    throw new DomainError("INVALID_CLAIM_TRANSITION");
  return to;
}
export const paymentStates = [
  "CREATED",
  "AWAITING_AUTHORIZATION",
  "AUTHORIZED",
  "AWAITING_FUNDS",
  "PROCESSING",
  "UNKNOWN_PENDING_INVESTIGATION",
  "SETTLED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
] as const;
export type PaymentState = (typeof paymentStates)[number];
const paymentTransitions: Record<PaymentState, readonly PaymentState[]> = {
  CREATED: ["AWAITING_AUTHORIZATION"],
  AWAITING_AUTHORIZATION: ["AUTHORIZED", "CANCELLED"],
  AUTHORIZED: ["PROCESSING", "AWAITING_FUNDS", "CANCELLED"],
  AWAITING_FUNDS: ["PROCESSING", "CANCELLED"],
  PROCESSING: [
    "SETTLED",
    "FAILED",
    "UNKNOWN_PENDING_INVESTIGATION",
    "AWAITING_FUNDS",
  ],
  UNKNOWN_PENDING_INVESTIGATION: ["SETTLED", "FAILED"],
  SETTLED: ["REVERSED"],
  FAILED: [],
  CANCELLED: [],
  REVERSED: [],
};
export function transitionPayment(from: PaymentState, to: PaymentState) {
  if (from === to) return from;
  if (!paymentTransitions[from]?.includes(to))
    throw new DomainError("INVALID_PAYMENT_TRANSITION");
  return to;
}
export const roles = {
  PLATFORM_ADMIN: ["organizations", "cms", "operations", "audit", "support"],
  SUPPORT: ["support", "operations"],
  LUX_FINANCE: ["fees", "reconciliation"],
  FACILITY_ADMIN: ["users", "settings", "contracts", "destination"],
  FACILITY_CLINICIAN: ["clinical", "encounters.write"],
  FACILITY_CLAIMS: ["claims", "eligibility", "clinical"],
  FACILITY_FINANCE: ["payments.read", "reconciliation", "reports"],
  INSURER_ADMIN: ["users", "settings", "contracts", "coverage"],
  INSURER_REVIEWER: ["review", "claims", "clinical"],
  INSURER_FINANCE: [
    "payments.read",
    "payments.authorize",
    "payments.execute",
    "reconciliation",
    "reports",
  ],
  INSURER_AUDITOR: ["claims", "clinical", "payments.read", "audit", "reports"],
  ORANGE_OBSERVER: ["fees"],
} as const;
export type Role = keyof typeof roles;
export function permissions(names: string[]) {
  return [...new Set(names.flatMap((r) => roles[r as Role] || []))];
}
export const billItem = z.object({
  code: z.string().min(1).max(40),
  description: z.string().min(1).max(240),
  quantity: z.number().int().min(1).max(1000),
  unitMinor: minor,
});
export function billTotal(items: z.infer<typeof billItem>[]) {
  return items.reduce(
    (a, i) => a + BigInt(i.quantity) * BigInt(i.unitMinor),
    0n,
  );
}
export const enquirySchema = z.object({
  kind: z.enum(["FACILITY", "INSURER", "GENERAL"]),
  organization: z.string().trim().min(2).max(160),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().trim().min(7).max(32),
  location: z.string().trim().min(2).max(180),
  message: z.string().trim().min(10).max(2000),
  consent: z.literal(true),
  website: z.string().max(0).optional(),
});
export const claimSchema = z.object({
  patientId: z.uuid(),
  insurerId: z.uuid(),
  encounterId: z.uuid(),
  eligibilityId: z.uuid(),
  currency,
  items: z.array(billItem).min(1).max(100),
});
export const decisionSchema = z.object({
  outcome: z.enum([
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "NEEDS_INFORMATION",
  ]),
  reason: z.string().trim().min(5).max(2000),
  approvedMinor: minor,
});
export const findingSchema = z.object({
  field: z.string().max(120),
  category: z.enum([
    "COMPLETENESS",
    "CONSISTENCY",
    "COVERAGE",
    "TARIFF",
    "DUPLICATE",
  ]),
  severity: z.enum(["INFO", "REVIEW", "ERROR"]),
  reason: z.string().max(1000),
  evidence: z.string().max(240),
  confidence: z.number().min(0).max(1).nullable(),
});
export function parseAI(value: unknown) {
  return z
    .object({ findings: z.array(findingSchema).max(50) })
    .strict()
    .parse(value);
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function canSeeClaim(
  org: string,
  claim: { facility_id: string; insurer_id: string },
) {
  return org === claim.facility_id || org === claim.insurer_id;
}

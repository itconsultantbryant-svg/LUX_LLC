import { transaction, one, type DB } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
import { assistValidation } from "./adapters.ts";
import {
  claimAccess,
  requirePermission,
  type Context,
} from "./access.ts";

export type ValidationFinding = {
  field: string;
  category: string;
  reason: string;
  evidence: string;
  severity: "INFO" | "REVIEW" | "ERROR";
  confidence: number | null;
};

export type ValidationCheck = {
  name: string;
  status: "PASS" | "REVIEW";
  detail: string;
};

function riskFor(findings: ValidationFinding[]) {
  const score = Math.min(
    100,
    findings.reduce(
      (total, finding) =>
        total +
        (finding.severity === "ERROR" ? 25 : finding.severity === "REVIEW" ? 12 : 0) +
        (finding.category === "DUPLICATE" ? 10 : 0),
      0,
    ),
  );
  return {
    score,
    level: score >= 50 ? "HIGH" : score >= 20 ? "MEDIUM" : score > 0 ? "LOW" : "CLEAR",
  };
}

/**
 * Deterministic, evidence-only claim assistance. It never makes an insurance
 * decision, never approves payment and never infers clinical facts. Every run
 * ends at AWAITING_REVIEW so an authorized insurer human records the decision.
 */
export async function runClaimValidation(
  db: DB,
  input: {
    claimId: string;
    submissionVersion: number;
    facilityId?: string;
    insurerId?: string;
  },
  assist = assistValidation,
) {
  const scope = input.facilityId ? "facility_id" : "insurer_id";
  const scopeValue = input.facilityId || input.insurerId;
  if (!scopeValue) throw new DomainError("VALIDATION_SCOPE_REQUIRED", 422);
  const c = await one(
    db,
    `SELECT * FROM claims WHERE id=$1 AND ${scope}=$2 FOR UPDATE`,
    [input.claimId, scopeValue],
  );
  if (
    !c ||
    c.state !== "SUBMITTED" ||
    c.submission_version !== input.submissionVersion
  )
    return null;

  await db.query(
    `UPDATE claims SET state='VALIDATING',version=version+1 WHERE id=$1`,
    [c.id],
  );
  const version = await one(
    db,
    "SELECT snapshot FROM claim_versions WHERE claim_id=$1 AND version=$2",
    [c.id, c.submission_version],
  );
  const run = await one(
    db,
    `INSERT INTO validation_runs(claim_id,input_version,ruleset_version,model_version,status) VALUES($1,$2,'pilot-completeness-v2','deterministic-evidence-v2','RUNNING') RETURNING id`,
    [c.id, c.submission_version],
  );
  const snapshot = version?.snapshot || {};
  const findings: ValidationFinding[] = [];
  const checks: ValidationCheck[] = [];
  const add = (
    field: string,
    category: string,
    reason: string,
    evidence: string,
    severity: "INFO" | "REVIEW" | "ERROR" = "REVIEW",
    confidence: number | null = null,
  ) => {
    findings.push({
      field,
      category,
      reason,
      evidence,
      severity,
      confidence,
    });
    checks.push({
      name: category.charAt(0) + category.slice(1).toLowerCase(),
      status: "REVIEW",
      detail: reason,
    });
  };

  if (
    snapshot.eligibility?.status !== "ACTIVE" ||
    Date.now() - new Date(snapshot.eligibility?.checked_at).getTime() > 86400000
  )
    add(
      "eligibility",
      "COVERAGE",
      "Coverage is uncertain or stale. Insurer verification is required.",
      "eligibility snapshot",
    );
  else
    checks.push({
      name: "Coverage",
      status: "PASS",
      detail: "Active insurer eligibility snapshot from the authorized source.",
    });

  if (!snapshot.encounter?.notes || !snapshot.encounter?.diagnosis)
    add(
      "encounter",
      "COMPLETENESS",
      "Encounter documentation is incomplete.",
      "submitted encounter",
      "ERROR",
    );
  else
    checks.push({
      name: "Completeness",
      status: "PASS",
      detail: "Diagnosis and encounter notes are present.",
    });

  const payrollCover = await one(
    db,
    `SELECT s.status,p.name package_name,b.level,b.label
       FROM payroll_subscriptions s
       JOIN insurance_packages p ON p.id=s.package_id
       JOIN payroll_bands b ON b.id=s.band_id
      WHERE s.patient_id=$1 AND s.insurer_id=$2 AND s.status='ACTIVE'`,
    [c.patient_id, c.insurer_id],
  );
  if (!payrollCover)
    add(
      "payroll",
      "COVERAGE",
      "No active payroll subscription is recorded for this member. Insurer verification is required.",
      "payroll subscription",
    );
  else
    checks.push({
      name: "Payroll cover",
      status: "PASS",
      detail: `${payrollCover.package_name} · ${payrollCover.label} · salary deduction active.`,
    });

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const billTotal = items.reduce(
    (sum: bigint, item: any) =>
      sum + BigInt(item.quantity) * BigInt(item.unit_minor),
    0n,
  );
  if (BigInt(c.submitted_minor) !== billTotal)
    add(
      "submitted_minor",
      "CONSISTENCY",
      "The submitted claim total does not match the itemized bill.",
      `claim ${c.submitted_minor} vs items ${billTotal}`,
      "ERROR",
    );
  else
    checks.push({
      name: "Bill consistency",
      status: "PASS",
      detail: "Submitted total equals the itemized bill.",
    });

  if (
    snapshot.encounter?.service_date &&
    new Date(snapshot.encounter.service_date).getTime() > Date.now() + 86400000
  )
    add(
      "encounter.service_date",
      "CONSISTENCY",
      "The service date is in the future.",
      String(snapshot.encounter.service_date),
      "ERROR",
    );

  let tariffExact = true;
  for (const item of items) {
    const tariff = await one(
      db,
      `SELECT ti.* FROM tariff_items ti JOIN tariff_sets ts ON ts.id=ti.tariff_set_id WHERE ts.insurer_id=$1 AND ti.code=$2 AND ti.currency=$3 AND $4::date BETWEEN ts.effective_from AND ts.effective_to ORDER BY ts.version DESC LIMIT 1`,
      [c.insurer_id, item.code, c.currency, snapshot.encounter?.service_date],
    );
    if (!tariff) {
      tariffExact = false;
      add(
        "item." + item.id,
        "TARIFF",
        "No applicable pilot tariff found.",
        "bill item " + item.code,
      );
    } else if (BigInt(item.unit_minor) > BigInt(tariff.max_unit_minor)) {
      tariffExact = false;
      add(
        "item." + item.id,
        "TARIFF",
        "Submitted unit charge exceeds the applicable tariff.",
        "tariff " + tariff.id,
      );
    }
  }
  if (tariffExact)
    checks.push({
      name: "Tariff",
      status: "PASS",
      detail: "Every item is within the applicable pilot tariff.",
    });

  const duplicate = await one(
    db,
    `SELECT reference FROM claims WHERE id<>$1 AND patient_id=$2 AND insurer_id=$3 AND submitted_minor=$4 AND created_at>$5::timestamptz-interval '7 days' AND state<>'DRAFT' LIMIT 1`,
    [c.id, c.patient_id, c.insurer_id, c.submitted_minor, c.created_at],
  );
  if (duplicate)
    add(
      "claim",
      "DUPLICATE",
      "A similar submission exists; repeat care may still be valid.",
      "claim " + duplicate.reference,
    );
  else
    checks.push({
      name: "Duplicate detection",
      status: "PASS",
      detail: "No similar recent claim found for this member.",
    });

  let advisoryUnavailable = false;
  let runStatus = "COMPLETED";
  let processingError: string | null = null;
  try {
    const ai = await assist(snapshot);
    for (const finding of ai.findings) findings.push(finding as ValidationFinding);
  } catch {
    advisoryUnavailable = true;
    runStatus = "PROCESSING_ERROR";
    processingError = "AI_ADAPTER_UNAVAILABLE";
  }

  const risk = riskFor(findings);
  const summary = {
    checks,
    riskLevel: risk.level,
    recommendation:
      risk.score === 0
        ? "No automated exceptions. Insurer human decision remains required."
        : risk.level === "HIGH"
          ? "Human review required before any decision."
          : "Review the flagged items before recording a decision.",
    advisory: advisoryUnavailable
      ? "Advisory extraction did not complete. Deterministic checks still ran; no adverse inference is drawn."
      : "Advisory checks returned no additional findings.",
    clean: findings.length === 0,
    automaticDecision: false,
    note: "AI assistance never approves a claim, rejects a claim or moves money.",
  };
  await db.query(
    `UPDATE validation_runs SET status=$2,processing_error=$3,completed_at=now(),risk_score=$4,summary=$5 WHERE id=$1`,
    [run.id, runStatus, processingError, risk.score, JSON.stringify(summary)],
  );
  for (const f of findings)
    await db.query(
      "INSERT INTO findings(validation_run_id,field,category,severity,reason,evidence,confidence) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [run.id, f.field, f.category, f.severity, f.reason, f.evidence, f.confidence],
    );
  // Even a clean deterministic run always requires an insurer human decision.
  await db.query(
    `UPDATE claims SET state='AWAITING_REVIEW',version=version+1,updated_at=now() WHERE id=$1`,
    [c.id],
  );
  await db.query(
    `INSERT INTO outbox_events(type,organization_id,resource_id) VALUES('ValidationCompleted',$1,$2)`,
    [c.insurer_id, c.id],
  );
  await db.query(
    `INSERT INTO audit_events(organization_id,action,resource_id,metadata) VALUES($1,'ValidationCompleted',$2,$3)`,
    [c.insurer_id, c.id, { riskScore: risk.score, riskLevel: risk.level }],
  );
  return {
    runId: run.id,
    riskScore: risk.score,
    riskLevel: risk.level,
    findings: findings.length,
    checks,
    recommendation: summary.recommendation,
    automaticDecision: false,
  };
}

export async function validateClaimNow(ctx: Context, id: string) {
  requirePermission(ctx, "review");
  return transaction(async (db) => {
    const c = await claimAccess(db, ctx, id);
    if (c.insurer_id !== ctx.orgId)
      throw new DomainError("PERMISSION_DENIED", 403);
    if (!["SUBMITTED", "VALIDATING"].includes(c.state))
      throw new DomainError("VALIDATION_NOT_AVAILABLE");
    const result = await runClaimValidation(db, {
      claimId: id,
      insurerId: ctx.orgId,
      submissionVersion: c.submission_version,
    });
    if (!result) throw new DomainError("VALIDATION_NOT_AVAILABLE");
    return result;
  });
}

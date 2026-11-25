import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { pool, transaction, one } from "../../../packages/db/index.ts";
import { DomainError, minor } from "../../../packages/domain/index.ts";
import { audit, requirePermission, type Context } from "./access.ts";
import { mode, sendMail } from "./auth.ts";

const OPEN_CLAIM_STATES = [
  "SUBMITTED",
  "VALIDATING",
  "AWAITING_REVIEW",
  "NEEDS_INFORMATION",
];
const DECIDED_CLAIM_STATES = ["APPROVED", "PARTIALLY_APPROVED"];

function patientScope(ctx: Context) {
  if (
    ctx.orgType !== "PATIENT" ||
    !ctx.patientId ||
    !ctx.patientInsurerId ||
    !ctx.patientReferenceId
  )
    throw new DomainError("PERMISSION_DENIED", 403);
  return {
    patientId: ctx.patientId,
    insurerId: ctx.patientInsurerId,
    referenceId: ctx.patientReferenceId,
  };
}

function requireInsurerCoverage(ctx: Context) {
  if (ctx.orgType !== "INSURER")
    throw new DomainError("PERMISSION_DENIED", 403);
  requirePermission(ctx, "coverage");
}

function remaining(limit: bigint | null, used: bigint) {
  if (limit === null) return null;
  return String(limit > used ? limit - used : 0n);
}

function utilization(used: bigint, limit: bigint | null) {
  if (limit === null || limit <= 0n) return 0;
  return Number((used * 100n) / limit);
}

async function patientProfile(
  patientId: string,
  insurerId: string,
  referenceId: string,
) {
  const row = await one(
    pool,
    `SELECT p.id,p.display_name,p.birth_year,
            r.external_reference,r.policy_reference,r.status,r.effective_from,
            r.effective_to,r.source_updated_at,r.benefits,
            o.name insurer_name
       FROM patients p
       JOIN insurer_patient_references r
         ON r.patient_id=p.id AND r.insurer_id=$2
       JOIN organizations o ON o.id=r.insurer_id
      WHERE p.id=$1 AND r.id=$3`,
    [patientId, insurerId, referenceId],
  );
  if (!row) throw new DomainError("RECORD_NOT_FOUND", 404);
  return {
    id: row.id,
    displayName: row.display_name,
    birthYear: row.birth_year,
    memberReference: row.external_reference,
    policyReference: row.policy_reference,
    coverageStatus: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    sourceUpdatedAt: row.source_updated_at,
    benefits: row.benefits || {},
    insurerName: row.insurer_name,
  };
}

async function coverageSnapshot(
  patientId: string,
  insurerId: string,
  referenceId: string,
) {
  const [limits, usage] = await Promise.all([
    one(
      pool,
      `SELECT * FROM patient_coverage_limits
        WHERE reference_id=$1 AND current_date BETWEEN effective_from AND effective_to
        ORDER BY version DESC LIMIT 1`,
      [referenceId],
    ),
    one(
      pool,
      `SELECT
         to_char(date_trunc('month',current_date),'YYYY-MM-DD') month_start,
         to_char((date_trunc('month',current_date)+interval '1 month - 1 day')::date,'YYYY-MM-DD') month_end,
         to_char(date_trunc('year',current_date),'YYYY-MM-DD') year_start,
         to_char((date_trunc('year',current_date)+interval '1 year - 1 day')::date,'YYYY-MM-DD') year_end,
         COALESCE(sum(c.approved_minor) FILTER (
           WHERE c.state IN ('APPROVED','PARTIALLY_APPROVED')
             AND e.service_date >= date_trunc('month',current_date)::date
             AND e.service_date < (date_trunc('month',current_date)+interval '1 month')::date
         ),0)::text month_used,
         COALESCE(sum(c.submitted_minor) FILTER (
           WHERE c.state IN ('SUBMITTED','VALIDATING','AWAITING_REVIEW','NEEDS_INFORMATION')
             AND e.service_date >= date_trunc('month',current_date)::date
             AND e.service_date < (date_trunc('month',current_date)+interval '1 month')::date
         ),0)::text month_pending,
         COALESCE(sum(c.approved_minor) FILTER (
           WHERE c.state IN ('APPROVED','PARTIALLY_APPROVED')
             AND e.service_date >= date_trunc('year',current_date)::date
             AND e.service_date < (date_trunc('year',current_date)+interval '1 year')::date
         ),0)::text year_used,
         COALESCE(sum(c.submitted_minor) FILTER (
           WHERE c.state IN ('SUBMITTED','VALIDATING','AWAITING_REVIEW','NEEDS_INFORMATION')
             AND e.service_date >= date_trunc('year',current_date)::date
             AND e.service_date < (date_trunc('year',current_date)+interval '1 year')::date
         ),0)::text year_pending
       FROM claims c
       JOIN encounters e ON e.id=c.encounter_id
      WHERE c.patient_id=$1 AND c.insurer_id=$2
        AND c.state NOT IN ('DRAFT','WITHDRAWN')`,
      [patientId, insurerId],
    ),
  ]);
  const monthUsed = BigInt(usage?.month_used || 0);
  const yearUsed = BigInt(usage?.year_used || 0);
  const monthlyLimit = limits ? BigInt(limits.monthly_limit_minor) : null;
  const annualLimit = limits ? BigInt(limits.annual_limit_minor) : null;
  return {
    published: Boolean(limits),
    currency: limits?.currency || null,
    version: limits?.version || null,
    effectiveFrom: limits?.effective_from || null,
    effectiveTo: limits?.effective_to || null,
    monthly: {
      limitMinor: monthlyLimit === null ? null : String(monthlyLimit),
      usedMinor: String(monthUsed),
      pendingMinor: usage?.month_pending || "0",
      remainingMinor: remaining(monthlyLimit, monthUsed),
      utilization: utilization(monthUsed, monthlyLimit),
      periodStart: usage?.month_start || null,
      periodEnd: usage?.month_end || null,
    },
    annual: {
      limitMinor: annualLimit === null ? null : String(annualLimit),
      usedMinor: String(yearUsed),
      pendingMinor: usage?.year_pending || "0",
      remainingMinor: remaining(annualLimit, yearUsed),
      utilization: utilization(yearUsed, annualLimit),
      periodStart: usage?.year_start || null,
      periodEnd: usage?.year_end || null,
    },
    note: "Approved amounts are applied to cover. A pending claim is shown separately and does not reduce the balance until the insurer decides it.",
  };
}

async function claimRows(patientId: string, insurerId: string, limit = 100) {
  return (
    await pool.query(
      `SELECT c.id,c.reference,c.state,c.currency,c.submitted_minor,
              c.approved_minor,c.updated_at,
              e.service_date,e.diagnosis,
              f.name facility_name,
              d.reason decision_reason,d.created_at decided_at,
              (SELECT p.state FROM payments p
                WHERE p.claim_id=c.id ORDER BY p.created_at DESC LIMIT 1) payment_state,
              (SELECT COALESCE(sum(a.amount_minor),0)::text
                 FROM claim_payment_allocations a
                 JOIN payments p ON p.id=a.payment_id
                WHERE a.claim_id=c.id AND a.status='CONFIRMED'
                  AND p.state='SETTLED') settled_minor
         FROM claims c
         JOIN encounters e ON e.id=c.encounter_id
         JOIN organizations f ON f.id=c.facility_id
         LEFT JOIN LATERAL (
           SELECT reason,created_at FROM decisions
            WHERE claim_id=c.id ORDER BY created_at DESC LIMIT 1
         ) d ON true
        WHERE c.patient_id=$1 AND c.insurer_id=$2
          AND c.state NOT IN ('DRAFT','WITHDRAWN')
        ORDER BY e.service_date DESC,c.updated_at DESC
        LIMIT $3`,
      [patientId, insurerId, limit],
    )
  ).rows;
}

async function totals(patientId: string, insurerId: string) {
  const [row, settled] = await Promise.all([
    one(
      pool,
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE state = ANY($3::text[]))::int open,
              count(*) FILTER (WHERE state = ANY($4::text[]))::int approved,
              count(*) FILTER (WHERE state='REJECTED')::int rejected,
              COALESCE(sum(submitted_minor),0)::text submitted_minor,
              COALESCE(sum(approved_minor),0)::text approved_minor
         FROM claims
        WHERE patient_id=$1 AND insurer_id=$2
          AND state NOT IN ('DRAFT','WITHDRAWN')`,
      [patientId, insurerId, OPEN_CLAIM_STATES, DECIDED_CLAIM_STATES],
    ),
    one(
      pool,
      `SELECT COALESCE(sum(a.amount_minor),0)::text settled_minor
         FROM claim_payment_allocations a
         JOIN payments p ON p.id=a.payment_id
         JOIN claims c ON c.id=a.claim_id
        WHERE c.patient_id=$1 AND c.insurer_id=$2
          AND a.status='CONFIRMED' AND p.state='SETTLED'`,
      [patientId, insurerId],
    ),
  ]);
  return { ...row, settled_minor: settled?.settled_minor || "0" };
}

export class PatientsService {
  async overview(ctx: Context) {
    const { patientId, insurerId, referenceId } = patientScope(ctx);
    const [patient, summary, coverage, recentClaims] = await Promise.all([
      patientProfile(patientId, insurerId, referenceId),
      totals(patientId, insurerId),
      coverageSnapshot(patientId, insurerId, referenceId),
      claimRows(patientId, insurerId, 8),
    ]);
    return {
      patient,
      totals: summary,
      coverage,
      recentClaims,
      refreshedAt: new Date().toISOString(),
      mode,
    };
  }

  async coverage(ctx: Context) {
    const { patientId, insurerId, referenceId } = patientScope(ctx);
    const [patient, coverage, summary, claims] = await Promise.all([
      patientProfile(patientId, insurerId, referenceId),
      coverageSnapshot(patientId, insurerId, referenceId),
      totals(patientId, insurerId),
      claimRows(patientId, insurerId, 100),
    ]);
    const history = (
      await pool.query(
        `SELECT currency,monthly_limit_minor,annual_limit_minor,effective_from,
                effective_to,version,created_at
           FROM patient_coverage_limits
          WHERE reference_id=$1 ORDER BY version DESC LIMIT 12`,
        [referenceId],
      )
    ).rows;
    const facilities = [
      ...new Map(
        claims.map((row: any) => [row.facility_name, row.facility_name]),
      ).values(),
    ];
    return {
      patient,
      coverage,
      totals: summary,
      facilities,
      history,
      refreshedAt: new Date().toISOString(),
    };
  }

  async claims(ctx: Context) {
    const { patientId, insurerId, referenceId } = patientScope(ctx);
    const [patient, summary, coverage, rows] = await Promise.all([
      patientProfile(patientId, insurerId, referenceId),
      totals(patientId, insurerId),
      coverageSnapshot(patientId, insurerId, referenceId),
      claimRows(patientId, insurerId, 200),
    ]);
    return {
      patient,
      totals: summary,
      coverage,
      claims: rows,
      refreshedAt: new Date().toISOString(),
    };
  }

  async claim(ctx: Context, id: string) {
    const { patientId, insurerId } = patientScope(ctx);
    const claim = await one(
      pool,
      `SELECT c.id,c.reference,c.state,c.currency,c.submitted_minor,
              c.approved_minor,c.created_at,c.updated_at,
              e.service_date,e.diagnosis,e.notes,
              f.name facility_name,
              (SELECT COALESCE(sum(a.amount_minor),0)::text
                 FROM claim_payment_allocations a
                 JOIN payments p ON p.id=a.payment_id
                WHERE a.claim_id=c.id AND a.status='CONFIRMED'
                  AND p.state='SETTLED') settled_minor
         FROM claims c
         JOIN encounters e ON e.id=c.encounter_id
         JOIN organizations f ON f.id=c.facility_id
        WHERE c.id=$1 AND c.patient_id=$2 AND c.insurer_id=$3
          AND c.state NOT IN ('DRAFT','WITHDRAWN')`,
      [id, patientId, insurerId],
    );
    if (!claim) throw new DomainError("RECORD_NOT_FOUND", 404);
    const [items, decisions, payments] = await Promise.all([
      pool.query(
        "SELECT code,description,quantity,unit_minor FROM claim_items WHERE claim_id=$1 ORDER BY id",
        [id],
      ),
      pool.query(
        "SELECT outcome,reason,approved_minor,created_at FROM decisions WHERE claim_id=$1 ORDER BY created_at",
        [id],
      ),
      pool.query(
        `SELECT p.state,p.currency,p.base_minor,p.created_at,p.settled_at
           FROM payments p WHERE p.claim_id=$1 ORDER BY p.created_at DESC`,
        [id],
      ),
    ]);
    return {
      claim,
      items: items.rows,
      decisions: decisions.rows,
      payments: payments.rows,
      notice:
        "This is your own claim record. It does not expose another patient, facility or insurer workspace.",
    };
  }

  // Insurer-side provisioning from an existing insured-patient record.
  async accessList(ctx: Context) {
    requireInsurerCoverage(ctx);
    return (
      await pool.query(
        `SELECT r.id reference_id,r.patient_id,p.display_name,p.birth_year,
                r.external_reference,r.policy_reference,r.status,
                r.effective_from,r.effective_to,r.source_updated_at,
                r.contact_email,
                pa.id account_id,pa.status account_status,
                u.email account_email,u.suspended,
                lim.currency,lim.monthly_limit_minor,lim.annual_limit_minor,
                lim.effective_from limit_from,lim.effective_to limit_to,
                lim.version limit_version,
                inv.expires_at invitation_expires_at,
                inv.accepted_at invitation_accepted_at
           FROM insurer_patient_references r
           JOIN patients p ON p.id=r.patient_id
           LEFT JOIN patient_accounts pa ON pa.reference_id=r.id
           LEFT JOIN "user" u ON u.id=pa.user_id
           LEFT JOIN LATERAL (
             SELECT * FROM patient_coverage_limits l
              WHERE l.reference_id=r.id
                AND current_date BETWEEN l.effective_from AND l.effective_to
              ORDER BY l.version DESC LIMIT 1
           ) lim ON true
           LEFT JOIN LATERAL (
             SELECT * FROM invitations i
              WHERE i.patient_id=r.patient_id
                AND i.patient_insurer_reference_id=r.id
              ORDER BY i.created_at DESC LIMIT 1
           ) inv ON true
          WHERE r.insurer_id=$1
          ORDER BY p.display_name,p.id`,
        [ctx.orgId],
      )
    ).rows;
  }

  async invite(ctx: Context, input: unknown) {
    requireInsurerCoverage(ctx);
    const d = z
      .object({
        referenceId: z.uuid(),
        email: z.email().optional(),
      })
      .parse(input);
    const reference = await one(
      pool,
      `SELECT r.*,p.display_name
         FROM insurer_patient_references r
         JOIN patients p ON p.id=r.patient_id
        WHERE r.id=$1 AND r.insurer_id=$2`,
      [d.referenceId, ctx.orgId],
    );
    if (!reference) throw new DomainError("RECORD_NOT_FOUND", 404);
    const active = await one(
      pool,
      "SELECT current_date BETWEEN $1::date AND $2::date AS ok",
      [reference.effective_from, reference.effective_to],
    );
    if (reference.status !== "ACTIVE" || !active?.ok)
      throw new DomainError("COVERAGE_NOT_ACTIVE", 409);
    const existing = await one(
      pool,
      "SELECT id FROM patient_accounts WHERE reference_id=$1",
      [reference.id],
    );
    if (existing) throw new DomainError("PATIENT_ACCOUNT_EXISTS", 409);
    const email = String(d.email || reference.contact_email || "")
      .trim()
      .toLowerCase();
    if (!email)
      throw new DomainError(
        "PATIENT_EMAIL_REQUIRED",
        422,
        "Add the insured patient's email address before inviting them.",
      );
    const token = randomBytes(32).toString("hex");
    const invitation = await transaction(async (db) => {
      const i = await one(
        db,
        `INSERT INTO invitations(organization_id,email,roles,token_hash,expires_at,created_by,patient_id,patient_insurer_reference_id)
         VALUES($1,$2,'{}',$3,now()+interval '72 hours',$4,$5,$6)
         ON CONFLICT (patient_id,patient_insurer_reference_id)
           WHERE patient_id IS NOT NULL AND accepted_at IS NULL
         DO UPDATE SET email=EXCLUDED.email,
                       token_hash=EXCLUDED.token_hash,
                       expires_at=EXCLUDED.expires_at,
                       created_by=EXCLUDED.created_by,
                       created_at=now()
         RETURNING id,expires_at`,
        [
          ctx.orgId,
          email,
          createHash("sha256").update(token).digest("hex"),
          ctx.userId,
          reference.patient_id,
          reference.id,
        ],
      );
      await audit(db, ctx, "PatientPortalInvited", reference.patient_id, {
        referenceId: reference.id,
      });
      return i;
    });
    const link =
      (process.env.WEB_ORIGIN || "http://localhost:3000") +
      "/accept-invitation?token=" +
      token;
    const result = {
      ...invitation,
      email,
      patientName: reference.display_name,
      message:
        "Patient portal invitation recorded. It grants access to this patient's own records only.",
    };
    if (mode === "demo")
      return { ...result, delivery: "LOCAL_DEMO_ONLY", link };
    try {
      await sendMail(
        email,
        "Your LUX HealthPay patient portal access",
        `Set your password and view your own cover and claims: ${link}`,
      );
      return { ...result, delivery: "SENT" };
    } catch {
      return { ...result, delivery: "FAILED_OR_UNCONFIGURED" };
    }
  }

  async saveCoverageLimits(ctx: Context, input: unknown) {
    requireInsurerCoverage(ctx);
    const d = z
      .object({
        referenceId: z.uuid(),
        currency: z.enum(["USD", "LRD"]),
        monthlyLimitMinor: minor,
        annualLimitMinor: minor,
        effectiveFrom: z.iso.date(),
        effectiveTo: z.iso.date(),
      })
      .parse(input);
    if (d.effectiveTo < d.effectiveFrom)
      throw new DomainError("INVALID_EFFECTIVE_DATES", 422);
    if (BigInt(d.annualLimitMinor) < BigInt(d.monthlyLimitMinor))
      throw new DomainError(
        "ANNUAL_LIMIT_BELOW_MONTHLY_LIMIT",
        422,
        "The annual limit must be at least the monthly limit.",
      );
    const reference = await one(
      pool,
      "SELECT * FROM insurer_patient_references WHERE id=$1 AND insurer_id=$2",
      [d.referenceId, ctx.orgId],
    );
    if (!reference) throw new DomainError("RECORD_NOT_FOUND", 404);
    return transaction(async (db) => {
      const next = await one(
        db,
        "SELECT COALESCE(max(version),0)+1 version FROM patient_coverage_limits WHERE reference_id=$1",
        [reference.id],
      );
      const row = await one(
        db,
        `INSERT INTO patient_coverage_limits(reference_id,patient_id,insurer_id,currency,monthly_limit_minor,annual_limit_minor,effective_from,effective_to,version,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          reference.id,
          reference.patient_id,
          ctx.orgId,
          d.currency,
          d.monthlyLimitMinor,
          d.annualLimitMinor,
          d.effectiveFrom,
          d.effectiveTo,
          next.version,
          ctx.userId,
        ],
      );
      await audit(
        db,
        ctx,
        "PatientCoverageLimitsPublished",
        reference.patient_id,
        {
          referenceId: reference.id,
          version: next.version,
          currency: d.currency,
        },
      );
      return {
        ...row,
        message: `Coverage limits published as version ${next.version}.`,
      };
    });
  }
}

import { z } from "zod";
import { pool, transaction, one, type DB } from "../../../packages/db/index.ts";
import {
  DomainError,
  minor,
} from "../../../packages/domain/index.ts";
import {
  requirePermission,
  audit,
  type Context,
} from "./access.ts";
import { mode } from "./auth.ts";

const subscriptionInput = z.object({
  patientId: z.uuid(),
  level: z.string().trim().min(1).max(60),
  employerName: z.string().trim().min(2).max(120),
  grossSalaryMinor: minor,
});

type Scope =
  | { kind: "INSURER"; id: string }
  | { kind: "FACILITY"; id: string }
  | { kind: "PLATFORM"; id: null };

function scopeFor(ctx: Context): Scope {
  requirePermission(ctx, "payroll");
  if (ctx.orgType === "INSURER") return { kind: "INSURER", id: ctx.orgId };
  if (ctx.orgType === "FACILITY") return { kind: "FACILITY", id: ctx.orgId };
  return { kind: "PLATFORM", id: null };
}

/**
 * SQL predicate and parameters for records visible to the caller. A facility
 * only sees payroll cover for patients registered at that facility; an insurer
 * only sees its own members; platform finance sees the aggregate.
 */
function subscriptionFilter(scope: Scope, alias = "s") {
  if (scope.kind === "INSURER")
    return { sql: `${alias}.insurer_id=$1`, params: [scope.id] };
  if (scope.kind === "FACILITY")
    return {
      sql: `EXISTS (SELECT 1 FROM patients scoped_patient WHERE scoped_patient.id=${alias}.patient_id AND scoped_patient.facility_id=$1)`,
      params: [scope.id],
    };
  return { sql: "true", params: [] as string[] };
}

function packageFilter(scope: Scope) {
  if (scope.kind === "INSURER")
    return { sql: "p.insurer_id=$1", params: [scope.id] };
  if (scope.kind === "FACILITY")
    return {
      sql: `p.insurer_id IN (SELECT insurer_id FROM facility_insurer_contracts WHERE facility_id=$1 AND status='ACTIVE' AND current_date BETWEEN starts_on AND ends_on)`,
      params: [scope.id],
    };
  return { sql: "true", params: [] as string[] };
}

function monthStart() {
  return new Date().toISOString().slice(0, 7) + "-01";
}

function monthLabel(period: string) {
  return new Intl.DateTimeFormat("en-LR", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Monrovia",
  }).format(new Date(period + "T00:00:00Z"));
}

/**
 * Creates the current month's simulated salary deduction for every active
 * subscription in scope. Idempotent by (subscription_id, period_start) and safe
 * to call on every dashboard read. No real payroll system is contacted and no
 * real salary is touched.
 */
async function ensureCurrentDeductions(
  db: DB,
  ctx: Context,
  scope: Scope,
  period = monthStart(),
) {
  const filter = subscriptionFilter(scope);
  const subscriptions = (
    await db.query(
      `SELECT s.id,s.gross_salary_minor,s.currency,b.deduction_minor
         FROM payroll_subscriptions s
         JOIN payroll_bands b ON b.id=s.band_id
        WHERE s.status='ACTIVE' AND ${filter.sql}
        FOR UPDATE OF s`,
      filter.params,
    )
  ).rows;
  let created = 0;
  for (const s of subscriptions) {
    const gross = BigInt(s.gross_salary_minor);
    const deduction = BigInt(s.deduction_minor);
    if (deduction > gross) continue;
    const inserted = await one(
      db,
      `INSERT INTO payroll_deductions(subscription_id,period_start,gross_salary_minor,deduction_minor,net_salary_minor,currency,status,simulated)
       VALUES($1,$2,$3,$4,$5,$6,'DEDUCTED',true)
       ON CONFLICT (subscription_id,period_start) DO NOTHING
       RETURNING id`,
      [
        s.id,
        period,
        String(gross),
        String(deduction),
        String(gross - deduction),
        s.currency,
      ],
    );
    if (inserted) created++;
  }
  if (created)
    await audit(db, ctx, "PayrollDeductionsRecorded", period, {
      created,
      period,
      simulated: true,
      note: "Simulated payroll deduction; no real salary was processed.",
    });
  return { created, period };
}

export class PayrollService {
  async dashboard(ctx: Context) {
    const scope = scopeFor(ctx);
    const period = monthStart();
    const automatic = await transaction((db) =>
      ensureCurrentDeductions(db, ctx, scope, period),
    );

    const subFilter = subscriptionFilter(scope);
    const pkgFilter = packageFilter(scope);
    const [packages, bands, subscriptions, deductions, contracts, eligible] =
      await Promise.all([
        pool.query(
          `SELECT p.*,
                  (SELECT count(*)::int FROM payroll_subscriptions s WHERE s.package_id=p.id AND s.status='ACTIVE' AND ${subscriptionFilter(scope, "s").sql}) members
             FROM insurance_packages p
            WHERE p.status='ACTIVE' AND ${pkgFilter.sql}
            ORDER BY p.monthly_premium_minor,p.name`,
          pkgFilter.params,
        ),
        pool.query(
          `SELECT b.*,p.name package_name,p.code package_code,p.monthly_premium_minor,
                  (SELECT count(*)::int FROM payroll_subscriptions s WHERE s.band_id=b.id AND s.status='ACTIVE' AND ${subscriptionFilter(scope, "s").sql}) members
             FROM payroll_bands b
             JOIN insurance_packages p ON p.id=b.package_id
            WHERE p.status='ACTIVE' AND ${pkgFilter.sql}
            ORDER BY b.deduction_minor,b.level`,
          pkgFilter.params,
        ),
        pool.query(
          `SELECT s.*,pt.display_name patient_name,f.name facility_name,
                  pkg.name package_name,pkg.code package_code,b.label band_label,
                  d.period_start latest_period,d.deduction_minor latest_deduction_minor,
                  d.net_salary_minor latest_net_minor,d.status latest_status
             FROM payroll_subscriptions s
             JOIN patients pt ON pt.id=s.patient_id
             JOIN organizations f ON f.id=pt.facility_id
             JOIN insurance_packages pkg ON pkg.id=s.package_id
             JOIN payroll_bands b ON b.id=s.band_id
             LEFT JOIN LATERAL (
               SELECT period_start,deduction_minor,net_salary_minor,status
                 FROM payroll_deductions
                WHERE subscription_id=s.id
                ORDER BY period_start DESC LIMIT 1
             ) d ON true
            WHERE ${subFilter.sql}
            ORDER BY s.created_at DESC LIMIT 200`,
          subFilter.params,
        ),
        pool.query(
          `SELECT d.*,pt.display_name patient_name,s.employer_name,s.employment_level,
                  pkg.name package_name
             FROM payroll_deductions d
             JOIN payroll_subscriptions s ON s.id=d.subscription_id
             JOIN patients pt ON pt.id=s.patient_id
             JOIN insurance_packages pkg ON pkg.id=s.package_id
            WHERE ${subFilter.sql}
            ORDER BY d.period_start DESC,d.created_at DESC LIMIT 100`,
          subFilter.params,
        ),
        pool.query(
          `SELECT c.insurer_id,o.name insurer_name,c.facility_id,f.name facility_name,
                  c.starts_on,c.ends_on,c.status
             FROM facility_insurer_contracts c
             JOIN organizations o ON o.id=c.insurer_id
             JOIN organizations f ON f.id=c.facility_id
            WHERE $1::text IS NULL OR c.insurer_id=$2::uuid OR c.facility_id=$2::uuid
            ORDER BY o.name,f.name`,
          [scope.kind === "PLATFORM" ? null : scope.id, scope.id],
        ),
        scope.kind === "INSURER"
          ? pool.query(
              `SELECT p.id,p.display_name,f.name facility_name,r.policy_reference,
                      r.benefits
                 FROM patients p
                 JOIN insurer_patient_references r ON r.patient_id=p.id
                 JOIN facility_insurer_contracts c ON c.facility_id=p.facility_id AND c.insurer_id=r.insurer_id
                  AND c.status='ACTIVE' AND current_date BETWEEN c.starts_on AND c.ends_on
                 JOIN organizations f ON f.id=p.facility_id
                WHERE r.insurer_id=$1 AND r.status='ACTIVE'
                  AND NOT EXISTS (
                    SELECT 1 FROM payroll_subscriptions s
                     WHERE s.patient_id=p.id AND s.insurer_id=$1 AND s.status='ACTIVE'
                  )
                ORDER BY p.display_name LIMIT 100`,
              [scope.id],
            )
          : Promise.resolve({ rows: [] as any[] }),
      ]);

    const totals = new Map<
      string,
      { currency: string; members: number; monthly: bigint; deducted: bigint; net: bigint }
    >();
    const bucket = (currency: string) => {
      if (!totals.has(currency))
        totals.set(currency, {
          currency,
          members: 0,
          monthly: 0n,
          deducted: 0n,
          net: 0n,
        });
      return totals.get(currency)!;
    };
    for (const s of subscriptions.rows) {
      if (s.status !== "ACTIVE") continue;
      const b = bucket(s.currency);
      b.members++;
      if (s.latest_period === period && s.latest_deduction_minor) {
        b.deducted += BigInt(s.latest_deduction_minor);
        b.net += BigInt(s.latest_net_minor || 0);
      }
    }
    for (const s of subscriptions.rows) {
      if (s.status !== "ACTIVE") continue;
      const band = bands.rows.find((b: any) => b.id === s.band_id);
      if (band) bucket(s.currency).monthly += BigInt(band.deduction_minor);
    }

    return {
      mode,
      simulated: true,
      simulationNotice:
        "Salary deductions shown here are simulated demo records. No employer payroll system is connected and no real salary is deducted.",
      period: { start: period, label: monthLabel(period) },
      automatic,
      scope: scope.kind,
      packages: packages.rows,
      bands: bands.rows,
      subscriptions: subscriptions.rows,
      deductions: deductions.rows,
      contracts: contracts.rows,
      eligiblePatients: eligible.rows,
      totals: [...totals.values()].map((t) => ({
        currency: t.currency,
        members: t.members,
        monthlyDeductionMinor: String(t.monthly),
        deductedThisPeriodMinor: String(t.deducted),
        netThisPeriodMinor: String(t.net),
      })),
      canManage: ctx.orgType === "INSURER" && !!scope.id,
    };
  }

  async run(ctx: Context, input: unknown) {
    const scope = scopeFor(ctx);
    if (ctx.orgType !== "INSURER" && ctx.orgType !== "LUX")
      throw new DomainError("PAYROLL_RUN_INSURER_ONLY", 403);
    const data = z
      .object({ period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .parse(input || {});
    return transaction(async (db) => {
      const result = await ensureCurrentDeductions(
        db,
        ctx,
        scope,
        data.period || monthStart(),
      );
      await audit(db, ctx, "PayrollRunExecuted", result.period, {
        ...result,
        simulated: true,
      });
      return { ...result, simulated: true };
    });
  }

  async subscribe(ctx: Context, input: unknown) {
    scopeFor(ctx);
    if (ctx.orgType !== "INSURER")
      throw new DomainError("PAYROLL_SUBSCRIPTION_INSURER_ONLY", 403);
    const data = subscriptionInput.parse(input);
    const gross = BigInt(data.grossSalaryMinor);
    if (gross <= 0n) throw new DomainError("INVALID_AMOUNT", 422);
    return transaction(async (db) => {
      const band = await one(
        db,
        "SELECT * FROM payroll_bands WHERE insurer_id=$1 AND level=$2",
        [ctx.orgId, data.level],
      );
      if (!band) throw new DomainError("PAYROLL_BAND_NOT_FOUND", 422);
      if (
        gross < BigInt(band.min_salary_minor) ||
        (band.max_salary_minor !== null &&
          gross > BigInt(band.max_salary_minor))
      )
        throw new DomainError("PAYROLL_SALARY_OUTSIDE_BAND", 422);
      if (BigInt(band.deduction_minor) > gross)
        throw new DomainError("PAYROLL_DEDUCTION_EXCEEDS_SALARY", 422);
      const pkg = await one(
        db,
        "SELECT * FROM insurance_packages WHERE id=$1 AND insurer_id=$2 AND status='ACTIVE'",
        [band.package_id, ctx.orgId],
      );
      if (!pkg) throw new DomainError("PAYROLL_PACKAGE_NOT_FOUND", 404);
      const patient = await one(
        db,
        `SELECT p.id,p.facility_id
           FROM patients p
           JOIN insurer_patient_references r ON r.patient_id=p.id AND r.insurer_id=$2
           JOIN facility_insurer_contracts c ON c.facility_id=p.facility_id AND c.insurer_id=$2
            AND c.status='ACTIVE' AND current_date BETWEEN c.starts_on AND c.ends_on
          WHERE p.id=$1
          LIMIT 1`,
        [data.patientId, ctx.orgId],
      );
      if (!patient)
        throw new DomainError("PAYROLL_PATIENT_NOT_ELIGIBLE_FOR_INSURER", 422);
      const existing = await one(
        db,
        "SELECT * FROM payroll_subscriptions WHERE patient_id=$1 AND insurer_id=$2 FOR UPDATE",
        [data.patientId, ctx.orgId],
      );
      if (existing?.status === "ACTIVE")
        throw new DomainError("PAYROLL_SUBSCRIPTION_EXISTS");
      const subscription = existing
        ? await one(
            db,
            `UPDATE payroll_subscriptions
                SET package_id=$2,band_id=$3,employment_level=$4,employer_name=$5,
                    gross_salary_minor=$6,currency=$7,status='ACTIVE',
                    simulated=true,effective_from=current_date
              WHERE id=$1 RETURNING *`,
            [
              existing.id,
              band.package_id,
              band.id,
              band.level,
              data.employerName,
              String(gross),
              band.currency,
            ],
          )
        : await one(
            db,
            `INSERT INTO payroll_subscriptions(patient_id,insurer_id,package_id,band_id,employment_level,employer_name,gross_salary_minor,currency,status,simulated)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',true) RETURNING *`,
            [
              data.patientId,
              ctx.orgId,
              band.package_id,
              band.id,
              band.level,
              data.employerName,
              String(gross),
              band.currency,
            ],
          );
      const deduction = existing
        ? null
        : await one(
            db,
            `INSERT INTO payroll_deductions(subscription_id,period_start,gross_salary_minor,deduction_minor,net_salary_minor,currency,status,simulated)
             VALUES($1,date_trunc('month',current_date)::date,$2,$3,$4,$5,'DEDUCTED',true)
             ON CONFLICT (subscription_id,period_start) DO NOTHING
             RETURNING *`,
            [
              subscription!.id,
              String(gross),
              band.deduction_minor,
              String(gross - BigInt(band.deduction_minor)),
              band.currency,
            ],
          );
      await audit(db, ctx, "PayrollSubscriptionCreated", subscription!.id, {
        packageId: band.package_id,
        bandId: band.id,
        simulated: true,
      });
      return {
        subscription,
        package: pkg,
        band,
        deduction,
        simulated: true,
        notice:
          "Simulated payroll subscription. The member record is demo data; no real salary deduction was made.",
      };
    });
  }
}

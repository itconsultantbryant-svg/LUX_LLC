import { z } from "zod";
import { pool } from "../../../packages/db/index.ts";
import { csvCell, DomainError } from "../../../packages/domain/index.ts";
import { requirePermission, audit, type Context } from "./access.ts";
export const reportTypes = z.enum([
  "claims",
  "fees",
  "aging",
  "review-turnaround",
  "payment-latency",
  "submission-quality",
  "exceptions",
  "statement",
]);
export async function report(
  ctx: Context,
  type: string,
  exportCsv = false,
  filters: unknown = {},
) {
  reportTypes.parse(type);
  if (type === "fees") requirePermission(ctx, "fees");
  else requirePermission(ctx, "reports");
  const f = z
    .object({
      currency: z.enum(["USD", "LRD"]).optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    })
    .parse(filters);
  if (f.from && f.to && f.from > f.to)
    throw new DomainError("INVALID_DATE_RANGE", 422);
  const values = [ctx.orgId, f.currency || null, f.from || null, f.to || null];
  const scope = `(c.facility_id=$1 OR c.insurer_id=$1) AND ($2::text IS NULL OR c.currency=$2) AND ($3::date IS NULL OR c.created_at >= $3::date) AND ($4::date IS NULL OR c.created_at < $4::date+interval '1 day')`;
  const paymentScope = `(p.facility_id=$1 OR p.insurer_id=$1) AND ($2::text IS NULL OR p.currency=$2) AND ($3::date IS NULL OR a.authorized_at >= $3::date) AND ($4::date IS NULL OR a.authorized_at < $4::date+interval '1 day')`;
  let sql = "",
    basis = "";
  if (type === "claims") {
    sql = `SELECT c.currency,c.state,count(*)::int count,sum(c.submitted_minor)::text submitted,sum(c.approved_minor)::text approved FROM claims c WHERE ${scope} GROUP BY c.currency,c.state ORDER BY c.currency,c.state`;
    basis =
      "Claim-created-date cohort; current state. All amounts are integer minor units.";
  }
  if (type === "aging") {
    sql = `SELECT c.currency,c.state,count(*)::int count,round(avg(extract(epoch FROM(now()-c.updated_at))/86400)::numeric,2)::text average_days_since_update,round(max(extract(epoch FROM(now()-c.created_at))/86400)::numeric,2)::text oldest_days_since_creation FROM claims c WHERE ${scope} GROUP BY c.currency,c.state`;
    basis =
      "Claim-created-date cohort; elapsed age from creation and latest workflow update to report time.";
  }
  if (type === "review-turnaround") {
    sql = `SELECT c.currency,d.outcome,count(*)::int decisions,round(avg(extract(epoch FROM(d.created_at-v.created_at))/3600)::numeric,2)::text average_review_hours FROM decisions d JOIN claims c ON c.id=d.claim_id JOIN claim_versions v ON v.claim_id=c.id AND v.version=d.submission_version WHERE ${scope} GROUP BY c.currency,d.outcome`;
    basis =
      "Claim-created-date cohort. Review time is submitted-version timestamp to human decision timestamp; not payment settlement time.";
  }
  if (type === "payment-latency") {
    sql = `SELECT p.currency,p.state,count(*)::int count,round(avg(extract(epoch FROM(p.settled_at-a.authorized_at))/3600) FILTER(WHERE p.state='SETTLED')::numeric,2)::text average_confirmed_settlement_hours FROM payments p JOIN payment_authorizations a ON a.payment_id=p.id WHERE ${paymentScope} GROUP BY p.currency,p.state`;
    basis =
      "Authorization-date cohort. Latency is insurer authorization to verified settlement confirmation; excludes insurer claim review.";
  }
  if (type === "submission-quality") {
    sql = `SELECT c.currency,c.state,count(*)::int claims,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM validation_runs v JOIN findings f ON f.validation_run_id=v.id WHERE v.claim_id=c.id))::int claims_with_findings,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM validation_runs v WHERE v.claim_id=c.id AND v.status='PROCESSING_ERROR'))::int processing_errors FROM claims c WHERE ${scope} GROUP BY c.currency,c.state`;
    basis =
      "Claim-created-date cohort. Findings and processing errors are separate; neither is a fraud verdict.";
  }
  if (type === "exceptions") {
    sql = `SELECT COALESCE(p.currency,'UNSPECIFIED') currency,r.category,r.status,count(*)::int count,round(max(extract(epoch FROM(now()-r.created_at))/86400)::numeric,2)::text oldest_days FROM reconciliation_items r LEFT JOIN payments p ON p.id=r.payment_id WHERE r.organization_id=$1 AND ($2::text IS NULL OR p.currency=$2) AND ($3::date IS NULL OR r.created_at >=$3::date) AND ($4::date IS NULL OR r.created_at<$4::date+interval '1 day') GROUP BY p.currency,r.category,r.status`;
    basis =
      "Exception-created-date cohort; age to report time. Unspecified-currency records are not combined with currency totals.";
  }
  if (type === "statement") {
    sql = `SELECT c.currency,sum(c.approved_minor)::text approved,sum(COALESCE(a.confirmed,0))::text settled_base,sum(COALESCE(a.reserved,0))::text reserved_not_paid,sum(c.approved_minor-COALESCE(a.confirmed,0))::text outstanding,sum(COALESCE(a.reversed,0))::text reversed_base FROM claims c LEFT JOIN LATERAL (SELECT sum(amount_minor) FILTER(WHERE status='CONFIRMED') confirmed,sum(amount_minor) FILTER(WHERE status='RESERVED') reserved,sum(amount_minor) FILTER(WHERE status='REVERSED') reversed FROM claim_payment_allocations WHERE claim_id=c.id) a ON true WHERE ${scope} GROUP BY c.currency`;
    basis =
      "Claim-created-date cohort. Base principal, not provider cash allocation: approved minus confirmed base is outstanding; reservations are not paid.";
  }
  if (type === "fees") {
    sql = `SELECT l.currency,sum(l.amount_minor) FILTER(WHERE l.category IN ('LUX_EARNED','LUX_EARNED_REVERSAL'))::text lux_earned,sum(l.amount_minor) FILTER(WHERE l.category IN ('ORANGE_ACCRUED','ORANGE_ACCRUED_REVERSAL'))::text orange_accrued FROM ledger_entries l JOIN payments p ON p.id=l.payment_id JOIN organizations o ON o.id=$1 WHERE (o.type='LUX' OR p.insurer_id=o.id) AND ($2::text IS NULL OR l.currency=$2) AND ($3::date IS NULL OR l.created_at>=$3::date) AND ($4::date IS NULL OR l.created_at<$4::date+interval '1 day') GROUP BY l.currency`;
    basis =
      "Verified ledger-posting-date cohort; compensating reversals included. Earned/accrued fees are not confirmed cash distribution.";
  }
  const rows = (await pool.query(sql, values)).rows;
  await audit(
    pool,
    ctx,
    exportCsv ? "ReportExported" : "ReportViewed",
    undefined,
    { type, ...f },
  );
  if (exportCsv) {
    const keys = Object.keys(rows[0] || { currency: "", state: "", count: "" });
    return [
      keys.map(csvCell).join(","),
      ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(",")),
    ].join("\r\n");
  }
  return {
    basis:
      basis + " UTC storage; display Africa/Monrovia. No currency conversion.",
    filters: f,
    rows,
  };
}

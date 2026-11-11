import { z } from "zod";
import { pool, transaction, one } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
import { requirePermission, audit, type Context } from "./access.ts";
export async function scopedRecords(ctx: Context, section: string) {
  if (section === "encounters") {
    requirePermission(ctx, "clinical");
    return (
      await pool.query(
        "SELECT e.id,e.patient_id,p.display_name,e.service_date,e.diagnosis,e.version FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE e.facility_id=$1 ORDER BY e.created_at DESC",
        [ctx.orgId],
      )
    ).rows;
  }
  if (section === "coverage") {
    requirePermission(ctx, "coverage");
    return {
      tariffs: (
        await pool.query(
          "SELECT ts.version,ts.label,ts.effective_from,ts.effective_to,ti.code,ti.description,ti.currency,ti.max_unit_minor FROM tariff_sets ts JOIN tariff_items ti ON ti.tariff_set_id=ts.id WHERE ts.insurer_id=$1 ORDER BY ts.version DESC,ti.code",
          [ctx.orgId],
        )
      ).rows,
      rulesets: (
        await pool.query(
          "SELECT version,rules,effective_from FROM coverage_rulesets WHERE insurer_id=$1 ORDER BY version DESC",
          [ctx.orgId],
        )
      ).rows,
    };
  }
  if (section === "decisions") {
    requirePermission(ctx, "review");
    return {
      decisions: (
        await pool.query(
          "SELECT d.*,c.reference FROM decisions d JOIN claims c ON c.id=d.claim_id WHERE c.insurer_id=$1 ORDER BY d.created_at DESC",
          [ctx.orgId],
        )
      ).rows,
      appeals: (
        await pool.query(
          "SELECT a.*,c.reference FROM appeals a JOIN claims c ON c.id=a.claim_id WHERE c.insurer_id=$1 ORDER BY a.created_at DESC",
          [ctx.orgId],
        )
      ).rows,
    };
  }
  if (section === "flagged") {
    requirePermission(ctx, "review");
    return (
      await pool.query(
        "SELECT c.id,c.reference,c.state,f.field,f.category,f.reason,f.evidence FROM claims c JOIN validation_runs v ON v.claim_id=c.id JOIN findings f ON f.validation_run_id=v.id WHERE c.insurer_id=$1 AND f.resolution IS NULL ORDER BY c.updated_at DESC",
        [ctx.orgId],
      )
    ).rows;
  }
  if (section === "destination-changes") {
    requirePermission(ctx, "destination");
    return (
      await pool.query(
        "SELECT * FROM destination_changes WHERE organization_id=$1 ORDER BY created_at DESC",
        [ctx.orgId],
      )
    ).rows;
  }
  throw new DomainError("ROUTE_NOT_FOUND", 404);
}
export async function saveTariff(ctx: Context, input: unknown) {
  requirePermission(ctx, "coverage");
  const d = z
    .object({
      label: z.string().min(5).max(160),
      effectiveFrom: z.iso.date(),
      effectiveTo: z.iso.date(),
      items: z
        .array(
          z.object({
            code: z.string().regex(/^PILOT-[A-Z0-9-]+$/),
            description: z.string().min(3).max(240),
            currency: z.enum(["USD", "LRD"]),
            maxUnitMinor: z.string().regex(/^\d{1,12}$/),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  if (d.effectiveTo < d.effectiveFrom)
    throw new DomainError("INVALID_EFFECTIVE_DATES", 422);
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      ctx.orgId,
    ]);
    const next = await one(
      db,
      "SELECT COALESCE(max(version),0)+1 n FROM tariff_sets WHERE insurer_id=$1",
      [ctx.orgId],
    );
    const t = await one(
      db,
      "INSERT INTO tariff_sets(insurer_id,version,effective_from,effective_to,label) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [ctx.orgId, next.n, d.effectiveFrom, d.effectiveTo, d.label],
    );
    for (const i of d.items)
      await db.query(
        "INSERT INTO tariff_items(tariff_set_id,code,description,currency,max_unit_minor) VALUES($1,$2,$3,$4,$5)",
        [t.id, i.code, i.description, i.currency, i.maxUnitMinor],
      );
    await audit(db, ctx, "TariffVersionCreated", t.id);
    return t;
  });
}
export async function resolveAppeal(ctx: Context, id: string, input: unknown) {
  requirePermission(ctx, "review");
  const d = z.object({ resolution: z.string().min(10).max(2000) }).parse(input);
  return transaction(async (db) => {
    const a = await one(
      db,
      `SELECT a.id FROM appeals a JOIN claims c ON c.id=a.claim_id WHERE a.id::text=$1 AND c.insurer_id=$2 AND a.status='OPEN' FOR UPDATE OF a`,
      [id, ctx.orgId],
    );
    if (!a) throw new DomainError("RECORD_NOT_FOUND", 404);
    await db.query(
      `UPDATE appeals SET status='REVIEWED',resolution=$2,reviewed_by=$3 WHERE id=$1`,
      [id, d.resolution, ctx.userId],
    );
    await audit(db, ctx, "AppealReviewed", id);
    return {
      id,
      status: "REVIEWED",
      notice:
        "Original claim decision unchanged. Financial adjustments require a separately approved workflow.",
    };
  });
}

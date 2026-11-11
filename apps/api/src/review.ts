import { z } from "zod";
import { transaction, one } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
import {
  requirePermission,
  claimAccess,
  audit,
  event,
  type Context,
} from "./access.ts";
export async function resolveFinding(ctx: Context, id: string, input: unknown) {
  requirePermission(ctx, "review");
  const d = z
    .object({
      resolution: z.enum([
        "CONFIRMED_ERROR",
        "ACCEPTED_EXPLANATION",
        "REQUIRES_INFORMATION",
        "NOT_SUPPORTED",
      ]),
      reason: z.string().min(5).max(1000),
    })
    .parse(input);
  return transaction(async (db) => {
    const finding = await one(
      db,
      "SELECT f.id,c.id claim_id FROM findings f JOIN validation_runs v ON v.id=f.validation_run_id JOIN claims c ON c.id=v.claim_id WHERE f.id::text=$1 AND c.insurer_id=$2 FOR UPDATE OF f",
      [id, ctx.orgId],
    );
    if (!finding) throw new DomainError("RECORD_NOT_FOUND", 404);
    await db.query(
      "UPDATE findings SET resolution=$2,resolved_by=$3 WHERE id=$1",
      [id, d.resolution + ": " + d.reason, ctx.userId],
    );
    await audit(db, ctx, "FindingResolved", finding.claim_id, {
      findingId: id,
      resolution: d.resolution,
      reason: d.reason,
    });
    return { id, status: "RESOLVED" };
  });
}
export async function assignReview(ctx: Context, id: string, input: unknown) {
  requirePermission(ctx, "review");
  const d = z.object({ reviewerId: z.string().min(1).max(100) }).parse(input);
  return transaction(async (db) => {
    const c = await claimAccess(db, ctx, id, true);
    if (c.insurer_id !== ctx.orgId)
      throw new DomainError("PERMISSION_DENIED", 403);
    const member = await one(
      db,
      `SELECT user_id FROM memberships WHERE user_id=$1 AND organization_id=$2 AND status='ACTIVE' AND 'INSURER_REVIEWER'=ANY(roles)`,
      [d.reviewerId, ctx.orgId],
    );
    if (!member) throw new DomainError("ACTIVE_REVIEWER_REQUIRED", 422);
    const previous = await one(
      db,
      "SELECT id FROM review_assignments WHERE claim_id=$1 AND reviewer_id=$2",
      [id, d.reviewerId],
    );
    if (previous) return previous;
    const r = await one(
      db,
      "INSERT INTO review_assignments(claim_id,reviewer_id,assigned_by) VALUES($1,$2,$3) RETURNING id",
      [id, d.reviewerId, ctx.userId],
    );
    await event(db, ctx, "ReviewAssigned", id, { reviewerId: d.reviewerId });
    return r;
  });
}

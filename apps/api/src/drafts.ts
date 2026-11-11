import { z } from "zod";
import { pool, one, transaction } from "../../../packages/db/index.ts";
import { billItem, DomainError } from "../../../packages/domain/index.ts";
import { requirePermission, type Context } from "./access.ts";
const schema = z.object({
  step: z.number().int().min(0).max(3),
  patient: z.string().max(40),
  insurer: z.string().max(40),
  eligibility: z.any().nullable(),
  encounter: z.any().nullable(),
  draft: z.any().nullable(),
  items: z.array(billItem).max(100),
});
export async function getDraft(ctx: Context) {
  requirePermission(ctx, "claims");
  if (ctx.orgType !== "FACILITY")
    throw new DomainError("PERMISSION_DENIED", 403);
  return (
    (await one(
      pool,
      "SELECT payload,version,updated_at FROM claim_drafts WHERE organization_id=$1 AND actor_id=$2",
      [ctx.orgId, ctx.userId],
    )) || null
  );
}
export async function saveDraft(ctx: Context, input: unknown) {
  requirePermission(ctx, "claims");
  if (ctx.orgType !== "FACILITY")
    throw new DomainError("PERMISSION_DENIED", 403);
  const d = schema.parse(input);
  return transaction(async (db) => {
    return one(
      db,
      "INSERT INTO claim_drafts(organization_id,actor_id,payload) VALUES($1,$2,$3) ON CONFLICT(organization_id,actor_id) DO UPDATE SET payload=EXCLUDED.payload,version=claim_drafts.version+1,updated_at=now() RETURNING version,updated_at",
      [ctx.orgId, ctx.userId, d],
    );
  });
}

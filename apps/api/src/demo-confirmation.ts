import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { transaction, one, type DB } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
import {
  requirePermission,
  paymentAccess,
  audit,
  type Context,
} from "./access.ts";
import { mode } from "./auth.ts";
function digest(id: string, code: string) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(`lux-demo-only:${id}:${code}`)
    .digest("hex");
}
export async function issueDemoConfirmation(ctx: Context, id: string) {
  requirePermission(ctx, "payments.execute");
  if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
  if (mode !== "demo")
    throw new DomainError("DEMO_CONFIRMATION_UNAVAILABLE", 404);
  return transaction(async (db) => {
    const p = await paymentAccess(db, ctx, id, true);
    if (p.insurer_id !== ctx.orgId || p.mode !== "demo")
      throw new DomainError("PERMISSION_DENIED", 403);
    if (p.state !== "AUTHORIZED")
      throw new DomainError("INVALID_PAYMENT_TRANSITION");
    const rate = await one(
      db,
      `SELECT count(*)::int n FROM demo_payment_challenges WHERE actor_id=$1 AND payment_id=$2 AND created_at>now()-interval '5 minutes'`,
      [ctx.userId, id],
    );
    if (rate.n >= 5)
      throw new DomainError("DEMO_CONFIRMATION_RATE_LIMITED", 429);
    await db.query(
      "UPDATE demo_payment_challenges SET consumed_at=now() WHERE payment_id=$1 AND actor_id=$2 AND consumed_at IS NULL",
      [id, ctx.userId],
    );
    const code = String(randomInt(0, 10000)).padStart(4, "0");
    const challenge = await one(
      db,
      `INSERT INTO demo_payment_challenges(payment_id,organization_id,actor_id,payment_version,code_hmac,expires_at) VALUES($1,$2,$3,$4,'pending',now()+interval '2 minutes') RETURNING id,expires_at`,
      [id, ctx.orgId, ctx.userId, p.version],
    );
    await db.query(
      "UPDATE demo_payment_challenges SET code_hmac=$2 WHERE id=$1",
      [challenge.id, digest(challenge.id, code)],
    );
    await audit(db, ctx, "DemoConfirmationIssued", id);
    return {
      challengeId: challenge.id,
      demoCode: code,
      expiresAt: challenge.expires_at,
      paymentVersion: p.version,
      warning:
        "SIMULATION ONLY. Enter the displayed demo code, never your real Orange Money PIN. No real funds move.",
    };
  });
}
export const confirmationSchema = z.object({
  challengeId: z.uuid().optional(),
  demoCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
// Returns a safe error marker rather than throwing, so failed-attempt increments
// are committed by the caller's transaction. Never persist or log the raw code.
export async function consumeDemoConfirmation(
  db: DB,
  ctx: Context,
  payment: any,
  input: unknown,
): Promise<string | null> {
  const data = confirmationSchema.parse(input || {});
  if (!data.challengeId || !data.demoCode) return "DEMO_CONFIRMATION_REQUIRED";
  const c = await one(
    db,
    "SELECT * FROM demo_payment_challenges WHERE id=$1 AND payment_id=$2 AND actor_id=$3 AND organization_id=$4 FOR UPDATE",
    [data.challengeId, payment.id, ctx.userId, ctx.orgId],
  );
  if (
    !c ||
    c.consumed_at ||
    new Date(c.expires_at).getTime() < Date.now() ||
    c.payment_version !== payment.version
  )
    return "DEMO_CONFIRMATION_EXPIRED_OR_UNAVAILABLE";
  if (c.attempts >= 5) return "DEMO_CONFIRMATION_LOCKED";
  await db.query(
    "UPDATE demo_payment_challenges SET attempts=attempts+1 WHERE id=$1",
    [c.id],
  );
  if (
    !timingSafeEqual(
      Buffer.from(c.code_hmac, "hex"),
      Buffer.from(digest(c.id, data.demoCode), "hex"),
    )
  )
    return "DEMO_CONFIRMATION_INCORRECT";
  await db.query(
    "UPDATE demo_payment_challenges SET consumed_at=now() WHERE id=$1",
    [c.id],
  );
  return null;
}

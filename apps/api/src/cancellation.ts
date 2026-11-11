import { z } from "zod";
import { transaction, one } from "../../../packages/db/index.ts";
import {
  DomainError,
  transitionClaim,
  transitionPayment,
} from "../../../packages/domain/index.ts";
import {
  requirePermission,
  claimAccess,
  paymentAccess,
  matchVersion,
  command,
  event,
  type Context,
} from "./access.ts";
export async function withdrawClaim(
  ctx: Context,
  id: string,
  input: unknown,
  version: string | undefined,
  key: string | undefined,
) {
  requirePermission(ctx, "claims");
  const d = z.object({ reason: z.string().min(5).max(1000) }).parse(input);
  return transaction((db) =>
    command(db, ctx, key, { action: "withdraw", id, d, version }, async () => {
      const c = await claimAccess(db, ctx, id, true);
      if (c.facility_id !== ctx.orgId)
        throw new DomainError("PERMISSION_DENIED", 403);
      matchVersion(c.version, version);
      transitionClaim(c.state, "WITHDRAWN");
      if (
        await one(
          db,
          `SELECT id FROM payments WHERE claim_id=$1 AND state NOT IN ('FAILED','CANCELLED') LIMIT 1`,
          [id],
        )
      )
        throw new DomainError("PAYMENT_CONFLICT");
      const r = await one(
        db,
        `UPDATE claims SET state='WITHDRAWN',version=version+1,updated_at=now() WHERE id=$1 RETURNING id,state,version`,
        [id],
      );
      await event(db, ctx, "ClaimWithdrawn", id, { reason: d.reason });
      return r;
    }),
  );
}
export async function cancelPayment(
  ctx: Context,
  id: string,
  input: unknown,
  version: string | undefined,
  key: string | undefined,
) {
  requirePermission(ctx, "payments.authorize");
  if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
  const d = z.object({ reason: z.string().min(5).max(1000) }).parse(input);
  return transaction((db) =>
    command(
      db,
      ctx,
      key,
      { action: "cancel-payment", id, d, version },
      async () => {
        const p = await paymentAccess(db, ctx, id, true);
        if (p.insurer_id !== ctx.orgId)
          throw new DomainError("PERMISSION_DENIED", 403);
        matchVersion(p.version, version);
        transitionPayment(p.state, "CANCELLED");
        if (
          await one(
            db,
            "SELECT id FROM payment_attempts WHERE payment_id=$1 LIMIT 1",
            [id],
          )
        )
          throw new DomainError(
            "DISPATCHED_PAYMENT_REQUIRES_PROVIDER_CANCELLATION",
          );
        const r = await one(
          db,
          `UPDATE payments SET state='CANCELLED',version=version+1 WHERE id=$1 RETURNING id,state,version`,
          [id],
        );
        await db.query(
          `UPDATE claim_payment_allocations SET status='RELEASED' WHERE payment_id=$1`,
          [id],
        );
        await event(db, ctx, "PaymentCancelled", id, { reason: d.reason });
        return r;
      },
    ),
  );
}

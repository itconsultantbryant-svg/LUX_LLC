import { z } from "zod";
import { transaction, one } from "../../../packages/db/index.ts";
import {
  DomainError,
  fees,
  minor,
  transitionPayment,
  type FeeMode,
} from "../../../packages/domain/index.ts";
import {
  claimAccess,
  paymentAccess,
  requirePermission,
  matchVersion,
  command,
  event,
  audit,
  type Context,
} from "./access.ts";
import { mode } from "./auth.ts";
import {
  issueDemoChallenge,
  consumeDemoConfirmation,
  confirmationSchema,
} from "./demo-confirmation.ts";
import { applyVerifiedResult } from "./payments.ts";
import {
  assertWalletFunds,
  paymentWalletSummary,
} from "./finance.ts";

const prepareInput = z.object({
  amountMinor: minor.optional(),
  reason: z.string().trim().min(5).max(1000).optional(),
});

/**
 * Prepares an instantly settled demo payment for an already approved claim.
 * The maker/checker separation is preserved: the demo-only checker substitution
 * is written to the audit trail, exactly as the existing payment flow does.
 * A four-digit demo challenge is issued; it is never a real Orange Money PIN.
 */
export class InstantPaymentService {
  async prepare(ctx: Context, claimId: string, input: unknown, key?: string) {
    requirePermission(ctx, "payments.authorize");
    requirePermission(ctx, "payments.execute");
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    if (mode !== "demo")
      throw new DomainError("DEMO_INSTANT_PAYMENT_UNAVAILABLE", 404);
    const data = prepareInput.parse(input || {});
    return transaction((db) =>
      command(
        db,
        ctx,
        key,
        { action: "instant-payment-prepare", claimId, ...data },
        async () => {
          const claim = await claimAccess(db, ctx, claimId, true);
          if (claim.insurer_id !== ctx.orgId)
            throw new DomainError("PERMISSION_DENIED", 403);
          if (!["APPROVED", "PARTIALLY_APPROVED"].includes(claim.state))
            throw new DomainError("CLAIM_NOT_APPROVED");
          const allocated = await one(
            db,
            `SELECT COALESCE(sum(amount_minor),0)::text total
               FROM claim_payment_allocations
              WHERE claim_id=$1 AND status IN ('RESERVED','CONFIRMED')`,
            [claimId],
          );
          const remaining =
            BigInt(claim.approved_minor) - BigInt(allocated.total);
          const amount = data.amountMinor
            ? BigInt(data.amountMinor)
            : remaining;
          if (amount <= 0n || amount > remaining)
            throw new DomainError("PAYABLE_REMAINDER_EXCEEDED");
          const policy = await one(
            db,
            "SELECT * FROM fee_policies WHERE insurer_id=$1 AND effective_at<=now() ORDER BY version DESC LIMIT 1",
            [ctx.orgId],
          );
          if (!policy) throw new DomainError("FEE_POLICY_UNCONFIGURED");
          const split = fees(amount, policy.mode as FeeMode);
          const destination = await one(
            db,
            "SELECT * FROM wallet_destinations WHERE organization_id=$1 AND verified=true ORDER BY version DESC LIMIT 1",
            [claim.facility_id],
          );
          if (!destination)
            throw new DomainError("VERIFIED_DESTINATION_REQUIRED");
          await assertWalletFunds(
            db,
            ctx.orgId,
            claim.currency,
            split.insurerDebit,
          );
          const payment = await one(
            db,
            `INSERT INTO payments(claim_id,facility_id,insurer_id,currency,base_minor,state,mode,destination_snapshot,fee_snapshot,policy_id,created_by)
             VALUES($1,$2,$3,$4,$5,'AWAITING_AUTHORIZATION','demo',$6,$7,$8,$9) RETURNING *`,
            [
              claimId,
              claim.facility_id,
              claim.insurer_id,
              claim.currency,
              String(amount),
              {
                reference: destination.reference,
                version: destination.version,
                scenario: "success",
              },
              split,
              policy.id,
              ctx.userId,
            ],
          );
          await db.query(
            "INSERT INTO payment_authorizations(payment_id,maker_id,reason) VALUES($1,$2,$3)",
            [
              payment.id,
              ctx.userId,
              data.reason ||
                "Synthetic instant-payment demonstration; not a real insurance payment decision.",
            ],
          );
          await db.query(
            `INSERT INTO claim_payment_allocations(claim_id,payment_id,amount_minor,status) VALUES($1,$2,$3,'RESERVED')`,
            [claimId, payment.id, String(amount)],
          );
          const checker = await one(
            db,
            `SELECT u.id FROM "user" u JOIN memberships m ON m.user_id=u.id
              WHERE u.email='internal.checker@demo.lux.test' AND m.organization_id=$1 AND m.status='ACTIVE' LIMIT 1`,
            [ctx.orgId],
          );
          if (!checker) throw new DomainError("DEMO_CHECKER_UNAVAILABLE", 503);
          await db.query(
            "UPDATE payment_authorizations SET checker_id=$2,authorized_at=now() WHERE payment_id=$1",
            [payment.id, checker.id],
          );
          const authorized = await one(
            db,
            "UPDATE payments SET state='AUTHORIZED',version=version+1 WHERE id=$1 RETURNING *",
            [payment.id],
          );
          await event(db, ctx, "PaymentAuthorized", payment.id);
          await audit(db, ctx, "DemoCheckerSubstitution", payment.id, {
            note: "Demo-only instant path: checker step attributed to the seeded system identity. Production requires a separate human checker.",
          });
          const challenge = await issueDemoChallenge(db, ctx, authorized);
          return {
            payment: authorized,
            claim: {
              id: claim.id,
              reference: claim.reference,
              approved_minor: claim.approved_minor,
              currency: claim.currency,
            },
            ...challenge,
            simulated: true,
            next:
              "Enter the displayed four-digit demo code to simulate immediate Orange Money settlement. Never enter a real Orange Money PIN.",
          };
        },
      ),
    );
  }

  async confirm(
    ctx: Context,
    paymentId: string,
    input: unknown,
    version?: string,
    key?: string,
  ) {
    requirePermission(ctx, "payments.execute");
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    if (mode !== "demo")
      throw new DomainError("DEMO_INSTANT_PAYMENT_UNAVAILABLE", 404);
    const confirmation = confirmationSchema.parse(input || {});
    const result = await transaction((db) =>
      command(
        db,
        ctx,
        key,
        {
          action: "instant-payment-confirm",
          id: paymentId,
          version,
          challengeId: confirmation.challengeId || null,
        },
        async () => {
          const p = await paymentAccess(db, ctx, paymentId, true);
          if (p.insurer_id !== ctx.orgId)
            throw new DomainError("PERMISSION_DENIED", 403);
          matchVersion(p.version, version);
          transitionPayment(p.state, "PROCESSING");
          const confirmationError = await consumeDemoConfirmation(
            db,
            ctx,
            p,
            confirmation,
          );
          if (confirmationError) return { authorizationFailure: confirmationError };
          const processing = await one(
            db,
            `UPDATE payments SET state='PROCESSING',version=version+1 WHERE id=$1 RETURNING *`,
            [paymentId],
          );
          const settled = await applyVerifiedResult(
            db,
            {
              eventId: `demo-instant-${processing.id}`,
              reference: `DEMO-INSTANT-${processing.id}`,
              paymentId: processing.id,
              currency: processing.currency,
              amountMinor: processing.base_minor,
              destination: processing.destination_snapshot.reference,
              outcome: "SETTLED",
            },
            "demo-only instant Orange Money settlement simulation",
          );
          const wallet = await paymentWalletSummary(db, paymentId);
          await audit(db, ctx, "DemoInstantPaymentSettled", paymentId, {
            simulated: true,
            note: "Synchronous demo settlement; no live Orange Money API and no real funds.",
          });
          return {
            payment: settled,
            wallet,
            simulated: true,
            settledNow: true,
            notice:
              "Simulated settlement completed. The facility wallet and the LUX/Orange fee shares were updated immediately. No real money moved and no real Orange Money PIN was used.",
          };
        },
      ),
    );
    if (result.authorizationFailure)
      throw new DomainError(
        result.authorizationFailure,
        result.authorizationFailure === "DEMO_CONFIRMATION_LOCKED" ? 429 : 400,
      );
    return result;
  }
}

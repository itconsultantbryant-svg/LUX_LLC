import { z } from "zod";
import { createHash } from "node:crypto";
import { pool, transaction, one, type DB } from "../../../packages/db/index.ts";
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
import { paymentAdapter, type PaymentResult } from "./adapters.ts";
import { mode } from "./auth.ts";
import {
  consumeDemoConfirmation,
  confirmationSchema,
} from "./demo-confirmation.ts";
export class PaymentsService {
  async list(ctx: Context) {
    requirePermission(ctx, "payments.read");
    return (
      await pool.query(
        "SELECT p.*,c.reference claim_reference FROM payments p JOIN claims c ON c.id=p.claim_id WHERE p.facility_id=$1 OR p.insurer_id=$1 ORDER BY p.created_at DESC LIMIT 100",
        [ctx.orgId],
      )
    ).rows;
  }
  async authorize(
    ctx: Context,
    id: string,
    input: unknown,
    key: string | undefined,
    version: string | undefined,
  ) {
    requirePermission(ctx, "payments.authorize");
    const data = z
      .object({ amountMinor: minor, reason: z.string().min(5).max(1000) })
      .parse(input);
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    return transaction((db) =>
      command(
        db,
        ctx,
        key,
        { action: "authorize", id, data, version },
        async () => {
          const claim = await claimAccess(db, ctx, id, true);
          if (claim.insurer_id !== ctx.orgId)
            throw new DomainError("PERMISSION_DENIED", 403);
          matchVersion(claim.version, version);
          if (!["APPROVED", "PARTIALLY_APPROVED"].includes(claim.state))
            throw new DomainError("CLAIM_NOT_APPROVED");
          const allocated = await one(
            db,
            `SELECT COALESCE(sum(amount_minor),0)::text total FROM claim_payment_allocations WHERE claim_id=$1 AND status IN ('RESERVED','CONFIRMED')`,
            [id],
          );
          const amount = BigInt(data.amountMinor);
          if (
            amount <= 0n ||
            amount + BigInt(allocated.total) > BigInt(claim.approved_minor)
          )
            throw new DomainError("PAYABLE_REMAINDER_EXCEEDED");
          const policy = await one(
            db,
            "SELECT * FROM fee_policies WHERE insurer_id=$1 AND effective_at<=now() ORDER BY version DESC LIMIT 1",
            [ctx.orgId],
          );
          if (!policy) throw new DomainError("FEE_POLICY_UNCONFIGURED");
          const split = fees(amount, policy.mode as FeeMode);
          if (mode === "live" || mode === "sandbox")
            throw new DomainError("LIVE_PROVIDER_NOT_CONTRACTED", 503);
          if (mode === "unconfigured")
            throw new DomainError("PAYMENT_MODE_UNCONFIGURED", 503);
          if (mode !== "demo" && !policy.collection_supported)
            throw new DomainError("FEE_COLLECTION_UNSUPPORTED");
          const destination = await one(
            db,
            "SELECT * FROM wallet_destinations WHERE organization_id=$1 AND verified=true ORDER BY version DESC LIMIT 1",
            [claim.facility_id],
          );
          if (!destination)
            throw new DomainError("VERIFIED_DESTINATION_REQUIRED");
          const payment = await one(
            db,
            `INSERT INTO payments(claim_id,facility_id,insurer_id,currency,base_minor,state,mode,destination_snapshot,fee_snapshot,policy_id,created_by) VALUES($1,$2,$3,$4,$5,'AWAITING_AUTHORIZATION',$6,$7,$8,$9,$10) RETURNING *`,
            [
              id,
              claim.facility_id,
              claim.insurer_id,
              claim.currency,
              data.amountMinor,
              mode,
              {
                reference: destination.reference,
                version: destination.version,
              },
              split,
              policy.id,
              ctx.userId,
            ],
          );
          await db.query(
            "INSERT INTO payment_authorizations(payment_id,maker_id,reason) VALUES($1,$2,$3)",
            [payment.id, ctx.userId, data.reason],
          );
          await db.query(
            `INSERT INTO claim_payment_allocations(claim_id,payment_id,amount_minor,status) VALUES($1,$2,$3,'RESERVED')`,
            [id, payment.id, data.amountMinor],
          );
          await event(db, ctx, "PaymentAuthorizationRequested", payment.id);
          return payment;
        },
      ),
    );
  }
  async check(
    ctx: Context,
    id: string,
    key: string | undefined,
    version: string | undefined,
  ) {
    requirePermission(ctx, "payments.authorize");
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    return transaction((db) =>
      command(
        db,
        ctx,
        key,
        { action: "check-payment", id, version },
        async () => {
          const p = await paymentAccess(db, ctx, id, true);
          if (p.insurer_id !== ctx.orgId)
            throw new DomainError("PERMISSION_DENIED", 403);
          matchVersion(p.version, version);
          transitionPayment(p.state, "AUTHORIZED");
          const a = await one(
            db,
            "SELECT * FROM payment_authorizations WHERE payment_id=$1 FOR UPDATE",
            [id],
          );
          if (a.maker_id === ctx.userId)
            throw new DomainError("SEPARATE_CHECKER_REQUIRED", 403);
          await db.query(
            "UPDATE payment_authorizations SET checker_id=$2,authorized_at=now() WHERE payment_id=$1",
            [id, ctx.userId],
          );
          const r = await one(
            db,
            `UPDATE payments SET state='AUTHORIZED',version=version+1 WHERE id=$1 RETURNING *`,
            [id],
          );
          await event(db, ctx, "PaymentAuthorized", id);
          return r;
        },
      ),
    );
  }
  async execute(
    ctx: Context,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input?: unknown,
  ) {
    requirePermission(ctx, "payments.execute");
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    const confirmation = confirmationSchema.parse(input || {});
    const result = await transaction((db) =>
      command(
        db,
        ctx,
        key,
        {
          action: "execute-payment",
          id,
          version,
          challengeId: confirmation.challengeId || null,
        },
        async () => {
          const p = await paymentAccess(db, ctx, id, true);
          if (p.insurer_id !== ctx.orgId)
            throw new DomainError("PERMISSION_DENIED", 403);
          matchVersion(p.version, version);
          transitionPayment(p.state, "PROCESSING");
          if (p.mode !== "demo")
            throw new DomainError(
              "BUSINESS_PAYMENT_CAPABILITY_UNAVAILABLE",
              503,
            );
          const confirmationError = await consumeDemoConfirmation(
            db,
            ctx,
            p,
            confirmation,
          );
          if (confirmationError)
            return { authorizationFailure: confirmationError };
          await db.query(
            `INSERT INTO payment_attempts(payment_id,idempotency_key,status) VALUES($1,$2,'QUEUED')`,
            [id, `payment-${id}`],
          );
          const r = await one(
            db,
            `UPDATE payments SET state='PROCESSING',version=version+1 WHERE id=$1 RETURNING *`,
            [id],
          );
          await event(db, ctx, "PaymentExecutionRequested", id);
          return r;
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
  async status(ctx: Context, id: string) {
    requirePermission(ctx, "payments.read");
    return transaction(async (db) => {
      const p = await paymentAccess(db, ctx, id, true);
      if (
        p.insurer_id !== ctx.orgId ||
        !ctx.permissions.includes("payments.execute")
      )
        throw new DomainError("PERMISSION_DENIED", 403);
      if (
        ![
          "UNKNOWN_PENDING_INVESTIGATION",
          "PROCESSING",
          "AWAITING_FUNDS",
        ].includes(p.state)
      )
        return p;
      await event(db, ctx, "PaymentStatusRequested", id);
      return { id, state: p.state, statusCheck: "QUEUED" };
    });
  }
  async verifiedCallback(body: unknown, headers: Record<string, unknown>) {
    const result = await paymentAdapter(mode).verify(body, headers);
    return transaction((db) => applyVerifiedResult(db, result));
  }
  async manualVerify(ctx: Context, id: string, input: unknown) {
    requirePermission(ctx, "reconciliation");
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    if (process.env.MANUAL_VERIFICATION_ENABLED !== "true")
      throw new DomainError("MANUAL_PROCEDURE_NOT_APPROVED", 503);
    const data = z
      .object({
        reference: z.string().min(8).max(100),
        evidence: z.string().min(20).max(2000),
        amountMinor: minor,
        currency: z.enum(["USD", "LRD"]),
        destination: z.string().min(5),
      })
      .parse(input);
    return transaction(async (db) => {
      const p = await paymentAccess(db, ctx, id, true);
      if (p.mode !== "manual" || p.insurer_id !== ctx.orgId)
        throw new DomainError("MANUAL_MODE_REQUIRED");
      if (p.created_by === ctx.userId)
        throw new DomainError("INDEPENDENT_VERIFIER_REQUIRED", 403);
      if (
        !["AUTHORIZED", "PROCESSING", "UNKNOWN_PENDING_INVESTIGATION"].includes(
          p.state,
        )
      )
        throw new DomainError("INVALID_PAYMENT_TRANSITION");
      if (p.state === "AUTHORIZED")
        await db.query(`UPDATE payments SET state='PROCESSING' WHERE id=$1`, [
          id,
        ]);
      const r = await applyVerifiedResult(
        db,
        {
          eventId: "manual-" + data.reference,
          paymentId: id,
          reference: data.reference,
          currency: data.currency,
          amountMinor: data.amountMinor,
          destination: data.destination,
          outcome: "SETTLED",
        },
        data.evidence,
      );
      await audit(db, ctx, "ManualEvidenceVerified", id, {
        reference: data.reference,
      });
      return r;
    });
  }
}
export async function applyVerifiedResult(
  db: DB,
  result: PaymentResult,
  evidence = "deterministic demonstration",
) {
  const p = await one(db, "SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
    result.paymentId,
  ]);
  if (!p) throw new DomainError("RECORD_NOT_FOUND", 404);
  if (
    p.currency !== result.currency ||
    BigInt(p.base_minor) !== BigInt(result.amountMinor) ||
    p.destination_snapshot.reference !== result.destination
  )
    throw new DomainError("PROVIDER_PAYLOAD_MISMATCH");
  const hash = createHash("sha256")
    .update(JSON.stringify(result))
    .digest("hex");
  const existing = await one(
    db,
    "SELECT * FROM provider_events WHERE provider_event_id=$1",
    [result.eventId],
  );
  if (existing) {
    if (existing.payload_hash !== hash)
      throw new DomainError("PROVIDER_EVENT_CONFLICT");
    return p;
  }
  // Ignore older status events once settled; only an explicit verified reversal can undo it.
  if (
    ["REVERSED", "FAILED", "CANCELLED"].includes(p.state) ||
    (p.state === "SETTLED" && result.outcome !== "REVERSED")
  )
    return p;
  const state = transitionPayment(p.state, result.outcome);
  const ev = await one(
    db,
    "INSERT INTO provider_events(provider_event_id,payment_id,payload_hash,verified,outcome,evidence) VALUES($1,$2,$3,true,$4,$5) RETURNING id",
    [
      result.eventId,
      p.id,
      hash,
      state,
      { reference: result.reference, evidence },
    ],
  );
  await db.query(
    "UPDATE payments SET state=$2,provider_reference=$3,version=version+1,settled_at=CASE WHEN $2='SETTLED' THEN now() ELSE settled_at END WHERE id=$1",
    [p.id, state, result.reference],
  );
  if (state === "SETTLED") {
    await db.query(
      `UPDATE claim_payment_allocations SET status='CONFIRMED' WHERE payment_id=$1`,
      [p.id],
    );
    const f = p.fee_snapshot;
    await db.query(
      "INSERT INTO fee_assessments(payment_id,currency,total_minor,lux_minor,orange_minor) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [p.id, p.currency, f.total, f.lux, f.orange],
    );
    for (const [category, amount] of [
      ["FACILITY_PRINCIPAL", p.base_minor],
      ["LUX_EARNED", f.lux],
      ["ORANGE_ACCRUED", f.orange],
    ])
      await db.query(
        "INSERT INTO ledger_entries(payment_id,category,currency,amount_minor,evidence_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [p.id, category, p.currency, amount, ev.id],
      );
  } else if (state === "FAILED")
    await db.query(
      `UPDATE claim_payment_allocations SET status='RELEASED' WHERE payment_id=$1`,
      [p.id],
    );
  else if (state === "REVERSED") {
    await db.query(
      `UPDATE claim_payment_allocations SET status='REVERSED' WHERE payment_id=$1`,
      [p.id],
    );
    const entries = (
      await db.query("SELECT * FROM ledger_entries WHERE payment_id=$1", [p.id])
    ).rows;
    for (const e of entries)
      await db.query(
        "INSERT INTO ledger_entries(payment_id,category,currency,amount_minor,evidence_id) VALUES($1,$2,$3,$4,$5)",
        [
          p.id,
          e.category + "_REVERSAL",
          e.currency,
          String(-BigInt(e.amount_minor)),
          ev.id,
        ],
      );
  }
  await db.query(
    "INSERT INTO outbox_events(type,organization_id,resource_id) VALUES($1,$2,$3)",
    [
      state === "SETTLED"
        ? "PaymentSettled"
        : state === "REVERSED"
          ? "PaymentReversed"
          : "ProviderResultVerified",
      p.insurer_id,
      p.id,
    ],
  );
  await db.query(
    "INSERT INTO audit_events(organization_id,action,resource_id,metadata) VALUES($1,$2,$3,$4)",
    [
      p.insurer_id,
      "ProviderResultVerified",
      p.id,
      { state, reference: result.reference },
    ],
  );
  return { ...p, state };
}

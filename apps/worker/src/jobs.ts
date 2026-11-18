import { pool, transaction, one, type DB } from "../../../packages/db/index.ts";
import { assistValidation, paymentAdapter } from "../../api/src/adapters.ts";
import { applyVerifiedResult } from "../../api/src/payments.ts";
import { runClaimValidation } from "../../api/src/validation.ts";
import { scanAttachment } from "../../api/src/storage.ts";
export async function validateClaimJob(
  db: DB,
  job: any,
  assist = assistValidation,
) {
  return runClaimValidation(
    db,
    {
      claimId: job.resource_id,
      facilityId: job.organization_id,
      submissionVersion: job.payload.submissionVersion,
    },
    assist,
  );
}
export async function tick() {
  // PostgreSQL durable queue: SKIP LOCKED, atomic handlers, exponential retries.
  // No Redis dependency; committed outbox work survives API/worker outages.
  const job = await transaction(async (db) => {
    const j = await one(
      db,
      `SELECT * FROM outbox_events WHERE (status='PENDING' OR (status='RUNNING' AND locked_at<now()-interval '5 minutes')) AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (j)
      await db.query(
        `UPDATE outbox_events SET status='RUNNING',locked_at=now(),attempts=attempts+1 WHERE id=$1`,
        [j.id],
      );
    return j;
  });
  if (!job) return false;
  try {
    if (job.type === "AttachmentUploaded")
      await scanAttachment(job.resource_id);
    if (
      ["PaymentExecutionRequested", "PaymentStatusRequested"].includes(job.type)
    ) {
      const p = await one(
        pool,
        "SELECT * FROM payments WHERE id=$1 AND insurer_id=$2",
        [job.resource_id, job.organization_id],
      );
      if (
        p &&
        [
          "PROCESSING",
          "UNKNOWN_PENDING_INVESTIGATION",
          "AWAITING_FUNDS",
        ].includes(p.state)
      ) {
        const adapter = paymentAdapter(p.mode);
        // A crash after provider acceptance must lead to a status query, never a second initiation.
        const attempt = await one(
          pool,
          "SELECT * FROM payment_attempts WHERE payment_id=$1",
          [p.id],
        );
        const initiate =
          job.type === "PaymentExecutionRequested" &&
          attempt?.status === "QUEUED";
        if (initiate)
          await pool.query(
            `UPDATE payment_attempts SET status='DISPATCHING' WHERE payment_id=$1`,
            [p.id],
          );
        let result;
        try {
          result = await (initiate ? adapter.initiate(p) : adapter.status(p));
        } catch {
          await pool.query(
            `UPDATE payments SET state='UNKNOWN_PENDING_INVESTIGATION',version=version+1 WHERE id=$1 AND state='PROCESSING'`,
            [p.id],
          );
          throw Error("PAYMENT_STATUS_REQUIRES_INVESTIGATION");
        }
        await transaction(async (db) => {
          await applyVerifiedResult(db, result);
          await db.query(
            "UPDATE payment_attempts SET status=$2,external_reference=$3 WHERE payment_id=$1",
            [p.id, result.outcome, result.reference],
          );
        });
      }
    }
    await transaction(async (db) => {
      const current = await one(
        db,
        "SELECT status FROM outbox_events WHERE id=$1 FOR UPDATE",
        [job.id],
      );
      if (current?.status === "DONE") return;
      if (job.type === "ClaimSubmitted") await validateClaimJob(db, job);
      if (
        ![
          "ClaimSubmitted",
          "PaymentExecutionRequested",
          "PaymentStatusRequested",
          "AttachmentUploaded",
        ].includes(job.type)
      ) {
        const related = await one(
          db,
          "SELECT facility_id,insurer_id FROM claims WHERE id=$1 UNION ALL SELECT facility_id,insurer_id FROM payments WHERE id=$1 LIMIT 1",
          [job.resource_id],
        );
        const orgs = [
          ...new Set(
            [
              job.organization_id,
              related?.facility_id,
              related?.insurer_id,
            ].filter(Boolean),
          ),
        ];
        for (const org of orgs)
          await db.query(
            "INSERT INTO notifications(organization_id,event_key,title,link) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [
              org,
              job.id,
              job.type.replace(/([A-Z])/g, " $1").trim(),
              "/app/" +
                (job.type.startsWith("Payment") ? "payments" : "claims"),
            ],
          );
      }
      await db.query(
        `UPDATE outbox_events SET status='DONE',processed_at=now() WHERE id=$1`,
        [job.id],
      );
    });
  } catch {
    await pool.query(
      `UPDATE outbox_events SET status=CASE WHEN attempts>=8 THEN 'DEAD' ELSE 'PENDING' END,last_error='HANDLER_FAILED_REVIEW_REQUIRED',available_at=now()+interval '1 second'*least(3600,power(2,attempts)::int) WHERE id=$1`,
      [job.id],
    );
  }
  return true;
}

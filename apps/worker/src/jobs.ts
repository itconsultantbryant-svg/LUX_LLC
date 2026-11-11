import { pool, transaction, one, type DB } from "../../../packages/db/index.ts";
import { assistValidation, paymentAdapter } from "../../api/src/adapters.ts";
import { applyVerifiedResult } from "../../api/src/payments.ts";
import { scanAttachment } from "../../api/src/storage.ts";
export async function validateClaimJob(
  db: DB,
  job: any,
  assist = assistValidation,
) {
  const c = await one(
    db,
    "SELECT * FROM claims WHERE id=$1 AND facility_id=$2 FOR UPDATE",
    [job.resource_id, job.organization_id],
  );
  if (
    !c ||
    c.state !== "SUBMITTED" ||
    c.submission_version !== job.payload.submissionVersion
  )
    return;
  await db.query(
    `UPDATE claims SET state='VALIDATING',version=version+1 WHERE id=$1`,
    [c.id],
  );
  const version = await one(
    db,
    "SELECT snapshot FROM claim_versions WHERE claim_id=$1 AND version=$2",
    [c.id, c.submission_version],
  );
  const run = await one(
    db,
    `INSERT INTO validation_runs(claim_id,input_version,ruleset_version,model_version,status) VALUES($1,$2,'pilot-completeness-v1','deterministic-no-clinical-inference-v1','RUNNING') RETURNING id`,
    [c.id, c.submission_version],
  );
  const snapshot = version.snapshot;
  const findings: any[] = [];
  const add = (
    field: string,
    category: string,
    reason: string,
    evidence: string,
  ) =>
    findings.push({
      field,
      category,
      reason,
      evidence,
      severity: "REVIEW",
      confidence: null,
    });
  if (
    snapshot.eligibility.status !== "ACTIVE" ||
    Date.now() - new Date(snapshot.eligibility.checked_at).getTime() > 86400000
  )
    add(
      "eligibility",
      "COVERAGE",
      "Coverage is uncertain or stale. Insurer verification is required.",
      "eligibility snapshot",
    );
  if (!snapshot.encounter.notes || !snapshot.encounter.diagnosis)
    add(
      "encounter",
      "COMPLETENESS",
      "Encounter documentation is incomplete.",
      "submitted encounter",
    );
  for (const item of snapshot.items) {
    const tariff = await one(
      db,
      `SELECT ti.* FROM tariff_items ti JOIN tariff_sets ts ON ts.id=ti.tariff_set_id WHERE ts.insurer_id=$1 AND ti.code=$2 AND ti.currency=$3 AND $4::date BETWEEN ts.effective_from AND ts.effective_to ORDER BY ts.version DESC LIMIT 1`,
      [c.insurer_id, item.code, c.currency, snapshot.encounter.service_date],
    );
    if (!tariff)
      add(
        "item." + item.id,
        "TARIFF",
        "No applicable pilot tariff found.",
        "bill item " + item.code,
      );
    else if (BigInt(item.unit_minor) > BigInt(tariff.max_unit_minor))
      add(
        "item." + item.id,
        "TARIFF",
        "Submitted unit charge exceeds the applicable tariff.",
        "tariff " + tariff.id,
      );
  }
  const duplicate = await one(
    db,
    `SELECT reference FROM claims WHERE id<>$1 AND patient_id=$2 AND insurer_id=$3 AND submitted_minor=$4 AND created_at>$5::timestamptz-interval '7 days' AND state<>'DRAFT' LIMIT 1`,
    [c.id, c.patient_id, c.insurer_id, c.submitted_minor, c.created_at],
  );
  if (duplicate)
    add(
      "claim",
      "DUPLICATE",
      "A similar submission exists; repeat care may still be valid.",
      "claim " + duplicate.reference,
    );
  try {
    const ai = await assist(snapshot);
    findings.push(...ai.findings);
    await db.query(
      `UPDATE validation_runs SET status='COMPLETED',completed_at=now() WHERE id=$1`,
      [run.id],
    );
  } catch {
    await db.query(
      `UPDATE validation_runs SET status='PROCESSING_ERROR',processing_error='AI_ADAPTER_UNAVAILABLE',completed_at=now() WHERE id=$1`,
      [run.id],
    );
  }
  for (const f of findings)
    await db.query(
      "INSERT INTO findings(validation_run_id,field,category,severity,reason,evidence,confidence) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        run.id,
        f.field,
        f.category,
        f.severity,
        f.reason,
        f.evidence,
        f.confidence,
      ],
    );
  // Even a clean deterministic run always requires an insurer human decision.
  await db.query(
    `UPDATE claims SET state='AWAITING_REVIEW',version=version+1,updated_at=now() WHERE id=$1`,
    [c.id],
  );
  await db.query(
    `INSERT INTO outbox_events(type,organization_id,resource_id) VALUES('ValidationCompleted',$1,$2)`,
    [c.insurer_id, c.id],
  );
  await db.query(
    `INSERT INTO audit_events(organization_id,action,resource_id) VALUES($1,'ValidationCompleted',$2)`,
    [c.insurer_id, c.id],
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

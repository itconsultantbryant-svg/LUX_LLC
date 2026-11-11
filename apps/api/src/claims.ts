import { z } from "zod";
import { pool, transaction, one } from "../../../packages/db/index.ts";
import {
  DomainError,
  claimSchema,
  billTotal,
  decisionSchema,
  transitionClaim,
} from "../../../packages/domain/index.ts";
import {
  audit,
  event,
  claimAccess,
  requirePermission,
  matchVersion,
  command,
  type Context,
} from "./access.ts";
export class ClaimsService {
  async patients(ctx: Context) {
    if (
      !ctx.permissions.includes("eligibility") &&
      !ctx.permissions.includes("clinical")
    )
      throw new DomainError("PERMISSION_DENIED", 403);
    return (
      await pool.query(
        "SELECT id,display_name,birth_year FROM patients WHERE facility_id=$1 ORDER BY display_name",
        [ctx.orgId],
      )
    ).rows;
  }
  async eligibility(ctx: Context, input: unknown) {
    requirePermission(ctx, "eligibility");
    const data = z
      .object({ patientId: z.uuid(), insurerId: z.uuid() })
      .parse(input);
    return transaction(async (db) => {
      const patient = await one(
        db,
        "SELECT id FROM patients WHERE id=$1 AND facility_id=$2",
        [data.patientId, ctx.orgId],
      );
      const contract = await one(
        db,
        `SELECT id FROM facility_insurer_contracts WHERE facility_id=$1 AND insurer_id=$2 AND status='ACTIVE' AND current_date BETWEEN starts_on AND ends_on`,
        [ctx.orgId, data.insurerId],
      );
      if (!patient || !contract) throw new DomainError("RECORD_NOT_FOUND", 404);
      const ref = await one(
        db,
        "SELECT * FROM insurer_patient_references WHERE patient_id=$1 AND insurer_id=$2",
        [data.patientId, data.insurerId],
      );
      let status = "UNKNOWN";
      if (ref) {
        status =
          Date.now() - new Date(ref.source_updated_at).getTime() > 86400000
            ? "STALE"
            : ref.status === "ACTIVE" &&
                new Date(ref.effective_to) >= new Date() &&
                new Date(ref.effective_from) <= new Date()
              ? "ACTIVE"
              : "INACTIVE";
      }
      const snapshot = await one(
        db,
        `INSERT INTO eligibility_snapshots(patient_id,facility_id,insurer_id,status,source,policy_reference,source_updated_at,benefits,checked_by) VALUES($1,$2,$3,$4,'AUTHORIZED_INSURER_RECORD',$5,$6,$7,$8) RETURNING *`,
        [
          data.patientId,
          ctx.orgId,
          data.insurerId,
          status,
          ref?.policy_reference,
          ref?.source_updated_at,
          ref?.benefits || {},
          ctx.userId,
        ],
      );
      await audit(db, ctx, "EligibilityChecked", snapshot.id, { status });
      return snapshot;
    });
  }
  async encounter(ctx: Context, input: unknown) {
    requirePermission(ctx, "encounters.write");
    if (ctx.orgType !== "FACILITY")
      throw new DomainError("PERMISSION_DENIED", 403);
    const data = z
      .object({
        patientId: z.uuid(),
        serviceDate: z.iso.date(),
        diagnosis: z.string().min(3).max(500),
        notes: z.string().min(3).max(5000),
        prescription: z
          .array(
            z.object({
              name: z.string().min(1),
              strength: z.string(),
              dose: z.string(),
              route: z.string(),
              frequency: z.string(),
              duration: z.string(),
              quantity: z.number().int().positive(),
            }),
          )
          .max(30)
          .default([]),
      })
      .parse(input);
    return transaction(async (db) => {
      if (
        !(await one(
          db,
          "SELECT id FROM patients WHERE id=$1 AND facility_id=$2",
          [data.patientId, ctx.orgId],
        ))
      )
        throw new DomainError("RECORD_NOT_FOUND", 404);
      const e = await one(
        db,
        "INSERT INTO encounters(patient_id,facility_id,clinician_id,service_date,diagnosis,notes,prescription) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          data.patientId,
          ctx.orgId,
          ctx.userId,
          data.serviceDate,
          data.diagnosis,
          data.notes,
          JSON.stringify(data.prescription),
        ],
      );
      await db.query(
        "INSERT INTO encounter_versions(encounter_id,version,snapshot,actor_id) VALUES($1,1,$2,$3)",
        [e.id, e, ctx.userId],
      );
      await audit(db, ctx, "EncounterRecorded", e.id);
      return e;
    });
  }
  async create(ctx: Context, input: unknown) {
    requirePermission(ctx, "claims");
    if (ctx.orgType !== "FACILITY")
      throw new DomainError("PERMISSION_DENIED", 403);
    const data = claimSchema.parse(input);
    return transaction(async (db) => {
      const contract = await one(
        db,
        `SELECT * FROM facility_insurer_contracts WHERE facility_id=$1 AND insurer_id=$2 AND status='ACTIVE' AND current_date BETWEEN starts_on AND ends_on`,
        [ctx.orgId, data.insurerId],
      );
      const encounter = await one(
        db,
        "SELECT * FROM encounters WHERE id=$1 AND patient_id=$2 AND facility_id=$3",
        [data.encounterId, data.patientId, ctx.orgId],
      );
      const eligibility = await one(
        db,
        "SELECT * FROM eligibility_snapshots WHERE id=$1 AND patient_id=$2 AND facility_id=$3 AND insurer_id=$4",
        [data.eligibilityId, data.patientId, ctx.orgId, data.insurerId],
      );
      if (!contract || !encounter || !eligibility)
        throw new DomainError("INVALID_CLAIM_RELATIONSHIP", 422);
      const claim = await one(
        db,
        `INSERT INTO claims(facility_id,insurer_id,contract_id,patient_id,encounter_id,eligibility_id,currency,submitted_minor,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          ctx.orgId,
          data.insurerId,
          contract.id,
          data.patientId,
          data.encounterId,
          data.eligibilityId,
          data.currency,
          String(billTotal(data.items)),
          ctx.userId,
        ],
      );
      for (const item of data.items)
        await db.query(
          "INSERT INTO claim_items(claim_id,code,description,quantity,unit_minor) VALUES($1,$2,$3,$4,$5)",
          [
            claim.id,
            item.code,
            item.description,
            item.quantity,
            item.unitMinor,
          ],
        );
      await audit(db, ctx, "ClaimDraftCreated", claim.id);
      return claim;
    });
  }
  async list(ctx: Context, query: Record<string, any>) {
    if (
      !ctx.permissions.some((p) =>
        ["claims", "review", "payments.read"].includes(p),
      )
    )
      throw new DomainError("PERMISSION_DENIED", 403);
    const cursor = query.cursor ? z.iso.datetime().parse(query.cursor) : null;
    const rows = (
      await pool.query(
        `SELECT c.id,c.reference,c.state,c.currency,c.submitted_minor,c.approved_minor,c.version,c.updated_at,f.name facility,i.name insurer FROM claims c JOIN organizations f ON f.id=c.facility_id JOIN organizations i ON i.id=c.insurer_id WHERE (c.facility_id=$1 OR c.insurer_id=$1) AND ($2::text IS NULL OR c.state=$2) AND ($3::timestamptz IS NULL OR c.updated_at<$3) AND ($4::text IS NULL OR c.reference ILIKE '%'||$4||'%') ORDER BY c.updated_at DESC,c.id LIMIT 51`,
        [
          ctx.orgId,
          query.state || null,
          cursor,
          query.search ? String(query.search).slice(0, 80) : null,
        ],
      )
    ).rows;
    const more = rows.length > 50;
    return {
      data: rows.slice(0, 50),
      nextCursor: more ? rows[49].updated_at.toISOString() : null,
    };
  }
  async detail(ctx: Context, id: string) {
    if (
      !ctx.permissions.some((p) =>
        ["claims", "review", "payments.read"].includes(p),
      )
    )
      throw new DomainError("PERMISSION_DENIED", 403);
    const claim = await claimAccess(pool, ctx, id);
    const clinical = ctx.permissions.includes("clinical");
    const items = clinical
      ? (await pool.query("SELECT * FROM claim_items WHERE claim_id=$1", [id]))
          .rows
      : [];
    const findings = clinical
      ? (
          await pool.query(
            "SELECT f.*,v.status run_status,v.processing_error FROM findings f JOIN validation_runs v ON v.id=f.validation_run_id WHERE v.claim_id=$1 ORDER BY f.created_at",
            [id],
          )
        ).rows
      : [];
    const decisions = (
      await pool.query(
        `SELECT id,outcome,approved_minor,created_at${clinical ? ",reason" : ""} FROM decisions WHERE claim_id=$1 ORDER BY created_at`,
        [id],
      )
    ).rows;
    const validationRuns = clinical
      ? (
          await pool.query(
            "SELECT id,input_version,ruleset_version,model_version,status,processing_error,created_at,completed_at FROM validation_runs WHERE claim_id=$1 ORDER BY created_at DESC",
            [id],
          )
        ).rows
      : [];
    const attachments = clinical
      ? (
          await pool.query(
            "SELECT id,document_type,content_type,size_bytes,scan_state,created_at FROM attachments WHERE claim_id=$1 ORDER BY created_at",
            [id],
          )
        ).rows
      : [];
    const timeline = (
      await pool.query(
        "SELECT action,created_at FROM audit_events WHERE resource_id=$1 ORDER BY created_at",
        [id],
      )
    ).rows;
    const patient = clinical
      ? await one(
          pool,
          "SELECT display_name,birth_year FROM patients WHERE id=$1",
          [claim.patient_id],
        )
      : undefined;
    const encounter = clinical
      ? await one(
          pool,
          "SELECT service_date,diagnosis,notes,prescription FROM encounters WHERE id=$1",
          [claim.encounter_id],
        )
      : undefined;
    const eligibility = clinical
      ? await one(
          pool,
          "SELECT status,source,checked_at,source_updated_at FROM eligibility_snapshots WHERE id=$1",
          [claim.eligibility_id],
        )
      : undefined;
    const { patient_id, encounter_id, eligibility_id, ...safe } = claim;
    return {
      ...safe,
      patient,
      encounter,
      eligibility,
      items,
      findings,
      validationRuns,
      attachments,
      decisions,
      timeline,
    };
  }
  async submit(
    ctx: Context,
    id: string,
    version: string | undefined,
    key: string | undefined,
  ) {
    requirePermission(ctx, "claims");
    return transaction((db) =>
      command(db, ctx, key, { action: "submit", id, version }, async () => {
        const c = await claimAccess(db, ctx, id, true);
        if (c.facility_id !== ctx.orgId)
          throw new DomainError("PERMISSION_DENIED", 403);
        matchVersion(c.version, version);
        transitionClaim(c.state, "SUBMITTED");
        const items = (
          await db.query("SELECT * FROM claim_items WHERE claim_id=$1", [id])
        ).rows;
        if (!items.length || BigInt(c.submitted_minor) <= 0n)
          throw new DomainError("BILL_REQUIRED", 422);
        const contract = await one(
          db,
          `SELECT * FROM facility_insurer_contracts WHERE id=$1 AND status='ACTIVE' AND current_date BETWEEN starts_on AND ends_on`,
          [c.contract_id],
        );
        if (!contract) throw new DomainError("CONTRACT_INACTIVE", 422);
        const docs = (
          await db.query(
            `SELECT document_type FROM attachments WHERE claim_id=$1 AND scan_state='CLEAN'`,
            [id],
          )
        ).rows.map((r) => r.document_type);
        if (contract.required_documents.some((d: string) => !docs.includes(d)))
          throw new DomainError("REQUIRED_EVIDENCE_MISSING", 422);
        const encounter = await one(
          db,
          "SELECT * FROM encounters WHERE id=$1",
          [c.encounter_id],
        );
        const eligibility = await one(
          db,
          "SELECT * FROM eligibility_snapshots WHERE id=$1",
          [c.eligibility_id],
        );
        const snapshot = { claim: c, items, encounter, eligibility };
        await db.query(
          "INSERT INTO claim_versions(claim_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4)",
          [id, c.submission_version + 1, snapshot, ctx.userId],
        );
        const result = await one(
          db,
          `UPDATE claims SET state='SUBMITTED',submission_version=submission_version+1,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,state,version`,
          [id],
        );
        await event(db, ctx, "ClaimSubmitted", id, {
          submissionVersion: c.submission_version + 1,
        });
        return result;
      }),
    );
  }
  async correct(
    ctx: Context,
    id: string,
    version: string | undefined,
    input: unknown,
  ) {
    requirePermission(ctx, "claims");
    const data = z
      .object({
        reason: z.string().min(5).max(2000),
        items: z.array(claimSchema.shape.items.element).min(1),
      })
      .parse(input);
    return transaction(async (db) => {
      const c = await claimAccess(db, ctx, id, true);
      if (c.facility_id !== ctx.orgId)
        throw new DomainError("PERMISSION_DENIED", 403);
      matchVersion(c.version, version);
      if (c.state !== "DRAFT") transitionClaim(c.state, "DRAFT");
      await db.query("DELETE FROM claim_items WHERE claim_id=$1", [id]);
      for (const i of data.items)
        await db.query(
          "INSERT INTO claim_items(claim_id,code,description,quantity,unit_minor) VALUES($1,$2,$3,$4,$5)",
          [id, i.code, i.description, i.quantity, i.unitMinor],
        );
      const r = await one(
        db,
        `UPDATE claims SET state='DRAFT',submitted_minor=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,state,version`,
        [id, String(billTotal(data.items))],
      );
      await audit(db, ctx, "ClaimCorrected", id, { reason: data.reason });
      return r;
    });
  }
  async decide(
    ctx: Context,
    id: string,
    input: unknown,
    version: string | undefined,
    key: string | undefined,
  ) {
    requirePermission(ctx, "review");
    const data = decisionSchema.parse(input);
    return transaction((db) =>
      command(
        db,
        ctx,
        key,
        { action: "decision", id, data, version },
        async () => {
          const c = await claimAccess(db, ctx, id, true);
          if (c.insurer_id !== ctx.orgId)
            throw new DomainError("PERMISSION_DENIED", 403);
          matchVersion(c.version, version);
          transitionClaim(c.state, data.outcome);
          const amount = BigInt(data.approvedMinor),
            submitted = BigInt(c.submitted_minor);
          if (
            amount > submitted ||
            (data.outcome === "APPROVED" && amount !== submitted) ||
            (data.outcome === "PARTIALLY_APPROVED" &&
              (amount === 0n || amount === submitted)) ||
            (["REJECTED", "NEEDS_INFORMATION"].includes(data.outcome) &&
              amount !== 0n)
          )
            throw new DomainError("INVALID_APPROVED_AMOUNT", 422);
          const reserved = await one(
            db,
            `SELECT count(*) n FROM claim_payment_allocations WHERE claim_id=$1 AND status IN ('RESERVED','CONFIRMED')`,
            [id],
          );
          if (Number(reserved.n)) throw new DomainError("PAYMENT_CONFLICT");
          const tariff = (
            await db.query(
              "SELECT * FROM tariff_sets WHERE insurer_id=$1 ORDER BY version DESC",
              [ctx.orgId],
            )
          ).rows;
          await db.query(
            "INSERT INTO decisions(claim_id,submission_version,outcome,reason,approved_minor,tariff_snapshot,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              id,
              c.submission_version,
              data.outcome,
              data.reason,
              data.approvedMinor,
              JSON.stringify(tariff),
              ctx.userId,
            ],
          );
          const r = await one(
            db,
            "UPDATE claims SET state=$2,approved_minor=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,state,version",
            [id, data.outcome, data.approvedMinor],
          );
          await event(db, ctx, "DecisionRecorded", id, {
            outcome: data.outcome,
          });
          return r;
        },
      ),
    );
  }
  async appeal(ctx: Context, id: string, input: unknown) {
    requirePermission(ctx, "claims");
    const d = z.object({ reason: z.string().min(10).max(2000) }).parse(input);
    return transaction(async (db) => {
      const c = await claimAccess(db, ctx, id, true);
      if (
        c.facility_id !== ctx.orgId ||
        !["REJECTED", "PARTIALLY_APPROVED"].includes(c.state)
      )
        throw new DomainError("APPEAL_NOT_ALLOWED");
      const decision = await one(
        db,
        "SELECT id FROM decisions WHERE claim_id=$1 ORDER BY created_at DESC LIMIT 1",
        [id],
      );
      const result = await one(
        db,
        "INSERT INTO appeals(claim_id,decision_id,reason,created_by) VALUES($1,$2,$3,$4) RETURNING *",
        [id, decision.id, d.reason, ctx.userId],
      );
      await event(db, ctx, "AppealOpened", id);
      return result;
    });
  }
}

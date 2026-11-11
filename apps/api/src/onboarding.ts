import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { pool, transaction, one } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
import { audit, requirePermission, type Context } from "./access.ts";
import { mode, sendMail } from "./auth.ts";
export async function firstInvite(ctx: Context, input: unknown) {
  requirePermission(ctx, "organizations");
  const d = z
    .object({ organizationId: z.uuid(), email: z.email() })
    .parse(input);
  const o = await one(
    pool,
    `SELECT * FROM organizations WHERE id=$1 AND status='ACTIVE' AND type IN ('FACILITY','INSURER')`,
    [d.organizationId],
  );
  if (!o) throw new DomainError("RECORD_NOT_FOUND", 404);
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const i = await transaction(async (db) => {
    const i = await one(
      db,
      `INSERT INTO invitations(organization_id,email,roles,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval '48 hours',$5) RETURNING id`,
      [o.id, d.email.toLowerCase(), [o.type + "_ADMIN"], hash, ctx.userId],
    );
    await audit(db, ctx, "OrganizationAdministratorInvited", i.id, {
      organizationId: o.id,
    });
    return i;
  });
  const link =
    (process.env.WEB_ORIGIN || "http://localhost:3000") +
    "/accept-invitation?token=" +
    token;
  if (mode === "demo") return { ...i, delivery: "LOCAL_DEMO_ONLY", link };
  try {
    await sendMail(
      d.email,
      "Your LUX HealthPay organization invitation",
      `Accept your invitation: ${link}`,
    );
    return { ...i, delivery: "SENT" };
  } catch {
    return { ...i, delivery: "FAILED_OR_UNCONFIGURED" };
  }
}
export async function contractCreate(ctx: Context, input: unknown) {
  requirePermission(ctx, "organizations");
  const d = z
    .object({
      facilityId: z.uuid(),
      insurerId: z.uuid(),
      startsOn: z.iso.date(),
      endsOn: z.iso.date(),
      requiredDocuments: z.array(z.string().min(2).max(80)).max(15),
    })
    .parse(input);
  if (d.endsOn < d.startsOn)
    throw new DomainError("INVALID_EFFECTIVE_DATES", 422);
  return transaction(async (db) => {
    const orgs = (
      await db.query(
        `SELECT id,type FROM organizations WHERE id=ANY($1::uuid[]) AND status='ACTIVE'`,
        [[d.facilityId, d.insurerId]],
      )
    ).rows;
    if (
      !orgs.some((o) => o.id === d.facilityId && o.type === "FACILITY") ||
      !orgs.some((o) => o.id === d.insurerId && o.type === "INSURER")
    )
      throw new DomainError("INVALID_CONTRACT_PARTIES", 422);
    const c = await one(
      db,
      "INSERT INTO facility_insurer_contracts(facility_id,insurer_id,starts_on,ends_on,required_documents) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [d.facilityId, d.insurerId, d.startsOn, d.endsOn, d.requiredDocuments],
    );
    await audit(db, ctx, "ContractRecorded", c.id);
    return c;
  });
}
export async function createPatient(ctx: Context, input: unknown) {
  requirePermission(ctx, "clinical");
  if (ctx.orgType !== "FACILITY")
    throw new DomainError("PERMISSION_DENIED", 403);
  const d = z
    .object({
      name: z.string().min(2).max(120),
      birthYear: z.number().int().min(1900).max(new Date().getFullYear()),
      processingBasis: z.string().min(10).max(500),
    })
    .parse(input);
  return transaction(async (db) => {
    const duplicates = (
      await db.query(
        "SELECT id FROM patients WHERE facility_id=$1 AND lower(display_name)=lower($2) AND birth_year=$3",
        [ctx.orgId, d.name, d.birthYear],
      )
    ).rows;
    const p = await one(
      db,
      "INSERT INTO patients(facility_id,display_name,birth_year,processing_basis,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,display_name,birth_year",
      [ctx.orgId, d.name, d.birthYear, d.processingBasis, ctx.userId],
    );
    await audit(db, ctx, "PatientRecorded", p.id, {
      possibleDuplicates: duplicates.length,
    });
    return {
      ...p,
      possibleDuplicateIds: duplicates.map((p) => p.id),
      notice:
        "Name and birth year are not unique identity. Review possible duplicates; no automatic merge occurred.",
    };
  });
}
export async function coverageImport(ctx: Context, input: unknown) {
  requirePermission(ctx, "coverage");
  const row = z.object({
    patientId: z.uuid(),
    externalReference: z.string().min(2).max(120),
    policyReference: z.string().min(2).max(120),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date(),
    sourceUpdatedAt: z.iso.datetime(),
    benefits: z.object({
      description: z.string().max(1000),
      limitations: z.string().max(1000),
    }),
  });
  const d = z
    .object({
      confirm: z.boolean(),
      source: z.string().min(5).max(160),
      rows: z.array(z.unknown()).min(1).max(1000),
    })
    .parse(input);
  const valid: any[] = [],
    errors: any[] = [];
  const seen = new Set<string>();
  for (const [i, input] of d.rows.entries()) {
    const parsed = row.safeParse(input);
    if (!parsed.success) {
      errors.push({ row: i + 1, code: "INVALID_ROW" });
      continue;
    }
    const r = parsed.data;
    const allowed = await one(
      pool,
      `SELECT p.id FROM patients p JOIN facility_insurer_contracts c ON c.facility_id=p.facility_id WHERE p.id=$1 AND c.insurer_id=$2 AND c.status='ACTIVE' AND current_date BETWEEN c.starts_on AND c.ends_on`,
      [r.patientId, ctx.orgId],
    );
    const existing = await one(
      pool,
      "SELECT patient_id FROM insurer_patient_references WHERE insurer_id=$1 AND external_reference=$2",
      [ctx.orgId, r.externalReference],
    );
    if (
      !allowed ||
      r.effectiveTo < r.effectiveFrom ||
      new Date(r.sourceUpdatedAt) > new Date() ||
      seen.has(r.externalReference) ||
      (existing && existing.patient_id !== r.patientId)
    ) {
      errors.push({
        row: i + 1,
        code: "INVALID_RELATIONSHIP_REFERENCE_OR_DATE",
      });
      continue;
    }
    seen.add(r.externalReference);
    valid.push(r);
  }
  if (!d.confirm) return { status: "PREVIEW", validRows: valid.length, errors };
  if (errors.length)
    throw new DomainError(
      "IMPORT_ROW_ERRORS",
      422,
      "Resolve row errors before confirming the import.",
    );
  return transaction(async (db) => {
    for (const r of valid)
      await db.query(
        `INSERT INTO insurer_patient_references(patient_id,insurer_id,external_reference,policy_reference,status,effective_from,effective_to,source_updated_at,benefits) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(insurer_id,external_reference) DO UPDATE SET policy_reference=EXCLUDED.policy_reference,status=EXCLUDED.status,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,source_updated_at=EXCLUDED.source_updated_at,benefits=EXCLUDED.benefits WHERE insurer_patient_references.patient_id=EXCLUDED.patient_id`,
        [
          r.patientId,
          ctx.orgId,
          r.externalReference,
          r.policyReference,
          r.status,
          r.effectiveFrom,
          r.effectiveTo,
          r.sourceUpdatedAt,
          r.benefits,
        ],
      );
    await audit(db, ctx, "CoverageImported", undefined, {
      source: d.source,
      rows: valid.length,
      checksum: createHash("sha256")
        .update(JSON.stringify(d.rows))
        .digest("hex"),
    });
    return { status: "IMPORTED", rows: valid.length };
  });
}
export async function partnerSave(ctx: Context, input: unknown) {
  requirePermission(ctx, "cms");
  const d = z
    .object({
      name: z.string().min(2).max(160),
      status: z.enum(["PROPOSED", "CONFIRMED"]),
      permissionToDisplay: z.boolean(),
      logo: z
        .string()
        .regex(/^\/media\/[a-zA-Z0-9_.-]+$/)
        .nullable(),
      description: z.string().min(10).max(2000),
      published: z.boolean(),
    })
    .parse(input);
  if (
    d.published &&
    (!d.permissionToDisplay || !d.logo || d.status !== "CONFIRMED")
  )
    throw new DomainError("PARTNER_PUBLICATION_NOT_APPROVED", 422);
  if (
    d.logo &&
    !(await one(
      pool,
      "SELECT id FROM media_assets WHERE path=$1 AND approved=true",
      [d.logo],
    ))
  )
    throw new DomainError("APPROVED_MEDIA_REQUIRED", 422);
  return transaction(async (db) => {
    const r = await one(
      db,
      "INSERT INTO partner_entries(name,status,permission_to_display,logo,description,published) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        d.name,
        d.status,
        d.permissionToDisplay,
        d.logo,
        d.description,
        d.published,
      ],
    );
    await audit(db, ctx, "PartnerEntryRecorded", r.id);
    return r;
  });
}
export async function mediaSave(ctx: Context, input: unknown) {
  requirePermission(ctx, "cms");
  const d = z
    .object({
      key: z.string().regex(/^[a-z0-9-]+$/),
      path: z.string().regex(/^\/media\/[a-zA-Z0-9_.-]+$/),
      alt: z.string().min(5).max(240),
      provenance: z.string().min(10).max(2000),
      approved: z.boolean(),
      focalX: z.number().int().min(0).max(100),
      focalY: z.number().int().min(0).max(100),
    })
    .parse(input);
  return transaction(async (db) => {
    const r = await one(
      db,
      "INSERT INTO media_assets(key,path,alt,provenance,approved,focal_x,focal_y) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(key) DO UPDATE SET path=EXCLUDED.path,alt=EXCLUDED.alt,provenance=EXCLUDED.provenance,approved=EXCLUDED.approved,focal_x=EXCLUDED.focal_x,focal_y=EXCLUDED.focal_y RETURNING *",
      [d.key, d.path, d.alt, d.provenance, d.approved, d.focalX, d.focalY],
    );
    await audit(db, ctx, "MediaMetadataUpdated", r.id);
    return r;
  });
}

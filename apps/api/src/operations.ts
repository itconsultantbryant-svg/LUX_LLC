import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { pool, transaction, one } from "../../../packages/db/index.ts";
import {
  DomainError,
  enquirySchema,
  csvCell,
  roles,
} from "../../../packages/domain/index.ts";
import { requirePermission, audit, event, type Context } from "./access.ts";
import { auth, mode, sendMail } from "./auth.ts";
import { report } from "./reporting.ts";
import { teamContactsSchema } from "../../../packages/domain/team-contacts.ts";
export class OperationsService {
  async enquire(input: unknown, ip: string) {
    const d = enquirySchema.parse(input);
    const key = createHash("sha256")
      .update(ip + new Date().toISOString().slice(0, 13))
      .digest("hex");
    return transaction(async (db) => {
      const rate = await one(
        db,
        "INSERT INTO rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
        [key],
      );
      if (rate.count > 5) throw new DomainError("RATE_LIMITED", 429);
      const e = await one(
        db,
        "INSERT INTO enquiries(kind,organization,name,email,phone,location,message,consent) VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING id",
        [
          d.kind,
          d.organization,
          d.name,
          d.email,
          d.phone,
          d.location,
          d.message,
        ],
      );
      if (d.kind !== "GENERAL")
        await db.query(
          "INSERT INTO organization_requests(enquiry_id) VALUES($1)",
          [e.id],
        );
      return {
        id: e.id,
        status: "RECORDED",
        message:
          "Your enquiry has been recorded for review. Organization access requires approval. No email has been sent.",
      };
    });
  }
  async overview(ctx: Context) {
    const counts = (
      await pool.query(
        "SELECT state,count(*)::int count FROM claims WHERE facility_id=$1 OR insurer_id=$1 GROUP BY state",
        [ctx.orgId],
      )
    ).rows;
    const money = (
      await pool.query(
        "SELECT currency,sum(submitted_minor)::text submitted,sum(approved_minor)::text approved FROM claims WHERE facility_id=$1 OR insurer_id=$1 GROUP BY currency",
        [ctx.orgId],
      )
    ).rows;
    const settlements = (
      await pool.query(
        `SELECT currency,sum(base_minor) FILTER(WHERE state='SETTLED')::text settled,sum(base_minor) FILTER(WHERE state='UNKNOWN_PENDING_INVESTIGATION')::text unknown FROM payments WHERE facility_id=$1 OR insurer_id=$1 GROUP BY currency`,
        [ctx.orgId],
      )
    ).rows;
    const notifications = (
      await pool.query(
        "SELECT id,title,link,created_at,read_at FROM notifications WHERE organization_id=$1 AND (user_id IS NULL OR user_id=$2) ORDER BY created_at DESC LIMIT 20",
        [ctx.orgId, ctx.userId],
      )
    ).rows;
    return { counts, money, settlements, notifications, mode };
  }
  async directory(ctx: Context) {
    return (
      await pool.query(
        `SELECT o.id,o.name,o.type FROM facility_insurer_contracts c JOIN organizations o ON o.id=CASE WHEN c.facility_id=$1 THEN c.insurer_id ELSE c.facility_id END WHERE (c.facility_id=$1 OR c.insurer_id=$1) AND c.status='ACTIVE' AND current_date BETWEEN c.starts_on AND c.ends_on`,
        [ctx.orgId],
      )
    ).rows;
  }
  async admin(ctx: Context, section: string) {
    const map: Record<string, { permission: string; sql: string }> = {
      enquiries: {
        permission: "organizations",
        sql: "SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 100",
      },
      "organization-requests": {
        permission: "organizations",
        sql: "SELECT r.*,e.organization,e.kind,e.name,e.email FROM organization_requests r JOIN enquiries e ON e.id=r.enquiry_id ORDER BY r.created_at DESC",
      },
      organizations: {
        permission: "organizations",
        sql: "SELECT * FROM organizations ORDER BY name",
      },
      team: {
        permission: "cms",
        sql: "SELECT * FROM team_members ORDER BY sort_order",
      },
      content: {
        permission: "cms",
        sql: "SELECT * FROM public_pages ORDER BY slug,version DESC",
      },
      integrations: {
        permission: "operations",
        sql: "SELECT provider,mode,capabilities,enabled FROM integration_configurations",
      },
      jobs: {
        permission: "operations",
        sql: "SELECT id,type,status,attempts,last_error,created_at FROM outbox_events ORDER BY created_at DESC LIMIT 100",
      },
    };
    const entry = map[section];
    if (!entry) throw new DomainError("RECORD_NOT_FOUND", 404);
    requirePermission(ctx, entry.permission);
    return (await pool.query(entry.sql)).rows;
  }
  async approveOrganization(ctx: Context, id: string, input: unknown) {
    requirePermission(ctx, "organizations");
    const d = z.object({ reason: z.string().min(10).max(1000) }).parse(input);
    return transaction(async (db) => {
      const req = await one(
        db,
        "SELECT r.*,e.organization,e.kind FROM organization_requests r JOIN enquiries e ON e.id=r.enquiry_id WHERE r.id::text=$1 FOR UPDATE OF r",
        [id],
      );
      if (!req || req.status !== "PENDING")
        throw new DomainError("REQUEST_NOT_PENDING");
      const org = await one(
        db,
        `INSERT INTO organizations(name,type,status) VALUES($1,$2,'ACTIVE') RETURNING *`,
        [req.organization, req.kind],
      );
      await db.query(
        `UPDATE organization_requests SET status='APPROVED',reviewed_by=$2,reason=$3,organization_id=$4 WHERE id=$1`,
        [id, ctx.userId, d.reason, org.id],
      );
      await audit(db, ctx, "OrganizationApproved", org.id);
      return org;
    });
  }
  async teamUpdate(ctx: Context, id: string, input: unknown) {
    requirePermission(ctx, "cms");
    const d = z
      .object({
        name: z.string().min(2).max(160),
        role: z.string().min(2).max(160),
        bio: z.string().max(2000).nullable(),
        photo: z
          .string()
          .regex(/^\/media\/[a-zA-Z0-9_.-]+$/)
          .nullable(),
        alt: z.string().max(240).nullable(),
        published: z.boolean(),
        contacts: teamContactsSchema.default([]),
      })
      .parse(input);
    return transaction(async (db) => {
      const r = await one(
        db,
        "UPDATE team_members SET name=$2,role=$3,bio=$4,photo=$5,alt=$6,published=$7,contacts=$8,updated_at=now() WHERE id::text=$1 RETURNING *",
        [
          id,
          d.name,
          d.role,
          d.bio,
          d.photo,
          d.alt,
          d.published,
          JSON.stringify(d.contacts),
        ],
      );
      if (!r) throw new DomainError("RECORD_NOT_FOUND", 404);
      await audit(db, ctx, "TeamContentUpdated", id);
      return r;
    });
  }
  async pageSave(ctx: Context, input: unknown) {
    requirePermission(ctx, "cms");
    const d = z
      .object({
        slug: z.string().regex(/^[a-z0-9-]+$/),
        status: z.enum(["DRAFT", "PUBLISHED"]),
        content: z.object({
          title: z.string().min(2).max(200),
          intro: z.string().max(2000),
          sections: z
            .array(
              z.object({
                title: z.string().max(200),
                text: z.string().max(5000),
              }),
            )
            .max(30),
        }),
      })
      .parse(input);
    return transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        d.slug,
      ]);
      const v = await one(
        db,
        "SELECT COALESCE(max(version),0)+1 version FROM public_pages WHERE slug=$1",
        [d.slug],
      );
      const r = await one(
        db,
        "INSERT INTO public_pages(slug,version,status,content,edited_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [d.slug, v.version, d.status, d.content, ctx.userId],
      );
      await audit(db, ctx, "PublicContent" + d.status, r.id);
      return r;
    });
  }
  async invite(ctx: Context, input: unknown) {
    requirePermission(ctx, "users");
    const d = z
      .object({
        email: z.email(),
        roles: z
          .array(
            z.enum(
              Object.keys(roles) as [
                keyof typeof roles,
                ...(keyof typeof roles)[],
              ],
            ),
          )
          .min(1),
      })
      .parse(input);
    const prefix =
      ctx.orgType === "FACILITY"
        ? "FACILITY_"
        : ctx.orgType === "INSURER"
          ? "INSURER_"
          : "__BLOCKED__";
    if (d.roles.some((r) => !r.startsWith(prefix)))
      throw new DomainError("ROLE_GRANT_FORBIDDEN", 403);
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    const invitation = await transaction(async (db) => {
      const r = await one(
        db,
        `INSERT INTO invitations(organization_id,email,roles,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval '48 hours',$5) RETURNING id`,
        [ctx.orgId, d.email.toLowerCase(), d.roles, hash, ctx.userId],
      );
      await audit(db, ctx, "MembershipInvited", r.id);
      return r;
    });
    const link =
      (process.env.WEB_ORIGIN || "http://localhost:3000") +
      "/accept-invitation?token=" +
      token;
    if (mode === "demo")
      return { ...invitation, delivery: "LOCAL_DEMO_ONLY", link };
    try {
      await sendMail(
        d.email,
        "Invitation to LUX HealthPay",
        `Accept your invitation: ${link}`,
      );
      return { ...invitation, delivery: "SENT" };
    } catch {
      return { ...invitation, delivery: "FAILED_OR_UNCONFIGURED" };
    }
  }
  async accept(input: unknown) {
    const d = z
      .object({
        token: z.string().length(64),
        name: z.string().min(2).max(120),
        password: z.string().min(12).max(128),
      })
      .parse(input);
    const hash = createHash("sha256").update(d.token).digest("hex");
    const i = await one(
      pool,
      `SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now()`,
      [hash],
    );
    if (!i) throw new DomainError("INVITATION_UNAVAILABLE", 400);
    // Existing accounts sign in first; they cannot be taken over through an invitation.
    if (await one(pool, 'SELECT id FROM "user" WHERE email=$1', [i.email]))
      throw new DomainError("SIGN_IN_TO_ACCEPT_EXISTING_ACCOUNT", 409);
    const result = await auth.api.signUpEmail({
      body: { name: d.name, email: i.email, password: d.password },
    });
    await transaction(async (db) => {
      const locked = await one(
        db,
        `SELECT * FROM invitations WHERE id=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE`,
        [i.id],
      );
      if (!locked) throw new DomainError("INVITATION_UNAVAILABLE");
      await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
        result.user.id,
      ]);
      await db.query(
        "INSERT INTO memberships(user_id,organization_id,roles) VALUES($1,$2,$3)",
        [result.user.id, i.organization_id, i.roles],
      );
      await db.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
        i.id,
      ]);
    });
    return {
      status: "ACCEPTED",
      message: "Invitation accepted. Sign in to continue.",
    };
  }
  async reconciliation(ctx: Context) {
    requirePermission(ctx, "reconciliation");
    return (
      await pool.query(
        "SELECT * FROM reconciliation_items WHERE organization_id=$1 ORDER BY created_at DESC",
        [ctx.orgId],
      )
    ).rows;
  }
  async importReconciliation(ctx: Context, input: unknown) {
    requirePermission(ctx, "reconciliation");
    const d = z
      .object({
        confirm: z.boolean().default(false),
        rows: z
          .array(
            z.object({
              reference: z.string().min(1).max(120),
              amountMinor: z.string().regex(/^\d{1,12}$/),
              currency: z.enum(["USD", "LRD"]),
              destination: z.string().min(1).max(120),
            }),
          )
          .min(1)
          .max(1000),
      })
      .parse(input);
    const checksum = createHash("sha256")
      .update(JSON.stringify(d.rows))
      .digest("hex");
    const seen = new Set<string>();
    const errors: any[] = [];
    const matches: any[] = [];
    for (const [index, row] of d.rows.entries()) {
      if (seen.has(row.reference)) {
        errors.push({ row: index + 1, category: "DUPLICATE_REFERENCE" });
        continue;
      }
      seen.add(row.reference);
      const p = await one(
        pool,
        "SELECT * FROM payments WHERE provider_reference=$1 AND (facility_id=$2 OR insurer_id=$2)",
        [row.reference, ctx.orgId],
      );
      let category = !p
        ? "UNMATCHED_INCOMING_RECORD"
        : p.currency !== row.currency
          ? "CURRENCY_MISMATCH"
          : BigInt(p.base_minor) !== BigInt(row.amountMinor)
            ? "WRONG_AMOUNT"
            : p.destination_snapshot.reference !== row.destination
              ? "WRONG_DESTINATION"
              : null;
      if (category) errors.push({ row: index + 1, category, paymentId: p?.id });
      else matches.push({ row: index + 1, paymentId: p.id, status: p.state });
    }
    if (!d.confirm)
      return {
        checksum,
        errors,
        matches,
        status: "PREVIEW_ONLY",
        notice:
          "Import matches do not establish settlement. Verified provider evidence is still required.",
      };
    return transaction(async (db) => {
      if (
        await one(
          db,
          "SELECT id FROM reconciliation_runs WHERE organization_id=$1 AND checksum=$2",
          [ctx.orgId, checksum],
        )
      )
        throw new DomainError("DUPLICATE_IMPORT");
      const run = await one(
        db,
        `INSERT INTO reconciliation_runs(organization_id,checksum,source,status,rows,created_by) VALUES($1,$2,'MANUAL_FILE','IMPORTED',$3,$4) RETURNING id`,
        [ctx.orgId, checksum, JSON.stringify(d.rows), ctx.userId],
      );
      for (const e of errors)
        await db.query(
          "INSERT INTO reconciliation_items(organization_id,run_id,payment_id,category,notes) VALUES($1,$2,$3,$4,$5)",
          [
            ctx.orgId,
            run.id,
            e.paymentId || null,
            e.category,
            "Import row " + e.row,
          ],
        );
      await audit(db, ctx, "ReconciliationImported", run.id);
      return { ...run, errors, matches, status: "IMPORTED" };
    });
  }
  async resolve(ctx: Context, id: string, input: unknown) {
    requirePermission(ctx, "reconciliation");
    const d = z
      .object({
        notes: z.string().min(10).max(2000),
        evidence: z.string().min(10).max(2000),
      })
      .parse(input);
    return transaction(async (db) => {
      const item = await one(
        db,
        "SELECT * FROM reconciliation_items WHERE id::text=$1 AND organization_id=$2 FOR UPDATE",
        [id, ctx.orgId],
      );
      if (!item) throw new DomainError("RECORD_NOT_FOUND", 404);
      await db.query(
        "INSERT INTO reconciliation_resolutions(item_id,actor_id,notes,evidence) VALUES($1,$2,$3,$4)",
        [id, ctx.userId, d.notes, d.evidence],
      );
      await db.query(
        `UPDATE reconciliation_items SET status='RESOLVED',notes=$2,evidence=$3,owner_id=$4 WHERE id=$1`,
        [id, d.notes, d.evidence, ctx.userId],
      );
      await audit(db, ctx, "ReconciliationExceptionResolved", id);
      return { id, status: "RESOLVED" };
    });
  }
  async report(
    ctx: Context,
    type: string,
    exportCsv = false,
    filters: unknown = {},
  ) {
    return report(ctx, type, exportCsv, filters);
  }
  async destination(ctx: Context, input: unknown) {
    requirePermission(ctx, "destination");
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    const d = z
      .object({
        reference: z.string().min(6).max(100),
        reason: z.string().min(10).max(1000),
      })
      .parse(input);
    return transaction(async (db) => {
      const r = await one(
        db,
        "INSERT INTO destination_changes(organization_id,proposed_reference,maker_id,reason) VALUES($1,$2,$3,$4) RETURNING *",
        [ctx.orgId, d.reference, ctx.userId, d.reason],
      );
      await audit(db, ctx, "DestinationChangeRequested", r.id);
      return r;
    });
  }
  async approveDestination(ctx: Context, id: string, input: unknown) {
    requirePermission(ctx, "destination");
    if (!ctx.fresh) throw new DomainError("REAUTHENTICATION_REQUIRED", 403);
    const d = z
      .object({ verificationEvidence: z.string().min(20).max(1000) })
      .parse(input);
    return transaction(async (db) => {
      const c = await one(
        db,
        `SELECT * FROM destination_changes WHERE id::text=$1 AND organization_id=$2 AND status='PENDING' FOR UPDATE`,
        [id, ctx.orgId],
      );
      if (!c) throw new DomainError("RECORD_NOT_FOUND", 404);
      if (c.maker_id === ctx.userId)
        throw new DomainError("SEPARATE_CHECKER_REQUIRED", 403);
      if (mode !== "demo")
        throw new DomainError(
          "DESTINATION_VERIFICATION_PROVIDER_REQUIRED",
          503,
        );
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        ctx.orgId,
      ]);
      const v = await one(
        db,
        "SELECT COALESCE(max(version),0)+1 n FROM wallet_destinations WHERE organization_id=$1",
        [ctx.orgId],
      );
      await db.query(
        "INSERT INTO wallet_destinations(organization_id,reference,verified,version) VALUES($1,$2,true,$3)",
        [ctx.orgId, c.proposed_reference, v.n],
      );
      await db.query(
        `UPDATE destination_changes SET checker_id=$2,status='APPROVED' WHERE id=$1`,
        [id, ctx.userId],
      );
      await audit(db, ctx, "DestinationChangeApproved", id, {
        evidence: d.verificationEvidence,
      });
      return { status: "APPROVED", demo: true };
    });
  }
}

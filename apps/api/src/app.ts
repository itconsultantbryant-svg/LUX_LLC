import "dotenv/config";
import "reflect-metadata";
import { All, Controller, Module, Req, Res } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { auth, mode } from "./auth.ts";
import { context, requirePermission, audit } from "./access.ts";
import { pool, one } from "../../../packages/db/index.ts";
import { DomainError, permissions } from "../../../packages/domain/index.ts";
import { ClaimsService } from "./claims.ts";
import { PaymentsService } from "./payments.ts";
import { OperationsService } from "./operations.ts";
import { upload, completeUpload, download } from "./storage.ts";
import { openapi } from "./openapi.ts";
import { scopedRecords, saveTariff, resolveAppeal } from "./catalogue.ts";
import { getDraft, saveDraft } from "./drafts.ts";
import { acceptExistingInvitation } from "./existing-invitation.ts";
import { reportTypes } from "./reporting.ts";
import { resolveFinding, assignReview } from "./review.ts";
import { withdrawClaim, cancelPayment } from "./cancellation.ts";
import { issueDemoConfirmation } from "./demo-confirmation.ts";
import {
  firstInvite,
  contractCreate,
  createPatient,
  coverageImport,
  partnerSave,
  mediaSave,
} from "./onboarding.ts";
const claims = new ClaimsService(),
  payments = new PaymentsService(),
  ops = new OperationsService();
export interface ApiRequest {
  path: string;
  method: string;
  headers: Request["headers"];
  header: (name: string) => string | undefined;
  ip?: string;
  query: Record<string, any>;
  body: any;
}
export interface ApiResponse {
  setHeader: (name: string, value: string) => unknown;
  status: (code: number) => ApiResponse;
  json: (body: any) => unknown;
  type: (contentType: string) => ApiResponse;
  attachment: (name: string) => ApiResponse;
  send: (body: any) => unknown;
}
@Controller("api/v1")
export class ApiController {
  @All("{*path}")
  async handle(@Req() req: ApiRequest, @Res() res: ApiResponse) {
    const correlationId = crypto.randomUUID();
    res.setHeader("X-Correlation-ID", correlationId);
    res.setHeader("Cache-Control", "no-store");
    try {
      const path = req.path.replace(/^\/api\/v1/, "").replace(/\/$/, "") || "/";
      const method = req.method;
      if (path === "/health") {
        await pool.query("SELECT 1");
        return res.json({ status: "ok", mode, database: "connected" });
      }
      if (path === "/openapi.json") return res.json(openapi);
      if (path === "/public/team" && method === "GET")
        return res.json(
          (
            await pool.query(
              "SELECT id,slug,name,role,bio,photo,alt,contacts FROM team_members WHERE published=true ORDER BY sort_order",
            )
          ).rows,
        );
      if (path === "/public/partners" && method === "GET")
        return res.json(
          (
            await pool.query(
              `SELECT name,description,logo,status FROM partner_entries WHERE published=true AND permission_to_display=true AND status='CONFIRMED'`,
            )
          ).rows,
        );
      if (path.startsWith("/public/pages/") && method === "GET")
        return res.json(
          (await one(
            pool,
            `SELECT content,version FROM public_pages WHERE slug=$1 AND status='PUBLISHED' ORDER BY version DESC LIMIT 1`,
            [path.split("/").pop()],
          )) || null,
        );
      if (
        ["/public/enquiries", "/public/organization-requests"].includes(path) &&
        method === "POST"
      )
        return res
          .status(201)
          .json(await ops.enquire(req.body, req.ip || "unknown"));
      if (path === "/invitations/accept" && method === "POST")
        return res.json(await ops.accept(req.body));
      if (path === "/invitations/accept-existing" && method === "POST") {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });
        if (!session) throw new DomainError("AUTHENTICATION_REQUIRED", 401);
        return res.json(
          await acceptExistingInvitation(session.user.id, req.body),
        );
      }
      if (path === "/integrations/orange/events" && method === "POST")
        return res.json(await payments.verifiedCallback(req.body, req.headers));
      if (path === "/me") {
        const s = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });
        if (!s) throw new DomainError("AUTHENTICATION_REQUIRED", 401);
        const user = await one(
          pool,
          'SELECT suspended FROM "user" WHERE id=$1',
          [s.user.id],
        );
        if (user?.suspended) throw new DomainError("ACCOUNT_UNAVAILABLE", 403);
        const memberships = (
          await pool.query(
            `SELECT o.id,o.name,o.type,m.roles FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.status='ACTIVE' AND o.status='ACTIVE'`,
            [s.user.id],
          )
        ).rows.map((m) => ({ ...m, permissions: permissions(m.roles) }));
        return res.json({
          user: { id: s.user.id, name: s.user.name, email: s.user.email },
          memberships,
          mode,
        });
      }
      const ctx = await context(req);
      const version = req.header("If-Match"),
        key = req.header("Idempotency-Key");
      const body = req.body;
      let result: any;
      if (path === "/overview" && method === "GET")
        result = await ops.overview(ctx);
      else if (path === "/claim-drafts" && method === "GET")
        result = await getDraft(ctx);
      else if (path === "/claim-drafts" && method === "PUT")
        result = await saveDraft(ctx, body);
      else if (path === "/contracts" && method === "GET")
        result = await ops.directory(ctx);
      else if (
        [
          "/encounters",
          "/coverage",
          "/decisions",
          "/flagged",
          "/destination-changes",
        ].includes(path) &&
        method === "GET"
      )
        result = await scopedRecords(ctx, path.slice(1));
      else if (path === "/coverage/tariffs" && method === "POST")
        result = await saveTariff(ctx, body);
      else if (/^\/appeals\/[^/]+\/resolve$/.test(path) && method === "POST")
        result = await resolveAppeal(ctx, path.split("/")[2], body);
      else if (path === "/patients" && method === "GET")
        result = await claims.patients(ctx);
      else if (path === "/patients" && method === "POST")
        result = await createPatient(ctx, body);
      else if (path === "/coverage/imports" && method === "POST")
        result = await coverageImport(ctx, body);
      else if (path === "/admin/organization-invitations" && method === "POST")
        result = await firstInvite(ctx, body);
      else if (path === "/admin/contracts" && method === "POST")
        result = await contractCreate(ctx, body);
      else if (path === "/admin/partners" && method === "POST")
        result = await partnerSave(ctx, body);
      else if (path === "/admin/media" && method === "POST")
        result = await mediaSave(ctx, body);
      else if (path === "/eligibility-checks" && method === "POST")
        result = await claims.eligibility(ctx, body);
      else if (path === "/encounters" && method === "POST")
        result = await claims.encounter(ctx, body);
      else if (path === "/claims" && method === "GET")
        result = await claims.list(ctx, req.query);
      else if (path === "/claims" && method === "POST")
        result = await claims.create(ctx, body);
      else if (/^\/claims\/[^/]+$/.test(path) && method === "GET")
        result = await claims.detail(ctx, path.split("/")[2]);
      else if (/^\/claims\/[^/]+\/submit$/.test(path) && method === "POST")
        result = await claims.submit(ctx, path.split("/")[2], version, key);
      else if (/^\/claims\/[^/]+\/withdraw$/.test(path) && method === "POST")
        result = await withdrawClaim(
          ctx,
          path.split("/")[2],
          body,
          version,
          key,
        );
      else if (/^\/payments\/[^/]+\/cancel$/.test(path) && method === "POST")
        result = await cancelPayment(
          ctx,
          path.split("/")[2],
          body,
          version,
          key,
        );
      else if (/^\/claims\/[^/]+\/corrections$/.test(path) && method === "POST")
        result = await claims.correct(ctx, path.split("/")[2], version, body);
      else if (/^\/claims\/[^/]+\/decisions$/.test(path) && method === "POST")
        result = await claims.decide(
          ctx,
          path.split("/")[2],
          body,
          version,
          key,
        );
      else if (
        /^\/findings\/[^/]+\/resolutions$/.test(path) &&
        method === "POST"
      )
        result = await resolveFinding(ctx, path.split("/")[2], body);
      else if (/^\/claims\/[^/]+\/assignments$/.test(path) && method === "POST")
        result = await assignReview(ctx, path.split("/")[2], body);
      else if (/^\/claims\/[^/]+\/appeals$/.test(path) && method === "POST")
        result = await claims.appeal(ctx, path.split("/")[2], body);
      else if (
        /^\/claims\/[^/]+\/payment-authorizations$/.test(path) &&
        method === "POST"
      )
        result = await payments.authorize(
          ctx,
          path.split("/")[2],
          body,
          key,
          version,
        );
      else if (/^\/claims\/[^/]+\/attachments$/.test(path) && method === "POST")
        result = await upload(ctx, path.split("/")[2], body);
      else if (
        /^\/attachments\/[^/]+\/complete$/.test(path) &&
        method === "POST"
      )
        result = await completeUpload(ctx, path.split("/")[2]);
      else if (
        /^\/attachments\/[^/]+\/download$/.test(path) &&
        method === "POST"
      )
        result = await download(ctx, path.split("/")[2]);
      else if (path === "/payments" && method === "GET")
        result = await payments.list(ctx);
      else if (/^\/payments\/[^/]+\/approve$/.test(path) && method === "POST")
        result = await payments.check(ctx, path.split("/")[2], key, version);
      else if (/^\/payments\/[^/]+\/execute$/.test(path) && method === "POST")
        result = await payments.execute(
          ctx,
          path.split("/")[2],
          key,
          version,
          body,
        );
      else if (
        /^\/payments\/[^/]+\/demo-confirmation$/.test(path) &&
        method === "POST"
      )
        result = await issueDemoConfirmation(ctx, path.split("/")[2]);
      else if (
        /^\/payments\/[^/]+\/status-check$/.test(path) &&
        method === "POST"
      )
        result = await payments.status(ctx, path.split("/")[2]);
      else if (
        /^\/payments\/[^/]+\/manual-verification$/.test(path) &&
        method === "POST"
      )
        result = await payments.manualVerify(ctx, path.split("/")[2], body);
      else if (path === "/reconciliation/exceptions" && method === "GET")
        result = await ops.reconciliation(ctx);
      else if (path === "/reconciliation/imports" && method === "POST")
        result = await ops.importReconciliation(ctx, body);
      else if (/^\/exceptions\/[^/]+\/resolve$/.test(path) && method === "POST")
        result = await ops.resolve(ctx, path.split("/")[2], body);
      else if (path.startsWith("/reports/") && method === "GET")
        result = await ops.report(ctx, path.split("/")[2], false, req.query);
      else if (path === "/exports" && method === "POST")
        return res
          .type("text/csv")
          .attachment("lux-statement.csv")
          .send(
            await ops.report(
              ctx,
              z.object({ type: reportTypes }).parse(body).type,
              true,
              body.filters || {},
            ),
          );
      else if (path === "/statements/pdf" && method === "GET") {
        const report = await ops.report(ctx, "statement", false, req.query);
        res.type("application/pdf").attachment("lux-statement.pdf");
        const doc = await PDFDocument.create(),
          font = await doc.embedFont(StandardFonts.Helvetica);
        let page = doc.addPage(),
          y = 790;
        const lines = [
          "LUX HealthPay - Claims statement",
          `Generated ${new Date().toISOString()} | ${mode.toUpperCase()}`,
          typeof report === "object" ? report.basis : "",
          ...(typeof report === "object"
            ? report.rows.map((row) =>
                Object.entries(row)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | "),
              )
            : []),
          "Approved amounts are not proof of settlement.",
        ];
        for (const text of lines) {
          let line = "";
          for (const word of text.split(" ")) {
            if (font.widthOfTextAtSize(line + word, 10) > 490) {
              if (y < 65) {
                page = doc.addPage();
                y = 790;
              }
              page.drawText(line, {
                x: 50,
                y,
                size: 10,
                font,
                color: rgb(0, 0, 0),
              });
              y -= 16;
              line = "";
            }
            line += word + " ";
          }
          if (y < 65) {
            page = doc.addPage();
            y = 790;
          }
          page.drawText(line, { x: 50, y, size: 10, font });
          y -= 25;
        }
        return res.send(Buffer.from(await doc.save()));
      } else if (path.startsWith("/admin/") && method === "GET")
        result = await ops.admin(ctx, path.split("/")[2]);
      else if (
        /^\/admin\/organization-requests\/[^/]+\/approve$/.test(path) &&
        method === "POST"
      )
        result = await ops.approveOrganization(ctx, path.split("/")[3], body);
      else if (/^\/admin\/team\/[^/]+$/.test(path) && method === "PATCH")
        result = await ops.teamUpdate(ctx, path.split("/")[3], body);
      else if (path === "/admin/content" && method === "POST")
        result = await ops.pageSave(ctx, body);
      else if (path === "/invitations" && method === "POST")
        result = await ops.invite(ctx, body);
      else if (path === "/destination-changes" && method === "POST")
        result = await ops.destination(ctx, body);
      else if (
        /^\/destination-changes\/[^/]+\/approve$/.test(path) &&
        method === "POST"
      )
        result = await ops.approveDestination(ctx, path.split("/")[2], body);
      else if (path === "/audit" && method === "GET") {
        requirePermission(ctx, "audit");
        result = (
          await pool.query(
            "SELECT action,resource_id,created_at,actor_id FROM audit_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",
            [ctx.orgId],
          )
        ).rows;
      } else if (path === "/users" && method === "GET") {
        requirePermission(ctx, "users");
        result = (
          await pool.query(
            'SELECT m.id,u.name,u.email,m.roles,m.status FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.organization_id=$1',
            [ctx.orgId],
          )
        ).rows;
      } else if (/^\/users\/[^/]+\/revoke$/.test(path) && method === "POST") {
        requirePermission(ctx, "users");
        result = await one(
          pool,
          `UPDATE memberships SET status='REVOKED' WHERE id::text=$1 AND organization_id=$2 AND user_id<>$3 RETURNING id,status`,
          [path.split("/")[2], ctx.orgId, ctx.userId],
        );
        await audit(pool, ctx, "MembershipRevoked", path.split("/")[2]);
      } else if (path === "/support" && method === "GET") {
        requirePermission(ctx, "support");
        result = (
          await pool.query(
            "SELECT * FROM support_tickets WHERE organization_id=$1 ORDER BY created_at DESC",
            [ctx.orgId],
          )
        ).rows;
      } else if (path === "/support" && method === "POST") {
        const d = z
          .object({
            subject: z.string().min(5).max(160),
            message: z.string().min(10).max(2000),
          })
          .parse(body);
        result = await one(
          pool,
          "INSERT INTO support_tickets(organization_id,subject,message,created_by) VALUES($1,$2,$3,$4) RETURNING id,status",
          [ctx.orgId, d.subject, d.message, ctx.userId],
        );
      } else throw new DomainError("ROUTE_NOT_FOUND", 404);
      return res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(422).json({
          code: "VALIDATION_ERROR",
          message: "Please check the supplied fields.",
          fieldErrors: error.flatten().fieldErrors,
          correlationId,
        });
      if (error instanceof DomainError)
        return res.status(error.status).json({
          code: error.code,
          message: error.message,
          fieldErrors: {},
          correlationId,
        });
      console.error(
        JSON.stringify({
          event: "request_failed",
          correlationId,
          errorType: error instanceof Error ? error.name : "Unknown",
        }),
      );
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        message:
          "The operation could not be completed. Retry or contact support with the correlation ID.",
        fieldErrors: {},
        correlationId,
      });
    }
  }
}
@Module({ controllers: [ApiController] })
class AppModule {}
export function originAllowed(
  method: string,
  origin: string | undefined | null,
) {
  return (
    ["GET", "HEAD", "OPTIONS"].includes(method) ||
    !origin ||
    origin === (process.env.WEB_ORIGIN || "http://localhost:3000")
  );
}
export function blockedAuthPath(path: string) {
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return true;
  }
  return ["sign-up", "delete-user", "change-email"].some((p) =>
    decoded.includes(p),
  );
}
export async function buildApplication() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ["error", "warn"],
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req: Request, res: Response, next: () => void) => {
    const origin = req.header("origin");
    if (!originAllowed(req.method, origin))
      return res
        .status(403)
        .json({ code: "ORIGIN_REJECTED", message: "Origin not permitted" });
    next();
  });
  app.use("/api/auth", (req: Request, res: Response) => {
    if (blockedAuthPath(req.url))
      return res.status(403).json({
        code: "INVITATION_REQUIRED",
        message: "Account creation is invitation-only.",
      });
    return toNodeHandler(auth)(req, res);
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(
    (
      error: any,
      _req: Request,
      res: Response,
      next: (error?: unknown) => void,
    ) => {
      if (error?.type === "entity.too.large" || error instanceof SyntaxError)
        return res
          .status(error?.type === "entity.too.large" ? 413 : 400)
          .json({
            code: "INVALID_REQUEST_BODY",
            message: "Use a valid JSON body within the 1 MB limit.",
            correlationId: crypto.randomUUID(),
            fieldErrors: {},
          });
      next(error);
    },
  );
  return app;
}

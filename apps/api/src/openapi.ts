import { z } from "zod";
import {
  enquirySchema,
  claimSchema,
  decisionSchema,
  minor,
} from "../../../packages/domain/index.ts";
const requestSchemas: Record<string, z.ZodType> = {
  "/public/enquiries": enquirySchema,
  "/public/organization-requests": enquirySchema,
  "/claims": claimSchema,
  "/claims/{id}/decisions": decisionSchema,
  "/claims/{id}/payment-authorizations": z.object({
    amountMinor: minor,
    reason: z.string().min(5).max(1000),
  }),
  "/eligibility-checks": z.object({ patientId: z.uuid(), insurerId: z.uuid() }),
  "/claims/{id}/appeals": z.object({ reason: z.string().min(10).max(2000) }),
  "/invitations/accept": z.object({
    token: z.string().length(64),
    name: z.string().min(2).max(120),
    password: z.string().min(12).max(128),
  }),
  "/exports": z.object({ type: z.enum(["claims", "fees"]) }),
  "/support": z.object({
    subject: z.string().min(5).max(160),
    message: z.string().min(10).max(2000),
  }),
};
const commands = [
  [
    "post",
    "/claims/{id}/withdraw",
    "claims",
    "Withdraw only before a conflicting decision or payment; preserve evidence",
  ],
  [
    "post",
    "/payments/{id}/cancel",
    "payments.authorize",
    "Cancel undispatched work only; release reservation transactionally",
  ],
  [
    "post",
    "/claims/{id}/assignments",
    "review",
    "Assign an active insurer reviewer",
  ],
  [
    "post",
    "/findings/{id}/resolutions",
    "review",
    "Record evidence-based finding resolution and audit reason",
  ],
  [
    "get",
    "/claim-drafts",
    "claims",
    "Actor-scoped autosaved preparation progress",
  ],
  [
    "put",
    "/claim-drafts",
    "claims",
    "Persist preparation; never submits a claim",
  ],
  [
    "post",
    "/coverage/imports",
    "coverage",
    "Preview authorized insurer import; effective dates and provenance required",
  ],
  [
    "post",
    "/admin/organization-invitations",
    "organizations",
    "Invite initial organization administrator after explicit activation",
  ],
  [
    "post",
    "/admin/contracts",
    "organizations",
    "Register approved dated facility–insurer contract",
  ],
  [
    "post",
    "/admin/media",
    "cms",
    "Record approved asset provenance, alt text and focal metadata",
  ],
  [
    "post",
    "/admin/partners",
    "cms",
    "Publication requires confirmed status, display permission and approved media",
  ],
  [
    "post",
    "/invitations/accept-existing",
    "Session",
    "Accept unexpired invitation only for matching verified signed-in email",
  ],
  ["get", "/me", "Session", "Current user and active memberships"],
  ["get", "/overview", "Membership", "Scoped counters grouped by currency"],
  [
    "post",
    "/public/enquiries",
    "Public",
    "Store enquiry; never activates a tenant",
  ],
  [
    "post",
    "/public/organization-requests",
    "Public",
    "Request approval-based onboarding",
  ],
  ["get", "/patients", "eligibility", "Facility patient directory"],
  ["get", "/contracts", "Membership", "Active permitted contract counterparts"],
  [
    "post",
    "/eligibility-checks",
    "eligibility",
    "Snapshot authorized insurer data; stale is not eligible",
  ],
  [
    "post",
    "/encounters",
    "clinical",
    "Record encounter and immutable initial version",
  ],
  [
    "post",
    "/claims",
    "claims",
    "Create draft with server-computed minor-unit totals",
  ],
  [
    "get",
    "/claims",
    "claims or payments.read",
    "Cursor-paginated scoped claim summaries",
  ],
  [
    "get",
    "/claims/{id}",
    "claims or payments.read",
    "Clinical fields only with clinical permission",
  ],
  [
    "post",
    "/claims/{id}/submit",
    "claims",
    "DRAFT → SUBMITTED; immutable submitted snapshot",
  ],
  [
    "post",
    "/claims/{id}/corrections",
    "claims",
    "NEEDS_INFORMATION → DRAFT; previous submission immutable",
  ],
  [
    "post",
    "/claims/{id}/decisions",
    "review",
    "Human insurer decision; AWAITING_REVIEW only",
  ],
  [
    "post",
    "/claims/{id}/appeals",
    "claims",
    "Separate appeal; never overwrites decision",
  ],
  [
    "post",
    "/claims/{id}/payment-authorizations",
    "payments.authorize",
    "Lock claim and reserve payable remainder; separate checker required",
  ],
  ["get", "/payments", "payments.read", "Scoped payment history"],
  [
    "post",
    "/payments/{id}/approve",
    "payments.authorize",
    "Separate checker; fresh session required",
  ],
  [
    "post",
    "/payments/{id}/execute",
    "payments.execute",
    "AUTHORIZED → PROCESSING with durable outbox",
  ],
  [
    "post",
    "/payments/{id}/status-check",
    "payments.execute",
    "Query authoritative status; never blindly retry",
  ],
  [
    "post",
    "/payments/{id}/manual-verification",
    "reconciliation",
    "Approved manual procedure and independent verification required",
  ],
  [
    "post",
    "/integrations/orange/events",
    "Verified provider",
    "Disabled until contracted signature verifier exists",
  ],
  [
    "post",
    "/claims/{id}/attachments",
    "claims",
    "Quarantine signed upload preparation",
  ],
  [
    "post",
    "/attachments/{id}/complete",
    "claims",
    "Queue content/size/malware checks",
  ],
  [
    "post",
    "/attachments/{id}/download",
    "clinical",
    "Short-lived private signed access; CLEAN only",
  ],
  [
    "get",
    "/reconciliation/exceptions",
    "reconciliation",
    "Scoped exception queue",
  ],
  [
    "post",
    "/reconciliation/imports",
    "reconciliation",
    "Staged preview then checksummed import; not settlement evidence",
  ],
  [
    "post",
    "/exceptions/{id}/resolve",
    "reconciliation",
    "Append resolution evidence; no payment mutation",
  ],
  [
    "get",
    "/reports/{type}",
    "reports or fees",
    "Currency-separated scoped report",
  ],
  ["post", "/exports", "reports or fees", "Audited formula-safe CSV export"],
  ["get", "/statements/pdf", "reports", "Statement from scoped actual records"],
  ["post", "/invitations", "users", "Role-constrained invitation"],
  [
    "post",
    "/invitations/accept",
    "Invitation token",
    "Accept unexpired one-use invitation",
  ],
  ["get", "/users", "users", "Organization members"],
  ["post", "/users/{id}/revoke", "users", "Revoke membership immediately"],
  [
    "post",
    "/destination-changes",
    "destination",
    "Fresh-session maker request",
  ],
  [
    "post",
    "/destination-changes/{id}/approve",
    "destination",
    "Independent checker and verified evidence",
  ],
  [
    "get",
    "/admin/{section}",
    "organizations, cms, or operations",
    "Enquiries, onboarding, content, team, organizations, integration health and durable jobs",
  ],
  [
    "post",
    "/admin/organization-requests/{id}/approve",
    "organizations",
    "Explicit authorized activation",
  ],
  ["patch", "/admin/team/{id}", "cms", "Edit approved team content"],
  [
    "post",
    "/admin/content",
    "cms",
    "Versioned structured draft/publish; no executable HTML",
  ],
  ["get", "/audit", "audit", "Scoped immutable audit events"],
  [
    "post",
    "/support",
    "Membership",
    "Record support ticket without clinical content",
  ],
] as const;
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "LUX HealthPay API",
    version: "1.0.0",
    description:
      "Money is a decimal string of integer minor units; USD and LRD configured at exponent 2 in the pilot. Demo is not a live Orange integration. Better Auth endpoints are under /api/auth; see its maintained API documentation.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      session: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["code", "message", "correlationId"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          fieldErrors: { type: "object" },
          correlationId: { type: "string" },
        },
      },
      Money: {
        type: "object",
        properties: {
          currency: { enum: ["USD", "LRD"] },
          amountMinor: { type: "string", pattern: "^[0-9]+$" },
        },
      },
    },
  },
  paths: Object.fromEntries(
    commands
      .map(([method, path, permission, description]) => [path, {}])
      .map(([p]) => [
        p,
        Object.fromEntries(
          commands
            .filter((c) => c[1] === p)
            .map(([method, path, permission, description]) => [
              method,
              {
                summary: description,
                description: `Permission: ${permission}. Organization context is checked against the session membership. Every state mutation is checked server-side.`,
                security: permission === "Public" ? [] : [{ session: [] }],
                ...(method !== "get" && requestSchemas[path]
                  ? {
                      requestBody: {
                        required: true,
                        content: {
                          "application/json": {
                            schema: z.toJSONSchema(requestSchemas[path]),
                          },
                        },
                      },
                    }
                  : {}),
                parameters: [
                  ...(path.includes("{id}")
                    ? [
                        {
                          name: "id",
                          in: "path",
                          required: true,
                          schema: { type: "string", format: "uuid" },
                        },
                      ]
                    : []),
                  ...(![
                    "Public",
                    "Session",
                    "Invitation token",
                    "Verified provider",
                  ].includes(permission)
                    ? [
                        {
                          name: "X-Organization-ID",
                          in: "header",
                          required: true,
                          schema: { type: "string", format: "uuid" },
                        },
                      ]
                    : []),
                  ...(method !== "get" && permission !== "Public"
                    ? [
                        {
                          name: "Idempotency-Key",
                          in: "header",
                          description:
                            "Required for claim submission/decision and payment authorization/approval/execution. Reuse with different payload returns 409.",
                          schema: { type: "string" },
                        },
                        {
                          name: "If-Match",
                          in: "header",
                          description:
                            "Required on optimistic-concurrency claim and payment mutations; current integer version.",
                          schema: { type: "string" },
                        },
                      ]
                    : []),
                ],
                responses: {
                  "200": { description: "Successful authorized response" },
                  "401": { description: "Session required" },
                  "403": {
                    description:
                      "Permission, MFA or fresh-session check failed",
                  },
                  "404": { description: "Not found or not scoped" },
                  "409": {
                    description: "State, reservation or idempotency conflict",
                  },
                  "412": { description: "Version mismatch" },
                  "422": { description: "Validation error" },
                  "428": { description: "Version precondition required" },
                  "503": {
                    description:
                      "Integration/configuration unavailable; never simulated live success",
                  },
                },
              },
            ]),
        ),
      ]),
  ),
};

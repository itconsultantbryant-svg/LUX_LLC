import { randomUUID, createHash } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth, mode } from "./auth.ts";
import { pool, one, type DB } from "../../../packages/db/index.ts";
import {
  DomainError,
  permissions,
  canSeeClaim,
} from "../../../packages/domain/index.ts";
export interface Context {
  userId: string;
  orgId: string;
  orgType: string;
  permissions: string[];
  roles: string[];
  correlationId: string;
  fresh: boolean;
}
export async function context(req: Pick<Request, "headers">): Promise<Context> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) throw new DomainError("AUTHENTICATION_REQUIRED", 401);
  const user = await one(
    pool,
    'SELECT suspended,"emailVerified","twoFactorEnabled" FROM "user" WHERE id=$1',
    [session.user.id],
  );
  if (!user || user.suspended || !user.emailVerified)
    throw new DomainError("ACCOUNT_UNAVAILABLE", 403);
  const orgId = String(req.headers["x-organization-id"] || "");
  const membership = await one(
    pool,
    `SELECT m.*,o.type FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.organization_id::text=$2 AND m.status='ACTIVE' AND o.status='ACTIVE'`,
    [session.user.id, orgId],
  );
  if (!membership) throw new DomainError("ORGANIZATION_ACCESS_DENIED", 403);
  const perms = permissions(membership.roles);
  const privileged = perms.some((p) =>
    [
      "organizations",
      "cms",
      "payments.authorize",
      "payments.execute",
      "users",
      "destination",
    ].includes(p),
  );
  if (mode !== "demo" && privileged && !user.twoFactorEnabled)
    throw new DomainError("MFA_ENROLLMENT_REQUIRED", 403);
  return {
    userId: session.user.id,
    orgId,
    orgType: membership.type,
    roles: membership.roles,
    permissions: perms,
    correlationId: String(
      req.headers["x-correlation-id"] || randomUUID(),
    ).slice(0, 80),
    fresh: Date.now() - new Date(session.session.createdAt).getTime() < 600000,
  };
}
export function requirePermission(ctx: Context, permission: string) {
  if (!ctx.permissions.includes(permission))
    throw new DomainError("PERMISSION_DENIED", 403);
}
export async function claimAccess(
  db: DB,
  ctx: Context,
  id: string,
  lock = false,
) {
  const claim = await one(
    db,
    `SELECT * FROM claims WHERE id::text=$1 ${lock ? "FOR UPDATE" : ""}`,
    [id],
  );
  if (!claim || !canSeeClaim(ctx.orgId, claim))
    throw new DomainError("RECORD_NOT_FOUND", 404);
  return claim;
}
export async function paymentAccess(
  db: DB,
  ctx: Context,
  id: string,
  lock = false,
) {
  const p = await one(
    db,
    `SELECT * FROM payments WHERE id::text=$1 ${lock ? "FOR UPDATE" : ""}`,
    [id],
  );
  if (!p || !canSeeClaim(ctx.orgId, p))
    throw new DomainError("RECORD_NOT_FOUND", 404);
  return p;
}
export async function audit(
  db: DB,
  ctx: Context,
  action: string,
  id?: string,
  metadata: object = {},
) {
  await db.query(
    "INSERT INTO audit_events(organization_id,actor_id,action,resource_id,metadata,correlation_id) VALUES($1,$2,$3,$4,$5,$6)",
    [ctx.orgId, ctx.userId, action, id, metadata, ctx.correlationId],
  );
}
export async function event(
  db: DB,
  ctx: Context,
  type: string,
  id: string,
  payload: object = {},
) {
  await db.query(
    "INSERT INTO outbox_events(type,organization_id,resource_id,payload) VALUES($1,$2,$3,$4)",
    [type, ctx.orgId, id, payload],
  );
  await audit(db, ctx, type, id);
}
export function matchVersion(actual: number, header?: string) {
  if (!header) throw new DomainError("IF_MATCH_REQUIRED", 428);
  if (header.replaceAll('"', "") !== String(actual))
    throw new DomainError("VERSION_CONFLICT", 412);
}
function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function command<T>(
  db: DB,
  ctx: Context,
  key: string | undefined,
  payload: unknown,
  work: () => Promise<T>,
): Promise<T> {
  if (!key || key.length < 8 || key.length > 120)
    throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", 400);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    ctx.orgId + ctx.userId + key,
  ]);
  const fingerprint = createHash("sha256")
    .update(canonical(payload))
    .digest("hex");
  const existing = await one(
    db,
    "SELECT * FROM idempotency_commands WHERE organization_id=$1 AND actor_id=$2 AND key=$3",
    [ctx.orgId, ctx.userId, key],
  );
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new DomainError("IDEMPOTENCY_PAYLOAD_CONFLICT");
    return existing.response;
  }
  const response = await work();
  await db.query(
    "INSERT INTO idempotency_commands(organization_id,actor_id,key,fingerprint,response) VALUES($1,$2,$3,$4,$5)",
    [ctx.orgId, ctx.userId, key, fingerprint, JSON.stringify(response)],
  );
  return response;
}

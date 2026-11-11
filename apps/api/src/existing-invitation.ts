import { z } from "zod";
import { createHash } from "node:crypto";
import { transaction, one } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
export async function acceptExistingInvitation(userId: string, input: unknown) {
  const { token } = z.object({ token: z.string().length(64) }).parse(input);
  return transaction(async (db) => {
    const user = await one(
      db,
      'SELECT email,"emailVerified",suspended FROM "user" WHERE id=$1',
      [userId],
    );
    const i = await one(
      db,
      `SELECT i.* FROM invitations i JOIN organizations o ON o.id=i.organization_id WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() AND o.status='ACTIVE' FOR UPDATE OF i`,
      [createHash("sha256").update(token).digest("hex")],
    );
    if (
      !i ||
      !user?.emailVerified ||
      user.suspended ||
      user.email.toLowerCase() !== i.email.toLowerCase()
    )
      throw new DomainError("INVITATION_UNAVAILABLE", 400);
    await db.query(
      `INSERT INTO memberships(user_id,organization_id,roles) VALUES($1,$2,$3) ON CONFLICT(user_id,organization_id) DO NOTHING`,
      [userId, i.organization_id, i.roles],
    );
    await db.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
      i.id,
    ]);
    await db.query(
      `INSERT INTO audit_events(organization_id,actor_id,action,resource_id) VALUES($1,$2,'InvitationAccepted',$3)`,
      [i.organization_id, userId, i.id],
    );
    return {
      status: "ACCEPTED",
      message:
        "Invitation accepted for your signed-in account. Return to your workspace to select the organization.",
    };
  });
}

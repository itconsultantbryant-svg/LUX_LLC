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
    if (i.patient_id) {
      const reference = await one(
        db,
        `SELECT id FROM insurer_patient_references WHERE id=$1 AND patient_id=$2 AND insurer_id=$3`,
        [i.patient_insurer_reference_id, i.patient_id, i.organization_id],
      );
      if (!reference) throw new DomainError("INVITATION_UNAVAILABLE", 400);
      await db.query(
        `INSERT INTO patient_accounts(user_id,patient_id,insurer_id,reference_id,created_by)
         VALUES($1,$2,$3,$4,$5)`,
        [userId, i.patient_id, i.organization_id, reference.id, i.created_by],
      );
      await db.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
        i.id,
      ]);
      await db.query(
        `INSERT INTO audit_events(organization_id,actor_id,action,resource_id) VALUES($1,$2,'PatientPortalAccessAccepted',$3)`,
        [i.organization_id, userId, i.patient_id],
      );
      return {
        status: "ACCEPTED",
        message:
          "Patient portal access accepted for your signed-in account. Return to your workspace to see your own cover and claims.",
      };
    }
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

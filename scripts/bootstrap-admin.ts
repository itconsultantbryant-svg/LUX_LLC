import "../packages/config/env.ts";
import { auth, mode } from "../apps/api/src/auth.ts";
import { pool, transaction, one } from "../packages/db/index.ts";
const email = process.env.BOOTSTRAP_EMAIL,
  password = process.env.BOOTSTRAP_PASSWORD,
  name = process.env.BOOTSTRAP_NAME;
if (
  process.env.BOOTSTRAP_APPROVED !== "true" ||
  !email ||
  !password ||
  password.length < 12 ||
  !name
)
  throw Error(
    "Explicit BOOTSTRAP_APPROVED, verified BOOTSTRAP_EMAIL, BOOTSTRAP_NAME and strong BOOTSTRAP_PASSWORD required.",
  );
if (mode === "demo")
  throw Error("Use the isolated demo seed for demo environments.");
if (await one(pool, `SELECT id FROM organizations WHERE type='LUX'`))
  throw Error(
    "LUX organization already exists. Bootstrap is one-use; use approved administration instead.",
  );
const r = await auth.api.signUpEmail({ body: { email, name, password } });
await transaction(async (db) => {
  await db.query("SELECT pg_advisory_xact_lock(772311)");
  if (await one(db, `SELECT id FROM organizations WHERE type='LUX'`))
    throw Error("Already bootstrapped");
  const o = await one(
    db,
    `INSERT INTO organizations(name,type,status) VALUES('LUX HealthPay','LUX','ACTIVE') RETURNING id`,
  );
  await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
    r.user.id,
  ]);
  await db.query(
    `INSERT INTO memberships(user_id,organization_id,roles) VALUES($1,$2,'{PLATFORM_ADMIN}')`,
    [r.user.id, o.id],
  );
  await db.query(
    `INSERT INTO audit_events(organization_id,actor_id,action) VALUES($1,$2,'OperatorApprovedBootstrap')`,
    [o.id, r.user.id],
  );
});
console.log(
  "Administrator created. Remove bootstrap credentials from environment and enroll MFA before using privileged domain routes.",
);
await pool.end();

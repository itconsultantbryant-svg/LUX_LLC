import "../packages/config/env.ts";
import { pool, transaction, one } from "../packages/db/index.ts";
import { mode } from "../apps/api/src/auth.ts";
import { seedDemoPayroll } from "../db/demo-payroll.ts";

if (
  process.env.NODE_ENV === "production" ||
  mode !== "demo" ||
  process.env.ALLOW_DEMO_SEED !== "true"
)
  throw Error(
    "Demo payroll/wallet backfill requires nonproduction LUX_MODE=demo and ALLOW_DEMO_SEED=true",
  );

const result = await transaction(async (db) => {
  await db.query("SELECT pg_advisory_xact_lock(772312)");
  const lux = await one(
    db,
    "SELECT id FROM organizations WHERE type='LUX' ORDER BY created_at LIMIT 1",
  );
  if (!lux) throw Error("LUX organization is required before demo backfill");
  let orange = await one(
    db,
    "SELECT id FROM organizations WHERE type='ORANGE' ORDER BY created_at LIMIT 1",
  );
  if (!orange) {
    orange = await one(
      db,
      `INSERT INTO organizations(name,type,status,demo) VALUES('Orange Money (Liberia)','ORANGE','ACTIVE',true) RETURNING id`,
    );
    await db.query(
      `INSERT INTO audit_events(organization_id,action,metadata)
       VALUES($1,'DemoOrangePartnerRecordCreated',$2)`,
      [lux.id, { simulated: true, note: "Demo partner ledger only." }],
    );
  }
  const insurers = (
    await db.query(
      "SELECT id,name FROM organizations WHERE type='INSURER' AND status='ACTIVE' ORDER BY name",
    )
  ).rows;
  if (!insurers.length) throw Error("No active demo insurer found");
  const seeded = await seedDemoPayroll(db, {
    insurers: insurers.map((i: any) => i.id),
  });
  return {
    lux: lux.id,
    orange: orange.id,
    ...seeded,
    insurers: insurers.map((i: any) => i.name),
  };
});
console.log(JSON.stringify(result, null, 2));
await pool.end();

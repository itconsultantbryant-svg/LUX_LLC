import { randomUUID } from "node:crypto";
import { pool, transaction, one } from "../packages/db/index.ts";
import { auth, mode } from "../apps/api/src/auth.ts";
import { team } from "../packages/config/team.ts";
import { readFile } from "node:fs/promises";
if (
  process.env.NODE_ENV === "production" ||
  mode !== "demo" ||
  process.env.ALLOW_DEMO_SEED !== "true"
)
  throw Error(
    "Demo seed requires nonproduction LUX_MODE=demo and ALLOW_DEMO_SEED=true",
  );
const password = process.env.DEMO_PASSWORD;
const passwords: Record<string, string> = process.env.DEMO_PASSWORDS_FILE
  ? JSON.parse(await readFile(process.env.DEMO_PASSWORDS_FILE, "utf8"))
  : {};
if (!Object.keys(passwords).length && (!password || password.length < 16))
  throw Error(
    "Supply DEMO_PASSWORD (16+ characters) or a private DEMO_PASSWORDS_FILE. No default password exists.",
  );
if ((await pool.query("SELECT id FROM organizations LIMIT 1")).rowCount)
  throw Error(
    "Seed requires an empty NEW database; existing records are never reset.",
  );
const accounts = [
  ["platform", "Platform operator", ["PLATFORM_ADMIN"]],
  ["luxfinance", "LUX finance", ["LUX_FINANCE"]],
  [
    "facility",
    "Facility claims officer",
    [
      "FACILITY_CLAIMS",
      "FACILITY_ADMIN",
      "FACILITY_FINANCE",
      "FACILITY_CLINICIAN",
    ],
  ],
  ["facility2", "Unrelated facility officer", ["FACILITY_CLAIMS"]],
  ["reviewer", "Insurer reviewer", ["INSURER_REVIEWER"]],
  ["finance", "Insurer finance maker", ["INSURER_FINANCE"]],
  ["checker", "Insurer finance checker", ["INSURER_FINANCE"]],
  ["insurer2", "Other insurer reviewer", ["INSURER_REVIEWER"]],
] as const;
const users: Record<string, string> = {};
for (const [key, name] of accounts) {
  const accountPassword = passwords[key] || password;
  if (!accountPassword || accountPassword.length < 16)
    throw Error(`Supply a unique 16+ character demo password for ${key}`);
  const existing = await one(pool, 'SELECT id FROM "user" WHERE email=$1', [
    `${key}@demo.lux.test`,
  ]);
  const r = existing
    ? { user: existing }
    : await auth.api.signUpEmail({
        body: {
          email: `${key}@demo.lux.test`,
          name,
          password: accountPassword,
        },
      });
  users[key] = r.user.id;
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
    r.user.id,
  ]);
}
await transaction(async (db) => {
  const organizations: Record<string, string> = {};
  for (const [key, name, type] of [
    ["lux", "LUX HealthPay", "LUX"],
    ["insurer", "Demo Atlantic Insurance", "INSURER"],
    ["insurer2", "Demo Palm Insurance", "INSURER"],
    ["facility", "Demo Monrovia Clinic", "FACILITY"],
    ["facility2", "Demo River Care Centre", "FACILITY"],
    ["facility3", "Demo Coastal Health", "FACILITY"],
  ]) {
    const o = await one(
      db,
      `INSERT INTO organizations(name,type,status,demo) VALUES($1,$2,'ACTIVE',true) RETURNING id`,
      [name, type],
    );
    organizations[key] = o.id;
  }
  for (const [key, , roles] of accounts) {
    const org = ["platform", "luxfinance"].includes(key)
      ? "lux"
      : ["reviewer", "finance", "checker"].includes(key)
        ? "insurer"
        : key === "insurer2"
          ? "insurer2"
          : key === "facility2"
            ? "facility2"
            : "facility";
    await db.query(
      "INSERT INTO memberships(user_id,organization_id,roles) VALUES($1,$2,$3)",
      [users[key], organizations[org], [...roles]],
    );
  }
  for (const [facility, insurer] of [
    ["facility", "insurer"],
    ["facility3", "insurer"],
    ["facility2", "insurer2"],
  ])
    await db.query(
      `INSERT INTO facility_insurer_contracts(facility_id,insurer_id,starts_on,ends_on) VALUES($1,$2,current_date-365,current_date+365)`,
      [organizations[facility], organizations[insurer]],
    );
  for (const key of ["facility", "facility2", "facility3"])
    await db.query(
      `INSERT INTO wallet_destinations(organization_id,reference,verified) VALUES($1,$2,true)`,
      [organizations[key], "DEMO-DEST-" + key],
    );
  for (const key of ["insurer", "insurer2"]) {
    for (const [version, feeMode] of [
      [1, "FACILITY_DEDUCTED"],
      [2, "INSURER_ADDED"],
    ] as const)
      await db.query(
        `INSERT INTO fee_policies(insurer_id,version,mode,collection_supported,approved_by,effective_at) VALUES($1,$2::int,$3,true,$4,now()-interval '1 day'*$2::int)`,
        [organizations[key], version, feeMode, users.finance],
      );
    for (const version of [1, 2]) {
      const tariff = await one(
        db,
        `INSERT INTO tariff_sets(insurer_id,version,effective_from,effective_to,label) VALUES($1,$2,current_date-365,current_date+365,$3) RETURNING id`,
        [
          organizations[key],
          version,
          `Local pilot catalogue v${version} — not official medical codes`,
        ],
      );
      for (const [code, description, amount] of [
        ["PILOT-CONSULT", "Outpatient consultation", "2500"],
        ["PILOT-LAB", "Basic laboratory service", "4500"],
        ["PILOT-MEDS", "Prescribed medication record", "3000"],
      ])
        await db.query(
          `INSERT INTO tariff_items(tariff_set_id,code,description,currency,max_unit_minor) VALUES($1,$2,$3,'USD',$4)`,
          [tariff.id, code, description, amount],
        );
    }
  }
  const states = [
    "DRAFT",
    "SUBMITTED",
    "AWAITING_REVIEW",
    "NEEDS_INFORMATION",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "APPROVED",
    "APPROVED",
    "APPROVED",
    "APPROVED",
    "REJECTED",
    "AWAITING_REVIEW",
  ];
  for (let n = 0; n < 15; n++) {
    const fk = n < 12 ? "facility" : "facility2",
      ik = n < 12 ? "insurer" : "insurer2";
    const facility = organizations[fk],
      insurer = organizations[ik],
      actor = users[fk];
    const patient = await one(
      db,
      `INSERT INTO patients(facility_id,display_name,birth_year,processing_basis,created_by) VALUES($1,$2,$3,'SYNTHETIC_DEMO_ONLY',$4) RETURNING id`,
      [
        facility,
        `Synthetic Patient ${String(n + 1).padStart(2, "0")}`,
        1980 + n,
        actor,
      ],
    );
    const status = n % 5 === 0 ? "INACTIVE" : "ACTIVE",
      stale = n % 4 === 0;
    await db.query(
      `INSERT INTO insurer_patient_references(patient_id,insurer_id,external_reference,policy_reference,status,effective_from,effective_to,source_updated_at,benefits) VALUES($1,$2,$3,$4,$5,current_date-30,current_date+90,now()-interval '1 day'*$6,$7)`,
      [
        patient.id,
        insurer,
        `DEMO-MEMBER-${n}`,
        `DEMO-POLICY-${n}`,
        status,
        stale ? 5 : 0,
        {
          outpatient: "Insurer review required",
          limitations: "Synthetic policy record",
        },
      ],
    );
    const eligibility = await one(
      db,
      `INSERT INTO eligibility_snapshots(patient_id,facility_id,insurer_id,status,source,policy_reference,source_updated_at,checked_by) VALUES($1,$2,$3,$4,'DEMO_INSURER_IMPORT',$5,now()-interval '1 day'*$6,$7) RETURNING *`,
      [
        patient.id,
        facility,
        insurer,
        stale ? "STALE" : status,
        `DEMO-POLICY-${n}`,
        stale ? 5 : 0,
        actor,
      ],
    );
    const encounter = await one(
      db,
      `INSERT INTO encounters(patient_id,facility_id,clinician_id,service_date,diagnosis,notes) VALUES($1,$2,$3,current_date-1,'Synthetic outpatient encounter','Demonstration documentation only; not a real medical record.') RETURNING *`,
      [patient.id, facility, actor],
    );
    const contract = await one(
      db,
      "SELECT id FROM facility_insurer_contracts WHERE facility_id=$1 AND insurer_id=$2",
      [facility, insurer],
    );
    const state = states[n % 12],
      submitted = n === 2 ? "15000" : "100000",
      approved =
        state === "PARTIALLY_APPROVED"
          ? "70000"
          : state === "APPROVED"
            ? submitted
            : "0";
    const c = await one(
      db,
      `INSERT INTO claims(reference,facility_id,insurer_id,contract_id,patient_id,encounter_id,eligibility_id,currency,state,submitted_minor,approved_minor,submission_version,created_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'USD',$8,$9,$10,$11,$12,now()-interval '1 minute'*$13) RETURNING *`,
      [
        `DEMO-LHP-${String(n + 1).padStart(4, "0")}`,
        facility,
        insurer,
        contract.id,
        patient.id,
        encounter.id,
        eligibility.id,
        state,
        submitted,
        approved,
        state === "DRAFT" ? 0 : 1,
        actor,
        n,
      ],
    );
    const item = await one(
      db,
      `INSERT INTO claim_items(claim_id,code,description,quantity,unit_minor) VALUES($1,'PILOT-CONSULT','Synthetic itemized service',1,$2) RETURNING *`,
      [c.id, submitted],
    );
    if (state !== "DRAFT")
      await db.query(
        "INSERT INTO claim_versions(claim_id,version,snapshot,actor_id) VALUES($1,1,$2,$3)",
        [c.id, { claim: c, items: [item], encounter, eligibility }, actor],
      );
    await db.query(
      `INSERT INTO audit_events(organization_id,actor_id,action,resource_id) VALUES($1,$2,'DemoClaimSeeded',$3)`,
      [facility, actor, c.id],
    );
    if (state === "SUBMITTED")
      await db.query(
        `INSERT INTO outbox_events(type,organization_id,resource_id,payload) VALUES('ClaimSubmitted',$1,$2,$3)`,
        [facility, c.id, { submissionVersion: 1 }],
      );
    if (
      [
        "APPROVED",
        "PARTIALLY_APPROVED",
        "REJECTED",
        "NEEDS_INFORMATION",
      ].includes(state)
    )
      await db.query(
        `INSERT INTO decisions(claim_id,submission_version,outcome,reason,approved_minor,tariff_snapshot,actor_id) VALUES($1,1,$2,$3,$4,'{}',$5)`,
        [
          c.id,
          state,
          state === "NEEDS_INFORMATION"
            ? "Please provide complete item evidence."
            : "Synthetic insurer human review decision.",
          approved,
          users.reviewer,
        ],
      );
    if (n === 2 || n === 11) {
      const run = await one(
        db,
        `INSERT INTO validation_runs(claim_id,input_version,ruleset_version,model_version,status,completed_at) VALUES($1,1,'pilot-v1','deterministic-v1','COMPLETED',now()) RETURNING id`,
        [c.id],
      );
      await db.query(
        `INSERT INTO findings(validation_run_id,field,category,severity,reason,evidence) VALUES($1,'items','TARIFF','REVIEW','Submitted charge needs tariff review. This is not a fraud verdict.','synthetic pilot item')`,
        [run.id],
      );
    }
    if (n >= 6 && n <= 9) {
      const paymentState = [
        "AWAITING_FUNDS",
        "SETTLED",
        "FAILED",
        "UNKNOWN_PENDING_INVESTIGATION",
      ][n - 6];
      const policy = await one(
        db,
        "SELECT id FROM fee_policies WHERE insurer_id=$1 AND version=2",
        [insurer],
      );
      const p = await one(
        db,
        `INSERT INTO payments(claim_id,facility_id,insurer_id,currency,base_minor,state,mode,destination_snapshot,fee_snapshot,policy_id,provider_reference,created_by,settled_at) VALUES($1,$2,$3,'USD',100000,$4,'demo',$5,$6,$7,$8,$9,CASE WHEN $4='SETTLED' THEN now() END) RETURNING *`,
        [
          c.id,
          facility,
          insurer,
          paymentState,
          {
            reference: "DEMO-DEST-" + fk,
            version: 1,
            scenario:
              n === 6
                ? "funds"
                : n === 8
                  ? "failure"
                  : n === 9
                    ? "timeout"
                    : "success",
          },
          {
            base: "100000",
            total: "2000",
            lux: "1000",
            orange: "1000",
            insurerDebit: "102000",
            facilityNet: "100000",
            mode: "INSURER_ADDED",
          },
          policy.id,
          `DEMO-PROVIDER-${n}`,
          users.finance,
        ],
      );
      await db.query(
        `INSERT INTO claim_payment_allocations(claim_id,payment_id,amount_minor,status) VALUES($1,$2,100000,$3)`,
        [c.id, p.id, n === 8 ? "RELEASED" : n === 7 ? "CONFIRMED" : "RESERVED"],
      );
      await db.query(
        `INSERT INTO payment_authorizations(payment_id,maker_id,checker_id,reason,authorized_at) VALUES($1,$2,$3,'Synthetic dual approval',now())`,
        [p.id, users.finance, users.checker],
      );
      if (n === 7) {
        const ev = await one(
          db,
          `INSERT INTO provider_events(provider_event_id,payment_id,payload_hash,verified,outcome,evidence) VALUES($1,$2,'demo-seed',true,'SETTLED',$3) RETURNING id`,
          ["demo-seed-" + n, p.id, { synthetic: true }],
        );
        await db.query(
          `INSERT INTO fee_assessments(payment_id,currency,total_minor,lux_minor,orange_minor) VALUES($1,'USD',2000,1000,1000)`,
          [p.id],
        );
        for (const [cat, amt] of [
          ["FACILITY_PRINCIPAL", "100000"],
          ["LUX_EARNED", "1000"],
          ["ORANGE_ACCRUED", "1000"],
        ])
          await db.query(
            `INSERT INTO ledger_entries(payment_id,category,currency,amount_minor,evidence_id) VALUES($1,$2,'USD',$3,$4)`,
            [p.id, cat, amt, ev.id],
          );
      }
      if (n === 9)
        await db.query(
          `INSERT INTO reconciliation_items(organization_id,payment_id,category,notes) VALUES($1,$2,'UNRESOLVED_TIMEOUT','Synthetic timeout; status inquiry required, no new transfer.')`,
          [insurer, p.id],
        );
    }
  }
  for (const [i, t] of team.entries())
    await db.query(
      "INSERT INTO team_members(slug,name,role,bio,photo,alt,sort_order,published,admin_note) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8)",
      [
        t.slug,
        t.name,
        t.role,
        t.bio,
        "/media/" + t.photo,
        `Portrait of ${t.name}`,
        i,
        t.bio ? null : "Biography pending approval",
      ],
    );
  await db.query(
    `INSERT INTO integration_configurations(organization_id,provider,mode,capabilities) VALUES($1,'Orange Money','demo',$2)`,
    [
      organizations.lux,
      { syntheticOnly: true, liveBusinessDisbursement: false, feeSplit: false },
    ],
  );
});
console.log(
  "Synthetic seed created. Accounts (passwords are supplied privately by environment/file):",
);
for (const [key] of accounts) console.log(`${key}@demo.lux.test`);
await pool.end();

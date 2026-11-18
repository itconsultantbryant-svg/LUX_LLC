import { one, type DB } from "../packages/db/index.ts";

type Band = {
  level: string;
  label: string;
  min: string;
  max: string | null;
  deduction: string;
};
type Package = {
  code: string;
  name: string;
  premium: string;
  bands: Band[];
};

/**
 * Synthetic catalogue used only by the demo. Salary figures are illustrative
 * and the deductions are recorded in a demo table; no employer payroll system
 * is contacted and no real salary is reduced.
 */
export const DEMO_PACKAGES: Package[] = [
  {
    code: "ESSENTIAL",
    name: "Essential Care",
    premium: "300",
    bands: [
      {
        level: "ESSENTIAL_ENTRY",
        label: "Entry level",
        min: "0",
        max: "39999",
        deduction: "400",
      },
      {
        level: "ESSENTIAL_ASSOCIATE",
        label: "Associate level",
        min: "40000",
        max: "99999",
        deduction: "800",
      },
      {
        level: "ESSENTIAL_SENIOR",
        label: "Senior level",
        min: "100000",
        max: "249999",
        deduction: "1500",
      },
      {
        level: "ESSENTIAL_EXECUTIVE",
        label: "Executive level",
        min: "250000",
        max: null,
        deduction: "2500",
      },
    ],
  },
  {
    code: "FAMILY",
    name: "Family Plus",
    premium: "900",
    bands: [
      {
        level: "FAMILY_ENTRY",
        label: "Entry level, family cover",
        min: "0",
        max: "49999",
        deduction: "900",
      },
      {
        level: "FAMILY_ASSOCIATE",
        label: "Associate level, family cover",
        min: "50000",
        max: "119999",
        deduction: "1600",
      },
      {
        level: "FAMILY_SENIOR",
        label: "Senior level, family cover",
        min: "120000",
        max: "299999",
        deduction: "2400",
      },
      {
        level: "FAMILY_EXECUTIVE",
        label: "Executive level, family cover",
        min: "300000",
        max: null,
        deduction: "3600",
      },
    ],
  },
];

export const DEMO_EMPLOYERS = [
  "Demo Ministry of Health",
  "Demo County Education Service",
  "Demo Harbour Authority",
  "Demo Community Bank",
];

/**
 * Idempotent demo payroll, wallet and float setup. Safe to run repeatedly on a
 * demo database: existing packages, members and deductions are never deleted.
 */
export async function seedDemoPayroll(
  db: DB,
  options: { insurers: string[]; actorId?: string | null; floatMinor?: string },
) {
  if (!options.insurers.length) return { insurers: 0 };
  const floatMinor = options.floatMinor || "5000000";

  const orange = await one(
    db,
    "SELECT id FROM organizations WHERE type='ORANGE' ORDER BY created_at LIMIT 1",
  );
  if (!orange)
    await db.query(
      `INSERT INTO organizations(name,type,status,demo) VALUES('Orange Money (Liberia)','ORANGE','ACTIVE',true)`,
    );

  // Every organization gets one simulated Orange Money wallet per currency.
  await db.query(
    `INSERT INTO organization_wallets(organization_id,provider,currency,balance_minor,simulated)
     SELECT id,'ORANGE_MONEY','USD',0,true FROM organizations
     ON CONFLICT (organization_id,provider,currency) DO NOTHING`,
  );

  let packages = 0;
  let bands = 0;
  for (const insurerId of options.insurers) {
    for (const pkg of DEMO_PACKAGES) {
      const saved = await one(
        db,
        `INSERT INTO insurance_packages(insurer_id,code,name,monthly_premium_minor,currency,benefits,status)
         VALUES($1,$2,$3,$4,'USD',$5,'ACTIVE')
         ON CONFLICT (insurer_id,code) DO UPDATE
           SET name=excluded.name,monthly_premium_minor=excluded.monthly_premium_minor,benefits=excluded.benefits,status='ACTIVE'
         RETURNING id`,
        [
          insurerId,
          pkg.code,
          pkg.name,
          pkg.premium,
          {
            simulated: true,
            outpatient: "Insurer review required",
            note: "Synthetic package for the LUX demonstration; not an insurance offer.",
          },
        ],
      );
      packages++;
      for (const band of pkg.bands) {
        await db.query(
          `INSERT INTO payroll_bands(insurer_id,package_id,level,label,min_salary_minor,max_salary_minor,deduction_minor,currency)
           VALUES($1,$2,$3,$4,$5,$6,$7,'USD')
           ON CONFLICT (insurer_id,level) DO UPDATE
             SET package_id=excluded.package_id,label=excluded.label,
                 min_salary_minor=excluded.min_salary_minor,
                 max_salary_minor=excluded.max_salary_minor,
                 deduction_minor=excluded.deduction_minor`,
          [
            insurerId,
            saved.id,
            band.level,
            band.label,
            band.min,
            band.max,
            band.deduction,
          ],
        );
        bands++;
      }
    }
  }

  const patients = (
    await db.query(
      `SELECT DISTINCT ON (p.id) p.id patient_id,p.display_name,r.insurer_id,p.facility_id
         FROM patients p
         JOIN insurer_patient_references r ON r.patient_id=p.id
         JOIN facility_insurer_contracts c ON c.facility_id=p.facility_id AND c.insurer_id=r.insurer_id
          AND c.status='ACTIVE' AND current_date BETWEEN c.starts_on AND c.ends_on
        WHERE r.insurer_id = ANY($1::uuid[]) AND r.status='ACTIVE'
        ORDER BY p.id,p.display_name`,
      [options.insurers],
    )
  ).rows;

  let subscriptions = 0;
  let deductions = 0;
  for (const [index, patient] of patients.entries()) {
    const pkg = DEMO_PACKAGES[index % 6 === 5 ? 1 : 0];
    const band = pkg.bands[index % pkg.bands.length];
    const gross = String(BigInt(band.min) + 20000n);
    const bandRow = await one(
      db,
      "SELECT * FROM payroll_bands WHERE insurer_id=$1 AND level=$2",
      [patient.insurer_id, band.level],
    );
    if (!bandRow) continue;
    const existing = await one(
      db,
      "SELECT * FROM payroll_subscriptions WHERE patient_id=$1 AND insurer_id=$2",
      [patient.patient_id, patient.insurer_id],
    );
    const subscription =
      existing ||
      (await one(
        db,
        `INSERT INTO payroll_subscriptions(patient_id,insurer_id,package_id,band_id,employment_level,employer_name,gross_salary_minor,currency,status,simulated,effective_from)
         VALUES($1,$2,$3,$4,$5,$6,$7,'USD','ACTIVE',true,current_date-120)
         RETURNING *`,
        [
          patient.patient_id,
          patient.insurer_id,
          bandRow.package_id,
          bandRow.id,
          bandRow.level,
          DEMO_EMPLOYERS[index % DEMO_EMPLOYERS.length],
          gross,
        ],
      ));
    subscriptions++;
    for (let offset = 0; offset < 4; offset++) {
      const inserted = await one(
        db,
        `INSERT INTO payroll_deductions(subscription_id,period_start,gross_salary_minor,deduction_minor,net_salary_minor,currency,status,simulated)
         VALUES($1,(date_trunc('month',current_date) - ($2::int * interval '1 month'))::date,$3,$4,$5,'USD','DEDUCTED',true)
         ON CONFLICT (subscription_id,period_start) DO NOTHING
         RETURNING id`,
        [
          subscription.id,
          offset,
          gross,
          bandRow.deduction_minor,
          String(BigInt(gross) - BigInt(bandRow.deduction_minor)),
        ],
      );
      if (inserted) deductions++;
    }
  }

  let funded = 0;
  for (const insurerId of options.insurers) {
    const existing = await one(
      db,
      "SELECT id FROM wallet_fundings WHERE organization_id=$1 AND reason='Demo float for simulated instant payouts' LIMIT 1",
      [insurerId],
    );
    if (existing) continue;
    await db.query(
      `INSERT INTO organization_wallets(organization_id,provider,currency,balance_minor,simulated)
       VALUES($1,'ORANGE_MONEY','USD',0,true)
       ON CONFLICT (organization_id,provider,currency) DO NOTHING`,
      [insurerId],
    );
    await db.query(
      `INSERT INTO wallet_fundings(organization_id,provider,currency,amount_minor,reason,simulated)
       VALUES($1,'ORANGE_MONEY','USD',$2,'Demo float for simulated instant payouts',true)`,
      [insurerId, floatMinor],
    );
    await db.query(
      `UPDATE organization_wallets SET balance_minor=balance_minor+$2::bigint,updated_at=now()
        WHERE organization_id=$1 AND provider='ORANGE_MONEY' AND currency='USD'`,
      [insurerId, floatMinor],
    );
    funded++;
  }

  await db.query(
    `INSERT INTO audit_events(organization_id,actor_id,action,metadata)
     VALUES($1,$2,'DemoPayrollWalletSeeded',$3)`,
    [
      options.insurers[0],
      options.actorId || null,
      { packages, bands, subscriptions, deductions, funded, simulated: true },
    ],
  );

  return {
    insurers: options.insurers.length,
    packages,
    bands,
    patients: patients.length,
    subscriptions,
    deductions,
    funded,
    floatMinor,
  };
}

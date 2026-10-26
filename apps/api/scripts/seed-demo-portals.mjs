import { config } from 'dotenv';
import pg from 'pg';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

config({ quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/_(dev|demo|test)$/.test(new URL(databaseUrl).pathname)) {
  throw new Error(
    'Demo portal accounts may only be seeded into a local development, demo, or test database.',
  );
}

const accounts = [
  ['+231770000123', 'SYNTHETIC Customer', ['customer']],
  ['+231770000201', 'SYNTHETIC Employer Administrator', ['customer', 'employer_admin']],
  ['+231770000202', 'SYNTHETIC Provider Administrator', ['customer', 'provider_admin']],
  ['+231770000203', 'SYNTHETIC Bank Officer', ['customer', 'partner_officer']],
  ['+231770000204', 'SYNTHETIC Sponsor Administrator', ['customer', 'sponsor_admin']],
  ['+231770000205', 'SYNTHETIC LUX Administrator', ['customer', 'reviewer', 'platform_admin']],
];
const scrypt = promisify(scryptCallback);
async function hash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  for (const [phone, name, roles] of accounts) {
    const user = await pool.query(
      `INSERT INTO users(phone_e164,display_name,verification_status)
       VALUES($1,$2,'verified')
       ON CONFLICT(phone_e164) DO UPDATE SET display_name=EXCLUDED.display_name,verification_status='verified'
       RETURNING id`,
      [phone, name],
    );
    for (const role of roles) {
      await pool.query(
        `INSERT INTO user_roles(user_id,role)
         SELECT $1,$2::app_role
         WHERE NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2::app_role)`,
        [user.rows[0].id, role],
      );
    }
    {
      const identifier = `${name
        .toLowerCase()
        .replace(/^synthetic /, '')
        .replaceAll(/[^a-z]+/g, '.')
        .replace(/^\.|\.$/g, '')}@demo.healthwallet.lr`;
      await pool.query(
        `INSERT INTO credential_logins(user_id,identifier,password_hash) VALUES($1,$2,$3) ON CONFLICT(identifier) DO UPDATE SET user_id=EXCLUDED.user_id,password_hash=EXCLUDED.password_hash,failed_attempts=0,locked_until=NULL,updated_at=now()`,
        [user.rows[0].id, identifier, await hash('HealthWalletDemo!2026')],
      );
    }
  }
  const providerUser = await pool.query(`SELECT id FROM users WHERE phone_e164='+231770000202'`);
  const providerOrg = await pool.query(
    `SELECT id FROM organizations WHERE registration_number='SYNTH-REDEMPTION-ORG' AND status='approved'`,
  );
  if (providerUser.rows[0] && providerOrg.rows[0]) {
    await pool.query(
      `INSERT INTO organization_memberships(organization_id,user_id,role,status)
       VALUES($1,$2,'provider_manager','active')
       ON CONFLICT (organization_id,user_id,role) DO UPDATE SET status='active'`,
      [providerOrg.rows[0].id, providerUser.rows[0].id],
    );
  }
  const portalMemberships = [
    ['+231770000204', 'SYNTHETIC-SPONSOR', 'organization_admin'],
    ['+231770000203', 'SYNTHETIC-PARTNER', 'partner_officer'],
  ];
  for (const [phone, registrationNumber, role] of portalMemberships) {
    const user = await pool.query('SELECT id FROM users WHERE phone_e164=$1', [phone]);
    const organization = await pool.query(
      "SELECT id FROM organizations WHERE registration_number=$1 AND status='approved'",
      [registrationNumber],
    );
    if (user.rows[0] && organization.rows[0]) {
      await pool.query(
        `INSERT INTO organization_memberships(organization_id,user_id,role,status)
         VALUES($1,$2,$3,'active')
         ON CONFLICT (organization_id,user_id,role) DO UPDATE SET status='active'`,
        [organization.rows[0].id, user.rows[0].id, role],
      );
    }
  }
  const employerUser = await pool.query(`SELECT id FROM users WHERE phone_e164='+231770000201'`);
  const employeeUser = await pool.query(`SELECT id FROM users WHERE phone_e164='+231770000123'`);
  if (employerUser.rows[0] && employeeUser.rows[0]) {
    const employer = await pool.query(
      `WITH existing AS (
         SELECT id FROM organizations WHERE registration_number='SYNTHETIC-HEALTHWORKS'
       ), inserted AS (
         INSERT INTO organizations(name,kind,registration_number,created_by,status)
         SELECT 'SYNTHETIC HealthWorks Liberia','employer','SYNTHETIC-HEALTHWORKS',$1,'approved'
         WHERE NOT EXISTS (SELECT 1 FROM existing)
         RETURNING id
       ) SELECT id FROM inserted UNION ALL SELECT id FROM existing LIMIT 1`,
      [employerUser.rows[0].id],
    );
    await pool.query(
      `INSERT INTO organization_memberships(organization_id,user_id,role,status)
       VALUES($1,$2,'employer_admin','active')
       ON CONFLICT (organization_id,user_id,role) DO UPDATE SET status='active'`,
      [employer.rows[0].id, employerUser.rows[0].id],
    );
    await pool.query(
      `INSERT INTO employer_employees(organization_id,user_id,employee_reference,department,status)
       VALUES($1,$2,'SYN-EMP-001','Synthetic Benefits','active')
       ON CONFLICT (organization_id,user_id) DO UPDATE SET department=EXCLUDED.department,status='active',updated_at=now()`,
      [employer.rows[0].id, employeeUser.rows[0].id],
    );
  }
  console.log(
    'Demo portal accounts seeded. Use sandbox phone OTP; codes are shown by the local sign-in flow.',
  );
} finally {
  await pool.end();
}

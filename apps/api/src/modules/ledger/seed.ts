import { createHash } from 'node:crypto';
import { LedgerService } from './service.js';
export function seedId(label: string): string {
  const h = createHash('sha256').update(`lux-synthetic-core-v1:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Operator-only synthetic fixture; never grants PlatformAdmin or creates usable sessions. */
export async function seedCore(ledger: LedgerService, appEnv: string) {
  if (!['development', 'demo', 'test'].includes(appEnv))
    throw new Error('Synthetic seed is disabled outside development, demo and test.');
  const id = seedId;
  return ledger.operation('synthetic:core:v1', 'synthetic_seed', { version: 1 }, async (client) => {
    await client.query(`
      INSERT INTO users(id,phone_e164,display_name) VALUES
       ('${id('customer')}','+999700000001','SYNTHETIC Customer'),
       ('${id('family')}','+999700000002','SYNTHETIC Family Contributor'),
       ('${id('reviewer')}','+999700000003','SYNTHETIC Reviewer');
      INSERT INTO user_roles(user_id,role) VALUES ('${id('customer')}','customer'),('${id('family')}','contributor'),('${id('reviewer')}','customer');
      INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method) VALUES('${'0'.repeat(64)}','${id('customer')}',now()-interval '1 day','sandbox');
      INSERT INTO customer_profiles(user_id,display_name) VALUES('${id('customer')}','SYNTHETIC Customer');
      INSERT INTO consents(user_id,consent_type,granted,version) VALUES('${id('customer')}','service_terms',true,'sandbox-v1'),('${id('customer')}','health_data',true,'sandbox-v1');
      INSERT INTO dependents(id,guardian_user_id,display_name,relationship) VALUES('${id('dependent')}','${id('customer')}','SYNTHETIC Child','child');
      INSERT INTO organizations(id,name,kind,registration_number,created_by,status) VALUES
       ('${id('clinic')}','SYNTHETIC Care Clinic','provider','SYNTHETIC-CLINIC','${id('reviewer')}','approved'),
       ('${id('sponsor')}','SYNTHETIC Community Sponsor','sponsor','SYNTHETIC-SPONSOR','${id('reviewer')}','approved'),
       ('${id('partner')}','SYNTHETIC Payment Partner','partner','SYNTHETIC-PARTNER','${id('reviewer')}','approved');
      INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('${id('clinic')}','${id('reviewer')}','reviewer');
      INSERT INTO providers(id,organization_id,legal_name,license_number,status) VALUES('${id('provider')}','${id('clinic')}','SYNTHETIC Care Clinic','NOT-A-REAL-LICENSE','verified');
      INSERT INTO wallets(id,owner_user_id,currency) VALUES('${id('wallet-lrd')}','${id('customer')}','LRD'),('${id('wallet-usd')}','${id('customer')}','USD');
      INSERT INTO bills(id,customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category) VALUES('${id('bill')}','${id('customer')}','${id('clinic')}','SYNTHETIC Care Clinic','LRD',4000,'outpatient');
      INSERT INTO bill_items(bill_id,description,category,quantity,unit_amount_minor,total_amount_minor,currency) VALUES('${id('bill')}','SYNTHETIC consultation','outpatient',2,2000,4000,'LRD');
      INSERT INTO bill_documents(id,bill_id,storage_key,content_type,byte_size) VALUES('${id('document')}','${id('bill')}','demo/seed-core-v1.txt','text/plain',23);
      INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,evidence_document_id) VALUES('${id('provider')}','${id('reviewer')}','verified','SYNTHETIC verification; not real accreditation','${id('document')}');
      INSERT INTO programs(id,organization_id,name,currency,status,allowed_categories,max_per_payment_minor) VALUES('${id('program')}','${id('sponsor')}','SYNTHETIC Outpatient Support','LRD','active',ARRAY['outpatient'],20000);
      INSERT INTO contributions(id,contributor_user_id,bill_id,amount_minor,currency,status,payment_reference) VALUES('${id('contribution')}','${id('family')}','${id('bill')}',4000,'LRD','pending','SYNTHETIC-CONTRIBUTION');
      INSERT INTO ai_runs(id,bill_id,document_id,mode,adapter_id,model_version,status,input_digest,output,confidence_bps,requires_review) VALUES('${id('ai')}','${id('bill')}','${id('document')}','sandbox','synthetic','fixture-v1','completed','synthetic-not-a-real-document','{"synthetic":true}',8500,true);
      INSERT INTO validation_findings(bill_id,ai_run_id,code,severity,message) VALUES('${id('bill')}','${id('ai')}','SYNTHETIC_REVIEW','warning','Synthetic bill requires reviewer confirmation');
      INSERT INTO review_cases(organization_id,bill_id,assigned_to,reason) VALUES('${id('clinic')}','${id('bill')}','${id('reviewer')}','SYNTHETIC validation review');
      INSERT INTO payment_intents(id,bill_id,amount_minor,currency,status,adapter_mode,idempotency_key,simulation_label) VALUES('${id('intent')}','${id('bill')}',4000,'LRD','awaiting_auth','sandbox','synthetic:intent:v1','SYNTHETIC — no real payment');
      INSERT INTO payment_attempts(payment_intent_id,attempt_number,idempotency_key,amount_minor,currency,adapter_mode,status,adapter_reference) VALUES('${id('intent')}',1,'synthetic:attempt:v1',4000,'LRD','sandbox','pending','SYNTHETIC-ATTEMPT');
      INSERT INTO notifications(user_id,channel,template,payload,idempotency_key) VALUES('${id('customer')}','in_app','synthetic_wallet_ready','{"synthetic":true}','synthetic:notification:v1');
      INSERT INTO disputes(opened_by,bill_id,payment_intent_id,amount_minor,currency,reason) VALUES('${id('customer')}','${id('bill')}','${id('intent')}',4000,'LRD','SYNTHETIC duplicate bill investigation');
    `);
    const sources = [
      ['personal_savings', '25000', 'available'],
      ['family_contributions', '12000', 'available'],
      ['employer_benefits', '50000', 'available'],
      ['sponsor_vouchers', '30000', 'restricted'],
      ['rewards', '5000', 'available'],
      ['partner_credit', '60000', 'pending'],
    ] as const;
    for (const [source, amount, bucket] of sources) {
      const program = source === 'sponsor_vouchers' || source === 'employer_benefits';
      await client.query(
        `INSERT INTO funding_allocations(id,wallet_id,source,currency,beneficiary_user_id,program_id,program_rule_version,allowed_categories,expires_at) VALUES($1,$2,$3,'LRD',$4,$5,$6,$7,now()+interval '1 year')`,
        [
          id(source),
          id('wallet-lrd'),
          source,
          id('customer'),
          program ? id('program') : null,
          program ? 1 : null,
          program ? ['outpatient'] : [],
        ],
      );
      await client.query(
        `INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) SELECT $1||':'||bucket,'LRD',$1::uuid,bucket,'liability','credit' FROM unnest(ARRAY['available','reserved','pending','restricted']) bucket`,
        [id(source)],
      );
      const debit = await ledger.clearing(client, 'LRD', 'receivable'),
        credit = await ledger.account(client, id(source), bucket);
      await ledger.postInTransaction(client, `synthetic:credit:${source}`, {
        currency: 'LRD',
        operation: 'funding_credit',
        description: 'SYNTHETIC platform allocation, not partner funds',
        lines: [
          { accountId: debit, side: 'debit', amountMinor: amount },
          { accountId: credit, side: 'credit', amountMinor: amount },
        ],
      });
    }
    await client.query(`
      INSERT INTO funding_allocations(id,wallet_id,source,currency,beneficiary_user_id) VALUES('${id('usd-savings')}','${id('wallet-usd')}','personal_savings','USD','${id('customer')}');
      INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side) SELECT '${id('usd-savings')}:'||bucket,'USD','${id('usd-savings')}',bucket,'liability','credit' FROM unnest(ARRAY['available','reserved','pending','restricted']) bucket;
      INSERT INTO vouchers(program_id,allocation_id,code_hash,amount_minor,currency,expires_at) VALUES('${id('program')}','${id('sponsor_vouchers')}','synthetic-nonredeemable-voucher',30000,'LRD',now()+interval '1 year');
      INSERT INTO credit_records(allocation_id,partner_organization_id,beneficiary_user_id,currency,principal_minor,fee_minor,status,terms_version,due_at) VALUES('${id('partner_credit')}','${id('partner')}','${id('customer')}','LRD',60000,0,'offered','synthetic-v1',now()+interval '90 days');
    `);
    await ledger.postInTransaction(client, 'synthetic:credit:usd', {
      currency: 'USD',
      operation: 'funding_credit',
      description: 'SYNTHETIC USD funds, separately denominated',
      lines: [
        {
          accountId: await ledger.clearing(client, 'USD', 'receivable'),
          side: 'debit',
          amountMinor: '10000',
        },
        {
          accountId: await ledger.account(client, id('usd-savings'), 'available'),
          side: 'credit',
          amountMinor: '10000',
        },
      ],
    });
    const reserve = await ledger.postInTransaction(client, 'synthetic:reserve', {
      currency: 'LRD',
      operation: 'reserve',
      description: 'SYNTHETIC pending care reservation',
      referenceType: 'payment_intent',
      referenceId: id('intent'),
      lines: [
        {
          accountId: await ledger.account(client, id('personal_savings'), 'available'),
          side: 'debit',
          amountMinor: '4000',
        },
        {
          accountId: await ledger.account(client, id('personal_savings'), 'reserved'),
          side: 'credit',
          amountMinor: '4000',
        },
      ],
    });
    await client.query(
      `INSERT INTO funding_reservations(allocation_id,payment_intent_id,amount_minor,currency,reserve_journal_id,expires_at) VALUES($1,$2,4000,'LRD',$3,now()+interval '15 minutes')`,
      [id('personal_savings'), id('intent'), reserve.journalId],
    );
    // Receipt is explicitly pending; no fictional evidence is labeled as live settlement.
    const settlement = await client.query(
      `INSERT INTO partner_settlements(payment_intent_id,journal_id,partner_organization_id,direction,amount_minor,currency,adapter_mode,status) VALUES($1,$2,$3,'outbound',4000,'LRD','sandbox','expected') RETURNING id`,
      [id('intent'), reserve.journalId, id('partner')],
    );
    await client.query(
      `INSERT INTO receipts(payment_intent_id,settlement_id,number,amount_minor,currency,status,issued_at) VALUES($1,$2,'SYNTHETIC-PENDING-001',4000,'LRD','pending',now())`,
      [id('intent'), settlement.rows[0].id],
    );
    await client.query(
      "INSERT INTO audit_events(event_type,entity_type,entity_id,payload) VALUES('synthetic.seeded','user',$1,'{\"synthetic\":true}')",
      [id('customer')],
    );
    return {
      customerId: id('customer'),
      walletId: id('wallet-lrd'),
      billId: id('bill'),
      paymentIntentId: id('intent'),
      synthetic: true,
    };
  });
}

type SyntheticProvider = {
  key: string;
  name: string;
  license: string;
  latitude: number;
  longitude: number;
  emergency: boolean;
  services: string[];
};

/**
 * Synthetic, clearly fictional providers with coordinates so "care you can
 * reach" suggestions have something to rank. No real facility, licence, or
 * accreditation is represented.
 */
export async function seedProviders(ledger: LedgerService, appEnv: string) {
  if (!['development', 'demo', 'test'].includes(appEnv))
    throw new Error('Synthetic provider seed is disabled outside development, demo and test.');
  const id = seedId;
  const rows: SyntheticProvider[] = [
    {
      key: 'jfk',
      name: 'SYNTHETIC John F. Kennedy Medical Center',
      license: 'SYNTH-JFK',
      latitude: 6.2905,
      longitude: -10.7686,
      emergency: true,
      services: ['emergency', 'outpatient', 'maternity'],
    },
    {
      key: 'redemption',
      name: 'SYNTHETIC Redemption Hospital',
      license: 'SYNTH-REDEMPTION',
      latitude: 6.3156,
      longitude: -10.8072,
      emergency: true,
      services: ['emergency', 'outpatient', 'pediatrics'],
    },
    {
      key: 'stjoseph',
      name: 'SYNTHETIC St. Joseph Catholic Hospital',
      license: 'SYNTH-STJOSEPH',
      latitude: 6.2833,
      longitude: -10.7769,
      emergency: true,
      services: ['emergency', 'maternity', 'diagnostics'],
    },
    {
      key: 'sinkor',
      name: 'SYNTHETIC Sinkor Community Clinic',
      license: 'SYNTH-SINKOR',
      latitude: 6.2921,
      longitude: -10.777,
      emergency: false,
      services: ['outpatient', 'diagnostics'],
    },
    {
      key: 'paynesville',
      name: 'SYNTHETIC Paynesville Health Center',
      license: 'SYNTH-PAYNESVILLE',
      latitude: 6.2798,
      longitude: -10.7167,
      emergency: false,
      services: ['outpatient', 'pediatrics'],
    },
    {
      key: 'waterside',
      name: 'SYNTHETIC Waterside Community Pharmacy',
      license: 'SYNTH-PHARMACY',
      latitude: 6.3164,
      longitude: -10.8097,
      emergency: false,
      services: ['pharmacy'],
    },
  ];
  return ledger.operation(
    'synthetic:providers:v2',
    'synthetic_seed',
    { version: 1 },
    async (client) => {
      const reviewer = id('reviewer');
      const verifier = id('verifier');
      for (const row of rows) {
        await client.query(
          `INSERT INTO organizations(id,name,kind,registration_number,created_by,status)
           VALUES($1,$2,'provider',$3,$4,'approved') ON CONFLICT (id) DO NOTHING`,
          [id(`provider-org:${row.key}`), row.name, `${row.license}-ORG`, reviewer],
        );
        await client.query(
          `INSERT INTO providers(id,organization_id,legal_name,license_number,status,latitude,longitude,emergency_ready,services)
           VALUES($1,$2,$3,$4,'verified',$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
          [
            id(`provider:${row.key}`),
            id(`provider-org:${row.key}`),
            row.name,
            row.license,
            row.latitude,
            row.longitude,
            row.emergency,
            row.services,
          ],
        );
      }
      // The original synthetic clinic gets a location and service tags too.
      await client.query(
        `UPDATE providers SET latitude=6.288,longitude=-10.772,emergency_ready=false,services=ARRAY['outpatient','consultation'] WHERE id=$1`,
        [id('provider')],
      );
      // The verification guard requires an independent platform_admin reviewer.
      // We grant that role only for the duration of this transaction so no
      // PlatformAdmin persists in the seeded database.
      await client.query(
        `INSERT INTO users(id,phone_e164,display_name) VALUES($1,'+999700000009','SYNTHETIC Independent Verifier') ON CONFLICT (id) DO NOTHING`,
        [verifier],
      );
      await client.query(
        `INSERT INTO user_roles(user_id,role) VALUES($1,'platform_admin') ON CONFLICT DO NOTHING`,
        [verifier],
      );
      // Registry-check verification so these appear in the verified directory.
      const providerIds = [...rows.map((r) => id(`provider:${r.key}`)), id('provider')];
      await client.query(
        `INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,method,evidence_reference,valid_until,verified_details)
         SELECT p.id,$1,'verified','SYNTHETIC registry check; not real accreditation','registry_check','SYNTHETIC-EVIDENCE',now()+interval '1 year',
                jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address)
         FROM providers p
         WHERE p.id = ANY($2::uuid[])`,
        [verifier, providerIds],
      );
      await client.query(`DELETE FROM user_roles WHERE user_id=$1 AND role='platform_admin'`, [
        verifier,
      ]);
      return { providers: rows.length + 1, synthetic: true };
    },
  );
}

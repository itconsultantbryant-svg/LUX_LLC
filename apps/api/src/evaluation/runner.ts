/**
 * Evaluation runner: executes the labeled dataset through the *real* pipeline.
 *
 * - Extraction cases run through the real `recordExtraction` service and the
 *   configured AI adapter, exactly as an uploaded bill would.
 * - Validation scenarios are seeded as isolated per-customer fixtures and run
 *   through the real `runValidation` engine, so the routing measured is the
 *   routing a customer would actually receive.
 *
 * Fixtures respect every database guard: ledger accounts start at zero and are
 * funded through real ledger postings, provider verification is written by an
 * independent platform reviewer, and bill confirmations are made by an active
 * provider staff member against a stored document. Nothing here bypasses the
 * financial or review controls the product relies on.
 *
 * It returns observations only; metric computation lives in `metrics.ts` and
 * is pure and unit-tested.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { isTriggering } from '@healthwallet/shared';
import type { AiAdapter } from '../adapters/types.js';
import type { LedgerService } from '../modules/ledger/service.js';
import { recordExtraction } from '../modules/extraction/service.js';
import { runValidation } from '../modules/validation/engine.js';
import { CRITICAL_FIELDS, EXTRACTION_CASES, SCENARIOS, type CriticalField } from './dataset.js';
import type {
  EvaluationInput,
  ExtractionObservation,
  FieldComparison,
  ScenarioObservation,
} from './metrics.js';

type ExtractionFields = Partial<Record<CriticalField, string | number | null>>;

function fieldsFromOutput(output: unknown): ExtractionFields {
  const fields = (output as { fields?: Record<string, unknown> } | null)?.fields ?? {};
  return {
    providerName: (fields.providerName as string | null) ?? null,
    customerName: (fields.customerName as string | null) ?? null,
    billReference: (fields.billReference as string | null) ?? null,
    serviceDate: (fields.serviceDate as string | null) ?? null,
    currency: (fields.currency as string | null) ?? null,
    totalAmountMinor: (fields.totalAmountMinor as number | null) ?? null,
  };
}

function toComparisons(expectancy: ExtractionFields, actual: ExtractionFields): FieldComparison[] {
  return CRITICAL_FIELDS.map((field) => {
    const expected = expectancy[field];
    const value = actual[field] ?? null;
    return {
      field,
      expected,
      actual: value,
      correct: expected === undefined ? null : expected === value,
    };
  });
}

let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter += 1;
  return `+9998${String(10_000_000 + phoneCounter).padStart(8, '0')}`;
}

function createUser(client: pg.PoolClient, displayName: string): Promise<string> {
  const userId = randomUUID();
  return client
    .query('INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,$3)', [
      userId,
      nextPhone(),
      displayName,
    ])
    .then(() => userId);
}

async function runExtractionCases(
  client: pg.PoolClient,
  adapter: AiAdapter,
  datasetCustomerId: string,
  observations: ExtractionObservation[],
): Promise<void> {
  for (const testCase of EXTRACTION_CASES) {
    const bytes =
      'bytes' in testCase.document
        ? Buffer.from(testCase.document.bytes)
        : Buffer.from(testCase.document.text, 'utf8');
    const contentType =
      'bytes' in testCase.document ? (testCase.document.contentType ?? 'text/plain') : 'text/plain';
    const storageKey = `evaluation/${testCase.id}.txt`;

    const bill = (
      await client.query<{ id: string }>(
        `INSERT INTO bills(customer_user_id,provider_name,currency,total_amount_minor,category)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [
          datasetCustomerId,
          testCase.bill.providerName,
          testCase.bill.currency,
          testCase.bill.totalAmountMinor,
          testCase.bill.category,
        ],
      )
    ).rows[0];
    const document = (
      await client.query<{ id: string }>(
        `INSERT INTO bill_documents(bill_id,storage_key,content_type,byte_size)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [bill.id, storageKey, contentType, bytes.byteLength],
      )
    ).rows[0];

    const started = performance.now();
    const extraction = await adapter.extractFromDocument({ storageKey, contentType, bytes });
    const latencyMs = performance.now() - started;

    const result = await recordExtraction(client, adapter, {
      billId: bill.id,
      documentId: document.id,
      storageKey,
      contentType,
      bytes,
    });

    const stored = (
      await client.query<{ output: unknown }>('SELECT output FROM ai_runs WHERE id=$1', [
        result.aiRunId,
      ])
    ).rows[0];

    observations.push({
      caseId: testCase.id,
      label: testCase.label,
      category: testCase.category,
      shouldFlag: testCase.expect.shouldFlag,
      requiresReview: result.requiresReview,
      status: result.status,
      findingCodes: result.findings.map((finding) => finding.code),
      fields: toComparisons(testCase.expect.criticalFields, fieldsFromOutput(stored?.output)),
      confidence: extraction.confidence,
      latencyMs,
      aiInvolved: true,
    });
  }
}

async function createScenarioCustomer(
  client: pg.PoolClient,
  ledger: LedgerService,
  currency: 'LRD' | 'USD',
  availableMinor: number,
  allowedCategories: string[],
): Promise<string> {
  const userId = await createUser(client, 'Evaluation customer');
  await client.query(
    "INSERT INTO consents(user_id,consent_type,granted,version) VALUES($1,'health_data',true,'eval-v1')",
    [userId],
  );
  const wallet = (
    await client.query<{ id: string }>(
      'INSERT INTO wallets(owner_user_id,currency) VALUES($1,$2) RETURNING id',
      [userId, currency],
    )
  ).rows[0];
  const allocation = (
    await client.query<{ id: string }>(
      `INSERT INTO funding_allocations(wallet_id,source,currency,beneficiary_user_id,allowed_categories)
       VALUES($1,'personal_savings',$2,$3,$4::text[]) RETURNING id`,
      [wallet.id, currency, userId, allowedCategories],
    )
  ).rows[0];
  for (const bucket of ['available', 'reserved', 'pending', 'restricted']) {
    await client.query(
      `INSERT INTO ledger_accounts(code,currency,allocation_id,bucket,kind,normal_side,balance_minor)
       VALUES($1,$2,$3,$4,'liability','credit',0)`,
      [`eval:${allocation.id}:${bucket}`, currency, allocation.id, bucket],
    );
  }
  if (availableMinor > 0) {
    await ledger.credit(`eval:funding:${allocation.id}`, {
      allocationId: allocation.id,
      amountMinor: String(availableMinor),
      currency,
      bucket: 'available',
      mode: 'sandbox',
    });
  }
  return userId;
}

async function createScenarioProvider(
  client: pg.PoolClient,
  input: {
    verified: boolean;
    creatorId: string;
    reviewerId: string;
    legalName: string;
    licenseNumber: string;
  },
): Promise<{ organizationId: string; providerId: string; staffUserId: string }> {
  const organization = (
    await client.query<{ id: string }>(
      `INSERT INTO organizations(id,name,kind,registration_number,created_by,status)
       VALUES($1,$2,'provider',$3,$4,'approved') RETURNING id`,
      [randomUUID(), input.legalName, `EVAL-${randomUUID().slice(0, 8)}`, input.creatorId],
    )
  ).rows[0];
  const provider = (
    await client.query<{ id: string }>(
      `INSERT INTO providers(id,organization_id,legal_name,license_number,status)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [
        randomUUID(),
        organization.id,
        input.legalName,
        input.licenseNumber,
        input.verified ? 'verified' : 'pending',
      ],
    )
  ).rows[0];
  if (input.verified) {
    await client.query(
      `INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,method,evidence_reference,verified_details,valid_until)
       VALUES($1,$2,'verified','Evaluation registry verification','registry_check','EVAL-REGISTRY-EVIDENCE',$3,now()+interval '180 days')`,
      [
        provider.id,
        input.reviewerId,
        JSON.stringify({ legalName: input.legalName, licenseNumber: input.licenseNumber }),
      ],
    );
  }
  const staffUserId = await createUser(client, 'Evaluation provider staff');
  await client.query(
    `INSERT INTO organization_memberships(organization_id,user_id,role,status)
     VALUES($1,$2,'provider_staff','active')`,
    [organization.id, staffUserId],
  );
  return { organizationId: organization.id, providerId: provider.id, staffUserId };
}

async function createScenarioBill(
  client: pg.PoolClient,
  input: {
    customerId: string;
    organizationId: string;
    providerId: string;
    staffUserId: string;
    providerName: string;
    currency: 'LRD' | 'USD';
    category: string;
    totalMinor: number;
    reference: string;
    issueDate: string;
    itemQuantity: number;
    itemUnitMinor: number;
    revisionTotalMinor: number;
    /** Unit used for the `bill_items` row; defaults to `itemUnitMinor`. */
    ledgerUnitMinor?: number;
  },
): Promise<string> {
  const bill = (
    await client.query<{ id: string }>(
      `INSERT INTO bills(customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        input.customerId,
        input.organizationId,
        input.providerName,
        input.currency,
        input.totalMinor,
        input.category,
      ],
    )
  ).rows[0];
  await client.query(
    `INSERT INTO bill_revisions(bill_id,revision,reference,issue_date,provider_id,provider_name,customer_user_id,currency,items,total_minor,requires_documents,confirmation_kind,author_user_id,reason)
     VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,false,'invoice',$6,'Evaluation fixture')`,
    [
      bill.id,
      input.reference,
      input.issueDate,
      input.providerId,
      input.providerName,
      input.customerId,
      input.currency,
      JSON.stringify([
        {
          description: 'Evaluation service line',
          quantity: input.itemQuantity,
          unitMinor: String(input.itemUnitMinor),
        },
      ]),
      String(input.revisionTotalMinor),
    ],
  );
  const ledgerUnit = input.ledgerUnitMinor ?? input.itemUnitMinor;
  await client.query(
    `INSERT INTO bill_items(bill_id,description,category,quantity,unit_amount_minor,total_amount_minor,currency)
     VALUES($1,'Evaluation service line',$2,$3,$4::bigint,$5::bigint,$6)`,
    [
      bill.id,
      input.category,
      input.itemQuantity,
      String(ledgerUnit),
      String(input.itemQuantity * ledgerUnit),
      input.currency,
    ],
  );
  const document = (
    await client.query<{ id: string }>(
      `INSERT INTO bill_documents(bill_id,revision_number,storage_key,content_type,byte_size)
       VALUES($1,1,$2,'text/plain',16) RETURNING id`,
      [bill.id, `evaluation/${bill.id}.txt`],
    )
  ).rows[0];
  await client.query(
    `INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,evidence_document_id,note)
     VALUES($1,1,'invoice',$2,$3,'Evaluation provider confirmation')`,
    [bill.id, input.staffUserId, document.id],
  );
  return bill.id;
}

async function runScenarios(
  client: pg.PoolClient,
  ledger: LedgerService,
  creatorId: string,
  reviewerId: string,
  observations: ScenarioObservation[],
): Promise<void> {
  for (const scenario of SCENARIOS) {
    const seed = scenario.seed;
    const customerId = await createScenarioCustomer(
      client,
      ledger,
      'LRD',
      seed.availableMinor,
      seed.allowedCategories,
    );
    const legalName = `Evaluation Clinic ${scenario.id}`;
    const provider = await createScenarioProvider(client, {
      verified: seed.providerVerified,
      creatorId,
      reviewerId,
      legalName,
      licenseNumber: `EVAL-LIC-${scenario.id}`,
    });

    const billInput = {
      customerId,
      organizationId: provider.organizationId,
      providerId: provider.providerId,
      staffUserId: provider.staffUserId,
      providerName: legalName,
      currency: 'LRD' as const,
      category: seed.category,
    };

    if (seed.priorBill) {
      await createScenarioBill(client, {
        ...billInput,
        totalMinor: seed.priorBill.totalMinor,
        reference: seed.priorBill.reference,
        issueDate: seed.priorBill.issueDate,
        itemQuantity: 1,
        itemUnitMinor: seed.priorBill.totalMinor,
        revisionTotalMinor: seed.priorBill.totalMinor,
      });
    }

    const billId = await createScenarioBill(client, {
      ...billInput,
      totalMinor: seed.totalMinor,
      reference: seed.reference,
      issueDate: seed.issueDate,
      itemQuantity: seed.itemQuantity,
      itemUnitMinor: seed.itemUnitMinor,
      revisionTotalMinor: seed.revisionTotalMinor,
      ledgerUnitMinor: seed.ledgerUnitMinor,
    });

    const outcome = await runValidation(client, { billId, actorUserId: customerId });
    const trigger = scenario.expectTrigger
      ? outcome.findings.find((finding) => finding.check === scenario.expectTrigger)
      : undefined;
    const detected =
      scenario.expectTrigger === ''
        ? !outcome.findings.some(isTriggering)
        : Boolean(trigger && isTriggering(trigger));

    observations.push({
      id: scenario.id,
      label: scenario.label,
      kind: scenario.kind,
      detected,
      route: outcome.route,
      expectedRoute: scenario.expectRoute,
      reviewRequired: outcome.route !== 'auto_accept',
      shouldFlag: scenario.expectTrigger !== '',
    });
  }
}

export async function runEvaluation(deps: {
  pool: pg.Pool;
  ledger: LedgerService;
  adapter: AiAdapter;
  datasetCustomerId: string;
  platformReviewerId: string;
}): Promise<EvaluationInput> {
  const client = await deps.pool.connect();
  try {
    const extraction: ExtractionObservation[] = [];
    await runExtractionCases(client, deps.adapter, deps.datasetCustomerId, extraction);
    const scenarios: ScenarioObservation[] = [];
    await runScenarios(
      client,
      deps.ledger,
      deps.datasetCustomerId,
      deps.platformReviewerId,
      scenarios,
    );
    return { datasetVersion: '', extraction, scenarios };
  } finally {
    client.release();
  }
}

import type pg from 'pg';
import type { AiExtractionResult } from '@healthwallet/shared';
import { IdentityError } from '../identity/service.js';

export type ValidationBill = {
  id: string;
  customer_user_id: string;
  dependent_id: string | null;
  provider_organization_id: string | null;
  category: string;
  status: string;
  currency: string | null;
  total_amount_minor: number | null;
  provider_name: string | null;
  confirmed_fields: Record<string, unknown> | null;
  validation_state: string | null;
};

export type ValidationRevision = {
  id: string;
  revision: number;
  reference: string;
  issue_date: string;
  provider_id: string;
  provider_name: string;
  currency: string;
  items: Array<{
    description: string;
    quantity: number;
    unitMinor: string;
    totalAmountMinor?: number;
  }>;
  total_minor: string;
  requires_documents: boolean;
  confirmation_kind: string;
};

export type ValidationItem = {
  description: string;
  category: string;
  quantity: number;
  unit_amount_minor: string;
  total_amount_minor: string;
  currency: string;
};

export type DuplicateCandidate = {
  id: string;
  status: string;
  total_amount_minor: string;
  currency: string;
  provider_organization_id: string | null;
  created_at: Date;
  reference: string | null;
  issue_date: string | null;
};

export type AllocationRow = {
  id: string;
  source: string;
  currency: string;
  status: string;
  allowed_categories: string[];
  allowed_provider_ids: string[];
  starts_at: Date | null;
  expires_at: Date | null;
  program_id: string | null;
  program_rule_version: number | null;
  rules: Record<string, unknown>;
  available_minor: string;
  program_status: string | null;
  program_allowed_categories: string[] | null;
  program_allowed_provider_ids: string[] | null;
  program_max_per_payment_minor: string | null;
  program_rule_version_current: number | null;
  program_starts_at: Date | null;
  program_expires_at: Date | null;
  program_rules: Record<string, unknown> | null;
};

export type AiRunRow = {
  id: string;
  adapter_id: string;
  model_version: string;
  output: AiExtractionResult | null;
  confidence_bps: number | null;
  requires_review: boolean;
};

export type CoverageRecord = {
  kind: 'voucher' | 'insurance';
  id: string;
  program_id: string | null;
  currency: string;
  amount_minor: string;
  allowed_categories: string[];
  allowed_provider_ids: string[];
  expires_at: Date | null;
  status: string;
};

export type ValidationContext = {
  bill: ValidationBill;
  revision: ValidationRevision | null;
  items: ValidationItem[];
  aiRun: AiRunRow | null;
  provider: {
    id: string;
    status: string;
    legal_name: string;
    license_number: string;
    organization_id: string;
  } | null;
  organizationStatus: string | null;
  latestVerification: {
    method: string;
    status: string;
    valid_until: Date | null;
    verified_details: Record<string, unknown> | null;
  } | null;
  customer: { id: string; suspended_at: Date | null; verification_status: string } | null;
  consents: Array<{ consent_type: string; granted: boolean; version: string }>;
  confirmations: Array<{ kind: string; revision: number }>;
  documents: Array<{ id: string; revision_number: number | null; content_type: string }>;
  allocations: AllocationRow[];
  coverage: CoverageRecord[];
  /** True when a verified insurance/policy dataset exists to check against. */
  insuranceDataset: boolean;
  /** True when a credible price comparison dataset exists to check against. */
  priceDataset: boolean;
  duplicates: DuplicateCandidate[];
  now: Date;
};

async function tableExists(client: pg.PoolClient, name: string): Promise<boolean> {
  const row = (
    await client.query<{ present: boolean }>('SELECT to_regclass($1) IS NOT NULL AS present', [
      name,
    ])
  ).rows[0];
  return Boolean(row?.present);
}

export async function loadValidationContext(
  client: pg.PoolClient,
  billId: string,
): Promise<ValidationContext> {
  const bill = (await client.query<ValidationBill>('SELECT * FROM bills WHERE id=$1', [billId]))
    .rows[0];
  if (!bill) throw new IdentityError(404, 'Record not found or access is not authorized.');

  const revision =
    (
      await client.query<ValidationRevision>(
        'SELECT * FROM bill_revisions WHERE bill_id=$1 ORDER BY revision DESC LIMIT 1',
        [billId],
      )
    ).rows[0] ?? null;
  const items = (
    await client.query<ValidationItem>(
      'SELECT description,category,quantity,unit_amount_minor::text,total_amount_minor::text,currency FROM bill_items WHERE bill_id=$1 ORDER BY created_at',
      [billId],
    )
  ).rows;
  const aiRun =
    (
      await client.query<AiRunRow>(
        "SELECT id,adapter_id,model_version,output,confidence_bps,requires_review FROM ai_runs WHERE bill_id=$1 AND status='completed' ORDER BY completed_at DESC NULLS LAST,id DESC LIMIT 1",
        [billId],
      )
    ).rows[0] ?? null;
  const provider = bill.provider_organization_id
    ? ((
        await client.query<NonNullable<ValidationContext['provider']>>(
          'SELECT id,status,legal_name,license_number,organization_id FROM providers WHERE organization_id=$1',
          [bill.provider_organization_id],
        )
      ).rows[0] ?? null)
    : null;
  const organizationStatus = provider
    ? ((
        await client.query<{ status: string }>('SELECT status FROM organizations WHERE id=$1', [
          provider.organization_id,
        ])
      ).rows[0]?.status ?? null)
    : null;
  const latestVerification = provider
    ? ((
        await client.query<NonNullable<ValidationContext['latestVerification']>>(
          'SELECT method,status,valid_until,verified_details FROM provider_verification_records WHERE provider_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
          [provider.id],
        )
      ).rows[0] ?? null)
    : null;

  const customer =
    (
      await client.query<NonNullable<ValidationContext['customer']>>(
        'SELECT id,suspended_at,verification_status FROM users WHERE id=$1',
        [bill.customer_user_id],
      )
    ).rows[0] ?? null;
  const consents = (
    await client.query<ValidationContext['consents'][number]>(
      'SELECT consent_type,granted,version FROM consents WHERE user_id=$1 ORDER BY created_at DESC',
      [bill.customer_user_id],
    )
  ).rows;
  const confirmations = (
    await client.query<ValidationContext['confirmations'][number]>(
      'SELECT kind,revision FROM bill_confirmations WHERE bill_id=$1',
      [billId],
    )
  ).rows;
  const documents = (
    await client.query<ValidationContext['documents'][number]>(
      'SELECT id,revision_number,content_type FROM bill_documents WHERE bill_id=$1 ORDER BY created_at',
      [billId],
    )
  ).rows;

  const allocations = bill.currency
    ? (
        await client.query<AllocationRow>(
          `SELECT f.id,f.source,f.currency,f.status,f.allowed_categories,f.allowed_provider_ids,
                  f.starts_at,f.expires_at,f.program_id,f.program_rule_version,f.rules,
                  COALESCE((SELECT sum(a.balance_minor) FROM ledger_accounts a WHERE a.allocation_id=f.id AND a.bucket='available'),0)::text AS available_minor,
                  p.status AS program_status,
                  p.allowed_categories AS program_allowed_categories,
                  p.allowed_provider_ids AS program_allowed_provider_ids,
                  p.max_per_payment_minor::text AS program_max_per_payment_minor,
                  p.rule_version AS program_rule_version_current,
                  p.starts_at AS program_starts_at,
                  p.expires_at AS program_expires_at,
                  p.rules AS program_rules
           FROM funding_allocations f
           LEFT JOIN programs p ON p.id=f.program_id
           WHERE f.beneficiary_user_id=$1
             AND f.currency=$2
             AND f.dependent_id IS NOT DISTINCT FROM $3::uuid
           ORDER BY f.created_at`,
          [bill.customer_user_id, bill.currency, bill.dependent_id],
        )
      ).rows
    : [];

  const insuranceDataset = await tableExists(client, 'insurance_policies');
  const priceDataset = await tableExists(client, 'price_references');

  const coverage: CoverageRecord[] = [];
  const vouchers = (
    await client.query<{
      id: string;
      program_id: string | null;
      allocation_id: string;
      currency: string;
      amount_minor: string;
      status: string;
      expires_at: Date | null;
      allowed_categories: string[] | null;
      allowed_provider_ids: string[] | null;
    }>(
      `SELECT v.id,v.program_id,v.allocation_id,v.currency,v.amount_minor::text,v.status,v.expires_at,
              p.allowed_categories,p.allowed_provider_ids
       FROM vouchers v
       JOIN funding_allocations f ON f.id=v.allocation_id
       LEFT JOIN programs p ON p.id=v.program_id
       WHERE f.beneficiary_user_id=$1 AND v.currency=$2`,
      [bill.customer_user_id, bill.currency ?? ''],
    )
  ).rows;
  for (const v of vouchers)
    coverage.push({
      kind: 'voucher',
      id: v.id,
      program_id: v.program_id,
      currency: v.currency,
      amount_minor: v.amount_minor,
      allowed_categories: v.allowed_categories ?? [],
      allowed_provider_ids: v.allowed_provider_ids ?? [],
      expires_at: v.expires_at,
      status: v.status,
    });

  const duplicates = (
    await client.query<DuplicateCandidate>(
      `SELECT b.id,b.status,b.total_amount_minor::text,b.currency,b.provider_organization_id,b.created_at,
              (SELECT reference FROM bill_revisions r WHERE r.bill_id=b.id ORDER BY revision DESC LIMIT 1) AS reference,
              (SELECT issue_date FROM bill_revisions r WHERE r.bill_id=b.id ORDER BY revision DESC LIMIT 1) AS issue_date
       FROM bills b
       WHERE b.id<>$1 AND b.customer_user_id=$2 AND b.currency=$3 AND b.status<>'failed'
       ORDER BY b.created_at DESC
       LIMIT 200`,
      [billId, bill.customer_user_id, bill.currency],
    )
  ).rows;

  return {
    bill,
    revision,
    items,
    aiRun,
    provider,
    organizationStatus,
    latestVerification,
    customer,
    consents,
    confirmations,
    documents,
    allocations,
    coverage,
    insuranceDataset,
    priceDataset,
    duplicates,
    now: new Date(),
  };
}

import { z } from 'zod';
import type pg from 'pg';
import { Access, missing } from '../security/access.js';
import { IdentityError } from '../identity/service.js';
export const staffRoles = ['provider_staff', 'provider_manager', 'organization_admin'];
export const managerRoles = ['provider_manager', 'organization_admin'];
export const ItemSchema = z
  .object({
    description: z.string().trim().min(1).max(300),
    quantity: z.number().int().min(1).max(10000),
    unitMinor: z.string().regex(/^(0|[1-9][0-9]{0,9})$/),
  })
  .strict();
export const InvoiceSchema = z
  .object({
    reference: z.string().trim().min(1).max(80),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
    currency: z.enum(['LRD', 'USD']),
    category: z.enum(['general', 'consultation', 'medication', 'diagnostics']),
    items: z.array(ItemSchema).min(1).max(100),
    requiresDocuments: z.boolean().default(true),
    confirmationKind: z.enum(['invoice', 'service']).default('invoice'),
  })
  .strict();
export type Invoice = z.infer<typeof InvoiceSchema>;
export function total(items: z.infer<typeof ItemSchema>[]): string {
  const value = items.reduce((sum, i) => sum + BigInt(i.quantity) * BigInt(i.unitMinor), 0n);
  if (value <= 0n || value > 2147483647n)
    throw new IdentityError(
      400,
      'Bill total must be positive and no more than 2,147,483,647 minor units.',
    );
  return value.toString();
}
export async function provider(a: Access, id: string, manager = false) {
  const p = (await a.client.query('SELECT * FROM providers WHERE id=$1', [id])).rows[0];
  if (!p) throw missing();
  await a.organization(p.organization_id, manager ? managerRoles : staffRoles);
  return p;
}
export async function billAccess(a: Access, id: string, write = false) {
  const b = (await a.client.query('SELECT * FROM bills WHERE id=$1', [id])).rows[0];
  if (!b) throw missing();
  const customer = await a.customer(
    b.customer_user_id,
    b.dependent_id,
    write ? 'records:write' : 'records:read',
  );
  if (!customer) {
    if (!b.provider_organization_id) throw missing();
    await a.organization(b.provider_organization_id, staffRoles);
  }
  const locked = (
    await a.client.query(
      `SELECT * FROM bills WHERE id=$1 ${write ? 'FOR NO KEY UPDATE' : 'FOR SHARE'}`,
      [id],
    )
  ).rows[0];
  return { bill: locked, customer };
}
export async function latest(c: pg.PoolClient, billId: string) {
  const r = (
    await c.query('SELECT * FROM bill_revisions WHERE bill_id=$1 ORDER BY revision DESC LIMIT 1', [
      billId,
    ])
  ).rows[0];
  if (!r)
    throw new IdentityError(
      409,
      'This legacy bill requires a versioned invoice before continuing.',
    );
  return r;
}
export async function writeRevision(
  a: Access,
  billId: string,
  providerId: string,
  invoice: Invoice,
  reason: string,
  expected: number,
) {
  const b = (await a.client.query('SELECT * FROM bills WHERE id=$1 FOR NO KEY UPDATE', [billId]))
    .rows[0];
  const last = (
    await a.client.query(
      'SELECT revision FROM bill_revisions WHERE bill_id=$1 ORDER BY revision DESC LIMIT 1',
      [billId],
    )
  ).rows[0];
  if ((last?.revision ?? 0) !== expected)
    throw new IdentityError(409, 'The bill changed. Refresh and review the latest version.');
  if (
    (await a.client.query('SELECT id FROM payment_intents WHERE bill_id=$1 LIMIT 1', [billId]))
      .rowCount
  )
    throw new IdentityError(
      409,
      'A payment request exists. Submit a correction for review; the original invoice cannot be changed.',
    );
  if (expected && b.currency !== invoice.currency)
    throw new IdentityError(
      409,
      'Currency cannot be amended. Submit a correction and create a replacement invoice.',
    );
  const p = (
    await a.client.query('SELECT legal_name,organization_id FROM providers WHERE id=$1 FOR SHARE', [
      providerId,
    ])
  ).rows[0];
  if (!p || p.organization_id !== b.provider_organization_id) throw missing();
  const amount = total(invoice.items);
  const revision = expected + 1;
  await a.client.query(
    `INSERT INTO bill_revisions(bill_id,revision,reference,issue_date,provider_id,provider_name,customer_user_id,currency,items,total_minor,requires_documents,confirmation_kind,author_user_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      billId,
      revision,
      invoice.reference,
      invoice.issueDate,
      providerId,
      p.legal_name,
      b.customer_user_id,
      invoice.currency,
      JSON.stringify(invoice.items),
      amount,
      invoice.requiresDocuments,
      invoice.confirmationKind,
      a.actor.id,
      reason,
    ],
  );
  await a.client.query('DELETE FROM bill_items WHERE bill_id=$1', [billId]);
  for (const item of invoice.items)
    await a.client.query(
      'INSERT INTO bill_items(bill_id,description,category,quantity,unit_amount_minor,total_amount_minor,currency) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        billId,
        item.description,
        invoice.category,
        item.quantity,
        item.unitMinor,
        (BigInt(item.quantity) * BigInt(item.unitMinor)).toString(),
        invoice.currency,
      ],
    );
  await a.client.query(
    "UPDATE bills SET provider_name=$2,total_amount_minor=$3,currency=$4,category=$5,status='draft',updated_at=now() WHERE id=$1",
    [billId, p.legal_name, amount, invoice.currency, invoice.category],
  );
  await a.audit('provider.bill_revision_created', 'bill', billId, { revision, reason });
  return { billId, revision, totalMinor: amount, currency: invoice.currency };
}
export async function directory(c: pg.PoolClient) {
  return (
    await c.query(
      `SELECT p.id,p.organization_id,p.legal_name,p.license_number,p.address,v.valid_until FROM providers p JOIN organizations o ON o.id=p.organization_id JOIN LATERAL (SELECT * FROM provider_verification_records WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) v ON true WHERE p.status='verified' AND o.status='approved' AND v.status='verified' AND v.method='registry_check' AND v.valid_until>now() AND v.verified_details=jsonb_build_object('legalName',p.legal_name,'licenseNumber',p.license_number,'address',p.address) ORDER BY p.legal_name,p.id LIMIT 500`,
    )
  ).rows;
}

/**
 * Gate a bill for payment authorization and return its (existing or new)
 * payment intent. AI validation stays separate from financial authorization: a
 * bill may only reach payment when validation auto-accepted it or a reviewer
 * explicitly approved it after the run. Reuses any non-terminal intent.
 */
export async function ensurePayableIntent(
  client: pg.PoolClient,
  bill: { id: string; extraction_reviewed_at: Date | null },
  revision: { total_minor: string; currency: string },
  opts: { adapterMode: 'sandbox' | 'live'; appEnv: string; key: string },
): Promise<{ id: string; status: string; amountMinor: string; created: boolean }> {
  const latestRun = (
    await client.query<{ requires_review: boolean }>(
      "SELECT requires_review FROM ai_runs WHERE bill_id=$1 AND status='completed' ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1",
      [bill.id],
    )
  ).rows[0];
  if (latestRun?.requires_review && !bill.extraction_reviewed_at)
    throw new IdentityError(409, 'Confirm the extracted bill fields before requesting payment.');
  const validation = (
    await client.query<{ route: string; created_at: Date }>(
      'SELECT route,created_at FROM validation_runs WHERE bill_id=$1 ORDER BY created_at DESC LIMIT 1',
      [bill.id],
    )
  ).rows[0];
  if (validation && validation.route !== 'auto_accept') {
    const approved = (
      await client.query(
        "SELECT 1 FROM validation_reviewer_actions WHERE bill_id=$1 AND action='approve' AND created_at>$2 LIMIT 1",
        [bill.id, validation.created_at],
      )
    ).rowCount;
    if (!approved)
      throw new IdentityError(
        409,
        'This bill is not ready for payment authorization. Complete validation or review first.',
      );
  }
  await client.query('SELECT assert_provider_payable($1)', [bill.id]);
  const prior = (
    await client.query<{ id: string; status: string; amount_minor: string }>(
      "SELECT id,status,amount_minor FROM payment_intents WHERE bill_id=$1 AND status NOT IN ('failed','cancelled') LIMIT 1",
      [bill.id],
    )
  ).rows[0];
  if (prior)
    return { id: prior.id, status: prior.status, amountMinor: prior.amount_minor, created: false };
  if (opts.appEnv === 'production' && opts.adapterMode !== 'live')
    throw new IdentityError(503, 'Live healthcare payments are not connected. No funds moved.');
  const intent = (
    await client.query<{ id: string; status: string; amount_minor: string }>(
      "INSERT INTO payment_intents(bill_id,amount_minor,currency,status,adapter_mode,idempotency_key,simulation_label) VALUES($1,$2,$3,'awaiting_auth',$4,$5,$6) RETURNING id,status,amount_minor",
      [
        bill.id,
        revision.total_minor,
        revision.currency,
        opts.adapterMode,
        opts.key,
        opts.adapterMode === 'sandbox'
          ? 'SIMULATION — payment request only; no real money moved'
          : null,
      ],
    )
  ).rows[0];
  return { id: intent.id, status: intent.status, amountMinor: intent.amount_minor, created: true };
}

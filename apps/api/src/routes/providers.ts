import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, missing, withSession } from '../modules/security/access.js';
import { IdentityError, tokenHash } from '../modules/identity/service.js';
import { limit } from '../modules/security/limits.js';
import { sessionToken } from './identity.js';
import { FundingService } from '../modules/funding/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import {
  InvoiceSchema,
  ItemSchema,
  total,
  provider,
  billAccess,
  latest,
  writeRevision,
  directory,
  ensurePayableIntent,
  staffRoles,
  managerRoles,
} from '../modules/providers/service.js';
const uuid = z.uuid();
const key = z.uuid();
const note = z.string().trim().min(8).max(2000);
const id = (r: FastifyRequest) => z.object({ id: uuid }).parse(r.params).id;
export const providerRoutes: FastifyPluginAsync = async (app) => {
  const once = new FundingService(
    new LedgerService(app.ctx.pool),
    app.ctx.adapters.funding,
    app.ctx.env.APP_ENV,
  );
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        message: 'Check required fields, valid dates, whole-unit quantities and exact prices.',
      });
    if (
      e &&
      typeof e === 'object' &&
      'code' in e &&
      ['23514', '23505', '23503'].includes(String(e.code))
    )
      return reply.code(409).send({
        message:
          'The record conflicts with an existing bill or lacks current verification, evidence, or confirmation. Refresh and review before retrying.',
      });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Provider operation failed',
    );
    return reply.code(503).send({
      message: 'The provider service is temporarily unavailable. Retry using the same details.',
    });
  });
  const route = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) => {
        if (method !== 'GET') await limit(app.ctx.pool, 'provider-mutation', r.ip, 100, 900);
        return withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r));
      },
    });
  route('GET', '/api/providers/directory', async (a) => ({ providers: await directory(a.client) }));
  route('GET', '/api/provider/portal', async (a) => {
    a.mfa();
    const organizations = (
      await a.client.query(
        `SELECT DISTINCT o.id,o.name,m.role FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.status='active' AND o.kind='provider' AND o.status='approved' AND m.role=ANY($2::text[])`,
        [a.actor.id, staffRoles],
      )
    ).rows;
    const profiles = (
      await a.client.query(`SELECT p.* FROM providers p WHERE p.organization_id=ANY($1::uuid[])`, [
        organizations.map((o) => o.id),
      ])
    ).rows;
    return { organizations, providers: profiles };
  });
  route('POST', '/api/provider/profiles', async (a, r) => {
    const b = z
      .object({
        organizationId: uuid,
        legalName: z.string().trim().min(2).max(200),
        licenseNumber: z.string().trim().min(2).max(80),
        address: z
          .object({
            line: z.string().trim().min(2).max(300),
            phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
          })
          .strict(),
      })
      .strict()
      .parse(r.body);
    await a.organization(b.organizationId, managerRoles);
    const org = (
      await a.client.query("SELECT id FROM organizations WHERE id=$1 AND kind='provider'", [
        b.organizationId,
      ])
    ).rows[0];
    if (!org) throw missing();
    const p = (
      await a.client.query(
        `INSERT INTO providers(organization_id,legal_name,license_number,address) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET legal_name=$2,license_number=$3,address=$4,status=CASE WHEN (providers.legal_name,providers.license_number,providers.address) IS DISTINCT FROM ($2,$3,$4::jsonb) THEN 'pending' ELSE providers.status END RETURNING *`,
        [b.organizationId, b.legalName, b.licenseNumber, JSON.stringify(b.address)],
      )
    ).rows[0];
    await a.audit('provider.profile_updated', 'provider', p.id);
    return { provider: p, message: 'Changes to licensed details require fresh verification.' };
  });
  route('GET', '/api/provider/profiles/:id', async (a, r) => {
    const p = await provider(a, id(r));
    return {
      provider: p,
      reviews: (
        await a.client.query(
          'SELECT id,status,note,evidence_reference,valid_until,created_at FROM provider_verification_records WHERE provider_id=$1 ORDER BY created_at DESC',
          [p.id],
        )
      ).rows,
    };
  });
  route('GET', '/api/admin/providers', async (a) => {
    a.platform();
    return {
      providers: (
        await a.client.query(
          `SELECT p.*,o.name AS organization_name,o.status AS organization_status,
                  (o.created_by=$1 OR EXISTS(SELECT 1 FROM organization_memberships m
                    WHERE m.organization_id=o.id AND m.user_id=$1)) AS self_owned
             FROM providers p JOIN organizations o ON o.id=p.organization_id
            ORDER BY (o.status<>'approved'), (p.status='verified'), p.created_at DESC LIMIT 200`,
          [a.actor.id],
        )
      ).rows,
    };
  });
  route('POST', '/api/admin/providers/:id/reviews', async (a, r) => {
    a.platform();
    const b = z
      .object({
        status: z.enum(['verified', 'rejected', 'suspended']),
        note,
        evidenceReference: z.string().trim().min(8).max(500),
        validDays: z.number().int().min(1).max(365),
      })
      .strict()
      .parse(r.body);
    const p = (await a.client.query('SELECT * FROM providers WHERE id=$1 FOR UPDATE', [id(r)]))
      .rows[0];
    if (!p) throw missing();
    const org = (
      await a.client.query<{ status: string }>('SELECT status FROM organizations WHERE id=$1', [
        p.organization_id,
      ])
    ).rows[0];
    // The customer directory only shows providers whose organization is
    // approved, so verifying a provider under a pending organization would
    // silently hide it. Make the dependency explicit instead of failing quietly.
    if (b.status === 'verified' && org?.status !== 'approved')
      throw new IdentityError(
        409,
        'Approve this provider’s organization before verifying the provider, so it becomes visible to customers.',
      );
    const conflict = await a.client.query(
      'SELECT id FROM organizations WHERE id=$1 AND (created_by=$2 OR EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2))',
      [p.organization_id, a.actor.id],
    );
    if (conflict.rowCount)
      throw new IdentityError(
        403,
        'An independent authorized verifier must review your organization.',
      );
    await a.client.query(
      `INSERT INTO provider_verification_records(provider_id,reviewer_user_id,status,note,method,evidence_reference,verified_details,valid_until,created_at) VALUES($1,$2,$3,$4,'registry_check',$5,$6,clock_timestamp()+$7*interval '1 day',clock_timestamp())`,
      [
        p.id,
        a.actor.id,
        b.status,
        b.note,
        b.evidenceReference,
        JSON.stringify({
          legalName: p.legal_name,
          licenseNumber: p.license_number,
          address: p.address,
        }),
        b.validDays,
      ],
    );
    await a.client.query('UPDATE providers SET status=$2 WHERE id=$1', [p.id, b.status]);
    await a.audit('provider.verification_reviewed', 'provider', p.id, { status: b.status });
    return { status: b.status };
  });
  route('POST', '/api/care/association', async (a, r) => {
    const b = z.object({ providerId: uuid, dependentId: uuid.optional() }).strict().parse(r.body);
    const matches = await directory(a.client);
    if (!matches.some((p) => p.id === b.providerId))
      throw new IdentityError(409, 'Select a currently verified provider.');
    if (!(await a.customer(a.actor.id, b.dependentId ?? null, 'records:write'))) throw missing();
    const token = randomBytes(32).toString('hex');
    const row = (
      await a.client.query(
        "INSERT INTO provider_associations(token_hash,customer_user_id,dependent_id,provider_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes') RETURNING expires_at",
        [tokenHash(token), a.actor.id, b.dependentId ?? null, b.providerId],
      )
    ).rows[0];
    return {
      token,
      expiresAt: row.expires_at,
      message:
        'Give this one-use code only to the selected provider. It permits creation of one bill, not payment or general record access.',
    };
  });
  route('POST', '/api/provider/bills', async (a, r) => {
    const b = z
      .object({
        key,
        providerId: uuid,
        associationToken: z.string().regex(/^[a-f0-9]{64}$/),
        invoice: InvoiceSchema,
      })
      .strict()
      .parse(r.body);
    const p = await provider(a, b.providerId);
    return once.once(a.client, a.actor.id, b.key, 'provider-bill', b, async () => {
      const association = (
        await a.client.query(
          'SELECT * FROM provider_associations WHERE token_hash=$1 AND provider_id=$2 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE',
          [tokenHash(b.associationToken), p.id],
        )
      ).rows[0];
      if (!association)
        throw new IdentityError(
          409,
          'Customer association code is expired, used, or belongs to another provider.',
        );
      const customer = (
        await a.client.query(
          'SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL FOR SHARE',
          [association.customer_user_id],
        )
      ).rows[0];
      if (!customer) throw missing();
      const bill = (
        await a.client.query(
          'INSERT INTO bills(customer_user_id,dependent_id,provider_organization_id,provider_name,currency,total_amount_minor,category) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            customer.id,
            association.dependent_id,
            p.organization_id,
            p.legal_name,
            b.invoice.currency,
            total(b.invoice.items),
            b.invoice.category,
          ],
        )
      ).rows[0];
      await a.client.query('UPDATE provider_associations SET consumed_at=now() WHERE id=$1', [
        association.id,
      ]);
      return writeRevision(a, bill.id, p.id, b.invoice, 'Initial provider invoice', 0);
    });
  });
  route('POST', '/api/care/intake', async (a, r) => {
    const b = z.object({ key, providerId: uuid, invoice: InvoiceSchema }).strict().parse(r.body);
    const p = (await directory(a.client)).find((p) => p.id === b.providerId);
    if (!p) throw new IdentityError(409, 'Select a currently verified provider.');
    return once.once(a.client, a.actor.id, b.key, 'customer-intake', b, async () => {
      const bill = (
        await a.client.query(
          'INSERT INTO bills(customer_user_id,provider_organization_id,provider_name,currency,total_amount_minor,category) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            a.actor.id,
            p.organization_id,
            p.legal_name,
            b.invoice.currency,
            total(b.invoice.items),
            b.invoice.category,
          ],
        )
      ).rows[0];
      return writeRevision(
        a,
        bill.id,
        p.id,
        { ...b.invoice, requiresDocuments: true },
        'Customer-uploaded invoice; authenticity not yet confirmed',
        0,
      );
    });
  });
  route('GET', '/api/provider/profiles/:id/bills', async (a, r) => {
    const p = await provider(a, id(r));
    return {
      bills: (
        await a.client.query(
          'SELECT b.id,b.customer_user_id,b.status,b.currency,b.total_amount_minor,b.provider_name,r.reference,r.revision,r.issue_date FROM bills b LEFT JOIN LATERAL(SELECT * FROM bill_revisions WHERE bill_id=b.id ORDER BY revision DESC LIMIT 1) r ON true WHERE b.provider_organization_id=$1 ORDER BY b.created_at DESC LIMIT 100',
          [p.organization_id],
        )
      ).rows,
    };
  });
  route('GET', '/api/care/bills', async (a) => ({
    bills: (
      await a.client.query(
        'SELECT b.id,b.status,b.currency,b.total_amount_minor,b.provider_name,r.reference,r.revision,r.issue_date FROM bills b LEFT JOIN LATERAL(SELECT * FROM bill_revisions WHERE bill_id=b.id ORDER BY revision DESC LIMIT 1) r ON true WHERE b.customer_user_id=$1 ORDER BY b.created_at DESC LIMIT 100',
        [a.actor.id],
      )
    ).rows,
  }));
  route('GET', '/api/care/bills/:id', async (a, r) => {
    const { bill, customer } = await billAccess(a, id(r));
    return {
      bill,
      customer,
      revisions: (
        await a.client.query(
          'SELECT * FROM bill_revisions WHERE bill_id=$1 ORDER BY revision DESC',
          [bill.id],
        )
      ).rows,
      documents: (
        await a.client.query(
          'SELECT id,content_type,byte_size,revision_number,created_at FROM bill_documents WHERE bill_id=$1 ORDER BY created_at',
          [bill.id],
        )
      ).rows,
      confirmations: (
        await a.client.query(
          'SELECT id,revision,kind,note,created_at FROM bill_confirmations WHERE bill_id=$1',
          [bill.id],
        )
      ).rows,
      payments: (
        await a.client.query(
          'SELECT id,status,amount_minor,currency,adapter_mode,created_at FROM payment_intents WHERE bill_id=$1 ORDER BY created_at DESC',
          [bill.id],
        )
      ).rows,
      receipts: (
        await a.client.query(
          "SELECT r.id,r.number,r.amount_minor,r.currency,r.issued_at,p.adapter_mode FROM receipts r JOIN payment_intents p ON p.id=r.payment_intent_id WHERE p.bill_id=$1 AND r.status='issued'",
          [bill.id],
        )
      ).rows,
      disputes: (
        await a.client.query(
          'SELECT id,status,reason,amount_minor,currency,created_at FROM disputes WHERE bill_id=$1',
          [bill.id],
        )
      ).rows,
      corrections: (
        await a.client.query('SELECT * FROM bill_corrections WHERE bill_id=$1', [bill.id])
      ).rows,
      changes: (
        await a.client.query(
          'SELECT * FROM bill_change_history WHERE bill_id=$1 ORDER BY created_at DESC',
          [bill.id],
        )
      ).rows,
    };
  });
  route('POST', '/api/provider/bills/:id/amend', async (a, r) => {
    const b = z
      .object({
        key,
        expectedRevision: z.number().int().positive(),
        reason: note,
        invoice: InvoiceSchema,
      })
      .strict()
      .parse(r.body);
    const { bill } = await billAccess(a, id(r), true);
    await a.organization(bill.provider_organization_id, staffRoles);
    return once.once(
      a.client,
      a.actor.id,
      b.key,
      'bill-amendment',
      { ...b, billId: bill.id },
      async () => {
        const rev = await latest(a.client, bill.id);
        return writeRevision(a, bill.id, rev.provider_id, b.invoice, b.reason, b.expectedRevision);
      },
    );
  });
  route('POST', '/api/care/bills/:id/confirm', async (a, r) => {
    const b = z
      .object({ expectedRevision: z.number().int().positive(), accepted: z.literal(true) })
      .strict()
      .parse(r.body);
    const { bill, customer } = await billAccess(a, id(r), true);
    if (!customer)
      throw new IdentityError(
        403,
        'Only the customer or an authorized caregiver can accept this bill.',
      );
    const rev = await latest(a.client, bill.id);
    if (rev.revision !== b.expectedRevision)
      throw new IdentityError(409, 'Bill changed. Review the latest provider and total.');
    await a.client.query(
      "INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,note) VALUES($1,$2,'customer',$3,'Customer reviewed provider, currency, items and total') ON CONFLICT DO NOTHING",
      [bill.id, rev.revision, a.actor.id],
    );
    await a.audit('bill.customer_reviewed', 'bill', bill.id, { revision: rev.revision });
    return { accepted: true };
  });
  route('GET', '/api/care/bills/:id/extraction', async (a, r) => {
    const { bill } = await billAccess(a, id(r));
    const run = (
      await a.client.query<{
        id: string;
        adapter_id: string;
        model_version: string;
        output: { fields?: Record<string, unknown>; unreadable?: boolean; ambiguous?: string[] };
        confidence_bps: number | null;
        requires_review: boolean;
        completed_at: string | null;
      }>(
        "SELECT id,adapter_id,model_version,output,confidence_bps,requires_review,completed_at FROM ai_runs WHERE bill_id=$1 AND status='completed' ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1",
        [bill.id],
      )
    ).rows[0];
    const findings = run
      ? (
          await a.client.query(
            'SELECT id,code,severity,message,field,resolved_at FROM validation_findings WHERE ai_run_id=$1 ORDER BY created_at',
            [run.id],
          )
        ).rows
      : [];
    const corrections = (
      await a.client.query(
        'SELECT id,field,original_value,corrected_value,reason,created_at FROM extraction_corrections WHERE bill_id=$1 ORDER BY created_at',
        [bill.id],
      )
    ).rows;
    return {
      billId: bill.id,
      reviewedAt: bill.extraction_reviewed_at,
      unreadable: run?.output?.unreadable ?? null,
      requiresReview: run?.requires_review ?? false,
      ambiguous: run?.output?.ambiguous ?? [],
      extractedFields: run?.output?.fields ?? null,
      confidenceBps: run?.confidence_bps ?? null,
      adapterId: run?.adapter_id ?? null,
      findings,
      corrections,
      confirmedFields: bill.confirmed_fields,
    };
  });
  route('POST', '/api/care/bills/:id/extraction-review', async (a, r) => {
    const b = z
      .object({
        key,
        corrections: z
          .array(
            z
              .object({
                field: z.string().trim().min(1).max(80),
                value: z.union([z.string().max(300), z.number(), z.null()]),
                note: z.string().trim().max(500).optional(),
              })
              .strict(),
          )
          .max(50)
          .default([]),
        reason: z.string().trim().max(500).optional(),
      })
      .strict()
      .parse(r.body);
    const { bill, customer } = await billAccess(a, id(r), true);
    if (!customer)
      throw new IdentityError(
        403,
        'Only the customer or an authorized caregiver can review extracted fields.',
      );
    return once.once(
      a.client,
      a.actor.id,
      b.key,
      'extraction-review',
      { ...b, billId: bill.id },
      async () => {
        const run = (
          await a.client.query<{ id: string; output: { fields?: Record<string, unknown> } | null }>(
            "SELECT id, output FROM ai_runs WHERE bill_id=$1 AND status='completed' ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1",
            [bill.id],
          )
        ).rows[0];
        const extracted = (run?.output?.fields ?? {}) as Record<string, unknown>;
        for (const correction of b.corrections) {
          await a.client.query(
            `INSERT INTO extraction_corrections
               (bill_id, ai_run_id, field, original_value, corrected_value, actor_user_id, reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              bill.id,
              run?.id ?? null,
              correction.field,
              JSON.stringify(extracted[correction.field] ?? null),
              JSON.stringify(correction.value ?? null),
              a.actor.id,
              correction.note ?? b.reason ?? null,
            ],
          );
        }
        const confirmedFields: Record<string, unknown> = { ...extracted };
        for (const correction of b.corrections)
          confirmedFields[correction.field] = correction.value;
        await a.client.query(
          `UPDATE bills SET confirmed_fields=$2, extraction_reviewed_at=now(), extraction_reviewed_by=$3, status=$4, updated_at=now() WHERE id=$1`,
          [
            bill.id,
            JSON.stringify(confirmedFields),
            a.actor.id,
            bill.status === 'needs_review' ? 'user_review' : bill.status,
          ],
        );
        await a.audit('bill.extraction_reviewed', 'bill', bill.id, {
          corrections: b.corrections.length,
          aiRunId: run?.id ?? null,
        });
        return { reviewed: true, correctionsRecorded: b.corrections.length, confirmedFields };
      },
    );
  });
  route('POST', '/api/provider/bills/:id/confirm', async (a, r) => {
    const b = z
      .object({ expectedRevision: z.number().int().positive(), evidenceDocumentId: uuid, note })
      .strict()
      .parse(r.body);
    const { bill } = await billAccess(a, id(r), true);
    await a.organization(bill.provider_organization_id, staffRoles);
    if (bill.customer_user_id === a.actor.id)
      throw new IdentityError(
        403,
        'Another authorized staff member must confirm your own invoice.',
      );
    const rev = await latest(a.client, bill.id);
    if (rev.revision !== b.expectedRevision)
      throw new IdentityError(409, 'Bill changed. Review the latest version.');
    const evidence = (
      await a.client.query(
        'SELECT id FROM bill_documents WHERE id=$1 AND bill_id=$2 AND revision_number=$3',
        [b.evidenceDocumentId, bill.id, rev.revision],
      )
    ).rows[0];
    if (!evidence)
      throw new IdentityError(400, 'Upload supporting evidence for this bill version first.');
    await a.client.query(
      'INSERT INTO bill_confirmations(bill_id,revision,kind,actor_user_id,evidence_document_id,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      [bill.id, rev.revision, rev.confirmation_kind, a.actor.id, b.evidenceDocumentId, b.note],
    );
    await a.audit('provider.invoice_confirmed', 'bill', bill.id, {
      revision: rev.revision,
      kind: rev.confirmation_kind,
    });
    return { confirmed: true };
  });
  route('POST', '/api/care/bills/:id/payment-request', async (a, r) => {
    const b = z
      .object({ key, expectedRevision: z.number().int().positive() })
      .strict()
      .parse(r.body);
    const { bill, customer } = await billAccess(a, id(r), true);
    if (!customer) throw new IdentityError(403, 'The customer must authorize continuation.');
    return once.once(
      a.client,
      a.actor.id,
      b.key,
      'care-payment-request',
      { ...b, billId: bill.id },
      async () => {
        const rev = await latest(a.client, bill.id);
        if (rev.revision !== b.expectedRevision)
          throw new IdentityError(409, 'Bill changed. Review it again.');
        const intent = await ensurePayableIntent(a.client, bill, rev, {
          adapterMode: app.ctx.adapters.payments.mode,
          appEnv: a.env.APP_ENV,
          key: `care:${bill.id}:${b.key}`,
        });
        if (!intent.created)
          return {
            id: intent.id,
            status: intent.status,
            message: 'Existing payment request. No additional funds moved.',
          };
        await a.audit('care.payment_requested', 'bill', bill.id, { paymentIntentId: intent.id });
        return {
          id: intent.id,
          status: intent.status,
          message:
            'Payment request recorded. This is not payment or proof of settlement. No funds moved.',
        };
      },
    );
  });
  route('POST', '/api/care/bills/:id/disputes', async (a, r) => {
    const b = z.object({ key, reason: note }).strict().parse(r.body);
    const { bill } = await billAccess(a, id(r), true);
    return once.once(
      a.client,
      a.actor.id,
      b.key,
      'bill-dispute',
      { ...b, billId: bill.id },
      async () => {
        const row = (
          await a.client.query(
            'INSERT INTO disputes(opened_by,bill_id,amount_minor,currency,reason) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [a.actor.id, bill.id, String(bill.total_amount_minor), bill.currency, b.reason],
          )
        ).rows[0];
        await a.audit('bill.disputed', 'bill', bill.id);
        return row;
      },
    );
  });
  route('POST', '/api/care/bills/:id/corrections', async (a, r) => {
    const b = z
      .object({
        key,
        expectedRevision: z.number().int().positive(),
        reason: note,
        items: z.array(ItemSchema).min(1).max(100),
      })
      .strict()
      .parse(r.body);
    total(b.items);
    const { bill } = await billAccess(a, id(r), true);
    return once.once(
      a.client,
      a.actor.id,
      b.key,
      'bill-correction',
      { ...b, billId: bill.id },
      async () => {
        const rev = await latest(a.client, bill.id);
        if (rev.revision !== b.expectedRevision)
          throw new IdentityError(409, 'Refresh the bill before submitting a correction.');
        const row = (
          await a.client.query(
            'INSERT INTO bill_corrections(bill_id,revision,requested_by,reason,proposed_items) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [bill.id, rev.revision, a.actor.id, b.reason, JSON.stringify(b.items)],
          )
        ).rows[0];
        await a.audit('bill.correction_submitted', 'bill', bill.id);
        return {
          ...row,
          message:
            'Correction submitted for review. Original invoice and payment history remain unchanged.',
        };
      },
    );
  });
  route('GET', '/api/care/receipts/:id', async (a, r) => {
    const row = (
      await a.client.query(
        "SELECT r.*,p.bill_id,p.adapter_mode FROM receipts r JOIN payment_intents p ON p.id=r.payment_intent_id WHERE r.id=$1 AND r.status='issued'",
        [id(r)],
      )
    ).rows[0];
    if (!row) throw missing();
    await billAccess(a, row.bill_id);
    return { receipt: row };
  });
};

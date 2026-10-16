import { createHash, randomBytes } from 'node:crypto';
import { LedgerService, buckets, money } from '../ledger/service.js';
import { IdentityError } from '../identity/service.js';

export type ProgramRow = {
  id: string;
  organization_id: string;
  name: string;
  currency: string | null;
  status: string;
  rule_version: number;
  allowed_categories: string[];
  allowed_provider_ids: string[];
  max_per_payment_minor: number | null;
  rules: Record<string, unknown>;
  starts_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
};

export const voucherSimulationEvidence = {
  simulation: true,
  settlementVerified: false,
  note: 'Sponsor voucher credit is simulated; no real partner settlement is asserted.',
};

export async function issueVoucher(
  ledger: LedgerService,
  input: {
    programId: string;
    beneficiaryPhone: string;
    amountMinor: string;
    expiresInDays: number;
    actorUserId?: string | null;
  },
): Promise<{ voucherId: string; code: string; allocationId: string; expiresAt: Date }> {
  money(input.amountMinor);
  const code = randomBytes(24).toString('base64url');
  const key = `program-voucher:${input.programId}:${createHash('sha256').update(code).digest('hex')}`;

  return ledger.operation<{
    voucherId: string;
    code: string;
    allocationId: string;
    expiresAt: Date;
  }>(key, 'program_voucher', input, async (client) => {
    const programResult = await client.query<ProgramRow>(
      'SELECT * FROM programs WHERE id = $1 FOR SHARE',
      [input.programId],
    );
    const program = programResult.rows[0];
    if (!program) throw new IdentityError(404, 'Program not found.');
    if (program.status !== 'active')
      throw new IdentityError(409, 'Only active programs can issue vouchers.');
    if (!program.currency) throw new IdentityError(409, 'Program has no currency.');

    const beneficiary = (
      await client.query<{ id: string }>(
        'SELECT id FROM users WHERE phone_e164 = $1 AND suspended_at IS NULL',
        [input.beneficiaryPhone],
      )
    ).rows[0];
    if (!beneficiary)
      throw new IdentityError(
        404,
        'No verified active beneficiary has that phone number on HealthWallet.',
      );

    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `funding-wallet:${beneficiary.id}:${program.currency}`,
    ]);
    let wallet = (
      await client.query<{ id: string }>(
        'SELECT id FROM wallets WHERE owner_user_id = $1 AND currency = $2 ORDER BY created_at, id LIMIT 1',
        [beneficiary.id, program.currency],
      )
    ).rows[0];
    if (!wallet)
      wallet = (
        await client.query<{ id: string }>(
          'INSERT INTO wallets (owner_user_id, currency) VALUES ($1, $2) RETURNING id',
          [beneficiary.id, program.currency],
        )
      ).rows[0];

    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const voucherExpiry =
      program.expires_at && program.expires_at < expiresAt ? program.expires_at : expiresAt;

    const allocation = (
      await client.query<{ id: string }>(
        `INSERT INTO funding_allocations
          (wallet_id, beneficiary_user_id, currency, source, program_id, allowed_categories,
           allowed_provider_ids, max_per_payment_minor, rules, program_rule_version, starts_at, expires_at)
         VALUES ($1, $2, $3, 'sponsor_vouchers', $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          wallet.id,
          beneficiary.id,
          program.currency,
          program.id,
          program.allowed_categories,
          program.allowed_provider_ids,
          program.max_per_payment_minor,
          JSON.stringify(program.rules),
          program.rule_version,
          program.starts_at,
          voucherExpiry,
        ],
      )
    ).rows[0];

    for (const bucket of buckets) {
      await client.query(
        `INSERT INTO ledger_accounts (code, currency, allocation_id, bucket, kind, normal_side)
         VALUES ($1, $2, $3, $4, 'liability', 'credit')
         ON CONFLICT (code) DO NOTHING`,
        [`voucher:${allocation.id}:${bucket}`, program.currency, allocation.id, bucket],
      );
    }

    const debit = await ledger.clearing(client, program.currency, 'receivable');
    const credit = await ledger.account(client, allocation.id, 'available');
    const posted = await ledger.postInTransaction(client, key, {
      currency: program.currency,
      operation: 'program_voucher_credit',
      description: 'Sponsor voucher credit; partner settlement unconfirmed',
      referenceType: 'allocation',
      referenceId: allocation.id,
      actorUserId: input.actorUserId ?? undefined,
      lines: [
        { accountId: debit, side: 'debit', amountMinor: input.amountMinor },
        { accountId: credit, side: 'credit', amountMinor: input.amountMinor },
      ],
    });

    await client.query(
      `INSERT INTO partner_settlements
        (payment_intent_id, journal_id, partner_organization_id, direction, amount_minor, currency, status, adapter_mode, evidence)
       VALUES (NULL, $1, $2, 'inbound', $3, $4, 'expected', 'sandbox', $5)`,
      [
        posted.journalId,
        program.organization_id,
        input.amountMinor,
        program.currency,
        JSON.stringify(voucherSimulationEvidence),
      ],
    );

    const voucher = (
      await client.query<{ id: string }>(
        `INSERT INTO vouchers (program_id, allocation_id, code_hash, amount_minor, currency, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          program.id,
          allocation.id,
          createHash('sha256').update(code).digest('hex'),
          input.amountMinor,
          program.currency,
          voucherExpiry,
        ],
      )
    ).rows[0];

    await client.query(
      `INSERT INTO audit_events (actor_user_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, 'voucher.issued', 'voucher', $2, $3)`,
      [
        input.actorUserId ?? null,
        voucher.id,
        JSON.stringify({
          programId: program.id,
          allocationId: allocation.id,
          amountMinor: input.amountMinor,
          currency: program.currency,
          simulation: true,
        }),
      ],
    );

    return { voucherId: voucher.id, code, allocationId: allocation.id, expiresAt: voucherExpiry };
  });
}

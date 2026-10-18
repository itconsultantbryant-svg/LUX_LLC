import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { IdentityError } from '../identity/service.js';

/**
 * Universal transaction receipts.
 *
 * Every money movement — a top-up from Orange Money, a payment for care, a
 * contribution through a support link, a reversal — gets exactly one receipt
 * with a unique human-readable number, the from/to parties, and the amount.
 * Receipts are immutable except for a recorded revocation or reversal, and both
 * of those leave a full audit trail rather than deleting the original.
 */
export type ReceiptKind = 'deposit' | 'payment' | 'contribution' | 'transfer' | 'reversal';

export interface ReceiptInput {
  kind: ReceiptKind;
  direction: 'credit' | 'debit';
  fromUserId: string | null;
  fromLabel: string;
  toUserId: string | null;
  toLabel: string;
  amountMinor: string;
  currency: string;
  reference?: string | null;
  reversalOfId?: string | null;
  detail?: Record<string, unknown>;
}

export interface ReceiptRow {
  id: string;
  number: string;
  kind: string;
  direction: string;
  status: string;
  from_user_id: string | null;
  from_label: string;
  to_user_id: string | null;
  to_label: string;
  amount_minor: string;
  currency: string;
  reference: string | null;
  detail: Record<string, unknown>;
  reversal_of_id: string | null;
  reversed_by_id: string | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
  issued_at: Date;
}

const KIND_PREFIX: Record<ReceiptKind, string> = {
  deposit: 'DEP',
  payment: 'PAY',
  contribution: 'CON',
  transfer: 'TRF',
  reversal: 'REV',
};

export function receiptView(row: ReceiptRow) {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    direction: row.direction,
    status: row.status,
    from: { userId: row.from_user_id, label: row.from_label },
    to: { userId: row.to_user_id, label: row.to_label },
    amountMinor: row.amount_minor,
    currency: row.currency,
    reference: row.reference,
    detail: row.detail,
    reversalOfId: row.reversal_of_id,
    reversedById: row.reversed_by_id,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    revokeReason: row.revoke_reason,
    issuedAt: row.issued_at.toISOString(),
  };
}

export class ReceiptsService {
  constructor(private readonly clock: () => Date = () => new Date()) {}

  private number(kind: ReceiptKind): string {
    const stamp = this.clock().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = randomBytes(4).toString('hex').toUpperCase();
    return `LUX-${KIND_PREFIX[kind]}-${stamp}-${rand}`;
  }

  /** Issue a receipt, retrying a couple of times on the (unlikely) number clash. */
  async issue(client: pg.PoolClient, input: ReceiptInput): Promise<ReceiptRow> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const number = this.number(input.kind);
      const result = await client.query<ReceiptRow>(
        `INSERT INTO transaction_receipts
           (number,kind,direction,from_user_id,from_label,to_user_id,to_label,amount_minor,currency,reference,reversal_of_id,detail)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (number) DO NOTHING
         RETURNING *`,
        [
          number,
          input.kind,
          input.direction,
          input.fromUserId,
          input.fromLabel,
          input.toUserId,
          input.toLabel,
          input.amountMinor,
          input.currency,
          input.reference ?? null,
          input.reversalOfId ?? null,
          JSON.stringify(input.detail ?? {}),
        ],
      );
      if (result.rows[0]) return result.rows[0];
    }
    throw new IdentityError(503, 'Could not issue a receipt number. Please retry.');
  }

  async list(client: pg.PoolClient, userId: string, limit = 50): Promise<ReceiptRow[]> {
    return (
      await client.query<ReceiptRow>(
        `SELECT * FROM transaction_receipts
          WHERE from_user_id=$1 OR to_user_id=$1
          ORDER BY issued_at DESC, id DESC
          LIMIT $2`,
        [userId, Math.min(Math.max(limit, 1), 100)],
      )
    ).rows;
  }

  async get(client: pg.PoolClient, userId: string, id: string): Promise<ReceiptRow> {
    const row = (
      await client.query<ReceiptRow>(
        'SELECT * FROM transaction_receipts WHERE id=$1 AND (from_user_id=$2 OR to_user_id=$2)',
        [id, userId],
      )
    ).rows[0];
    if (!row) throw new IdentityError(404, 'Receipt not found.');
    return row;
  }

  async byReference(client: pg.PoolClient, reference: string): Promise<ReceiptRow | undefined> {
    return (
      await client.query<ReceiptRow>(
        'SELECT * FROM transaction_receipts WHERE reference=$1 ORDER BY issued_at DESC LIMIT 1',
        [reference],
      )
    ).rows[0];
  }

  /** Admin: mark a receipt revoked (cancels its standing) without deleting it. */
  async revoke(
    client: pg.PoolClient,
    id: string,
    actorId: string,
    reason: string,
  ): Promise<ReceiptRow> {
    const row = (
      await client.query<ReceiptRow>(
        `UPDATE transaction_receipts
            SET status='revoked',revoked_at=now(),revoked_by=$2,revoke_reason=$3
          WHERE id=$1 AND status='completed'
          RETURNING *`,
        [id, actorId, reason],
      )
    ).rows[0];
    if (!row) throw new IdentityError(409, 'This receipt cannot be revoked.');
    return row;
  }

  /**
   * Admin: reverse a receipt. A reversal receipt is issued recording the
   * movement back, and the original is linked so the pair can be tracked. The
   * actual settlement reversal is handed to operations, and that fact is stored
   * on the reversal so the record never overstates what has happened.
   */
  async reverse(
    client: pg.PoolClient,
    original: ReceiptRow,
    actorId: string,
    reason: string,
  ): Promise<ReceiptRow> {
    if (original.status !== 'completed')
      throw new IdentityError(409, 'Only a completed receipt can be reversed.');
    const reversal = await this.issue(client, {
      kind: 'reversal',
      direction: original.direction === 'credit' ? 'debit' : 'credit',
      fromUserId: original.to_user_id,
      fromLabel: original.to_label,
      toUserId: original.from_user_id,
      toLabel: original.from_label,
      amountMinor: original.amount_minor,
      currency: original.currency,
      reference: original.number,
      reversalOfId: original.id,
      detail: {
        reversalOf: original.number,
        reason,
        settlement:
          'Settlement reversal recorded and queued for operations; the original movement is untouched.',
      },
    });
    await client.query(
      "UPDATE transaction_receipts SET status='reversed',reversed_by_id=$2,revoke_reason=$3 WHERE id=$1",
      [original.id, reversal.id, reason],
    );
    return reversal;
  }
}

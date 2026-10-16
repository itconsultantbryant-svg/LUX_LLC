import { IdentityError } from '../identity/service.js';
import { Access, missing } from '../security/access.js';

/**
 * Data-subject account export and deletion.
 *
 * Export intentionally returns only the caller's own records and never includes
 * document bytes, session hashes, tokens, verification codes or payment
 * credentials. Deletion requests scrub identity but retain financial, consent
 * and audit records under the retention policy.
 */
export class AccountService {
  async export(a: Access) {
    const id = a.actor.id;
    const [
      profile,
      roles,
      consents,
      dependents,
      care,
      sessions,
      bills,
      documents,
      credit,
      rewards,
      deletions,
    ] = await Promise.all([
      a.client.query<{
        id: string;
        phone_e164: string;
        display_name: string | null;
        created_at: Date;
      }>('SELECT id, phone_e164, display_name, created_at FROM users WHERE id=$1', [id]),
      a.client.query('SELECT role FROM user_roles WHERE user_id=$1 ORDER BY role', [id]),
      a.client.query(
        'SELECT consent_type, granted, version, created_at FROM consents WHERE user_id=$1 ORDER BY created_at',
        [id],
      ),
      a.client.query(
        'SELECT id, display_name, relationship, created_at FROM dependents WHERE guardian_user_id=$1',
        [id],
      ),
      a.client.query(
        'SELECT id, owner_user_id, dependent_id, scopes, expires_at, revoked_at, created_at FROM care_authorizations WHERE owner_user_id=$1 OR caregiver_user_id=$1',
        [id],
      ),
      a.client.query(
        'SELECT auth_method, created_at, expires_at, revoked_at, mfa_verified_at FROM auth_sessions WHERE user_id=$1 ORDER BY created_at',
        [id],
      ),
      a.client.query(
        'SELECT id, status, currency, total_amount_minor, validation_state, created_at FROM bills WHERE customer_user_id=$1 ORDER BY created_at',
        [id],
      ),
      a.client.query(
        `SELECT d.id, d.bill_id, d.content_type, d.byte_size, d.purged_at, d.created_at
             FROM bill_documents d JOIN bills b ON b.id=d.bill_id
            WHERE b.customer_user_id=$1 ORDER BY d.created_at`,
        [id],
      ),
      a.client.query(
        'SELECT id, currency, principal_minor, fee_minor, repaid_minor, status, due_at, created_at FROM credit_records WHERE beneficiary_user_id=$1',
        [id],
      ),
      a.client.query(
        'SELECT id, type, amount_minor, currency, created_at FROM reward_entries WHERE beneficiary_user_id=$1 ORDER BY created_at',
        [id],
      ),
      a.client.query(
        'SELECT id, status, reason, requested_at, processed_at FROM account_deletion_requests WHERE user_id=$1 ORDER BY requested_at',
        [id],
      ),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      note: 'This export contains only your records. Document contents and security secrets are never included.',
      profile: profile.rows[0] ?? null,
      roles: roles.rows.map((row) => row.role),
      consents: consents.rows,
      dependents: dependents.rows,
      careAuthorizations: care.rows,
      sessions: sessions.rows,
      bills: bills.rows,
      documents: documents.rows,
      credit: credit.rows,
      rewards: rewards.rows,
      deletionRequests: deletions.rows,
    };
  }

  async requestDeletion(a: Access, input: { reason?: string }) {
    a.freshPhone();
    const existing = await a.client.query(
      "SELECT id FROM account_deletion_requests WHERE user_id=$1 AND status IN ('pending','processing')",
      [a.actor.id],
    );
    if (existing.rowCount)
      throw new IdentityError(409, 'A deletion request is already open for this account.');
    const row = (
      await a.client.query<{ id: string; requested_at: Date }>(
        'INSERT INTO account_deletion_requests(user_id, reason) VALUES($1,$2) RETURNING id, requested_at',
        [a.actor.id, input.reason ?? null],
      )
    ).rows[0];
    await a.audit('account.deletion_requested', 'user', a.actor.id, {});
    return { id: row.id, status: 'pending', requestedAt: row.requested_at };
  }

  async cancelDeletion(a: Access) {
    const result = await a.client.query(
      "UPDATE account_deletion_requests SET status='cancelled' WHERE user_id=$1 AND status='pending' RETURNING id",
      [a.actor.id],
    );
    if (!result.rowCount) throw missing();
    await a.audit('account.deletion_cancelled', 'user', a.actor.id, {});
    return { cancelled: true };
  }

  async listDeletions(a: Access) {
    const rows = await a.client.query(
      `SELECT r.id, r.user_id, r.status, r.reason, r.requested_at, r.processed_at, u.anonymized_at
         FROM account_deletion_requests r JOIN users u ON u.id=r.user_id
        ORDER BY r.requested_at DESC LIMIT 200`,
    );
    return { requests: rows.rows };
  }

  /**
   * Process a deletion request: scrub identity and revoke access while retaining
   * financial, consent and audit records (record-retention requirements).
   */
  async processDeletion(a: Access, requestId: string) {
    const request = (
      await a.client.query<{ id: string; user_id: string; status: string }>(
        'SELECT id, user_id, status FROM account_deletion_requests WHERE id=$1 FOR UPDATE',
        [requestId],
      )
    ).rows[0];
    if (!request) throw missing();
    if (!['pending', 'processing'].includes(request.status))
      throw new IdentityError(409, 'This deletion request is not open.');
    const userId = request.user_id;
    // Revoke access and remove authentication secrets.
    await a.client.query(
      'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
      [userId],
    );
    await a.client.query('DELETE FROM mfa_credentials WHERE user_id=$1', [userId]);
    await a.client.query('DELETE FROM recovery_codes WHERE user_id=$1', [userId]);
    await a.client.query('DELETE FROM care_authorizations WHERE caregiver_user_id=$1', [userId]);
    // Anonymize the identity; the account can no longer authenticate.
    const tombstone = `+_deleted_${userId.replaceAll('-', '').slice(0, 8)}`;
    await a.client.query(
      `UPDATE users SET phone_e164=$2, display_name='Anonymized account', anonymized_at=now(), suspended_at=now(), updated_at=now() WHERE id=$1`,
      [userId, tombstone],
    );
    await a.client.query(
      `UPDATE account_deletion_requests SET status='completed', processed_at=now(), processed_by=$2 WHERE id=$1`,
      [request.id, a.actor.id],
    );
    await a.audit('account.deletion_completed', 'user', userId, { requestId: request.id });
    return { completed: true, userId };
  }
}

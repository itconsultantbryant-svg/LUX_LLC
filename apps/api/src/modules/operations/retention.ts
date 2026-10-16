import type pg from 'pg';
import type { Env } from '../../config/env.js';
import type { ObjectStorageAdapter } from '../../adapters/types.js';

/**
 * Data-retention policy. Only transient, non-financial data is ever purged:
 * expired authentication artifacts, transient sessions and (optionally) the
 * stored bytes of health documents. Ledger journals, balances, payments,
 * settlements, receipts, disputes, credits and audit events are retained and are
 * never touched by the retention job.
 */
export type RetentionPolicy = {
  sessionDays: number;
  otpDays: number;
  identityLimitDays: number;
  aiArtifactDays: number;
  documentDays: number;
  auditDays: number;
};

export function retentionPolicy(env: Env): RetentionPolicy {
  return {
    sessionDays: env.RETENTION_SESSION_DAYS,
    otpDays: env.RETENTION_OTP_DAYS,
    identityLimitDays: env.RETENTION_IDENTITY_LIMIT_DAYS,
    aiArtifactDays: env.RETENTION_AI_ARTIFACT_DAYS,
    documentDays: env.RETENTION_DOCUMENT_DAYS,
    auditDays: env.RETENTION_AUDIT_DAYS,
  };
}

export type RetentionRow = { target: string; eligible: number; purged: number };

export type RetentionReport = {
  generatedAt: string;
  policy: RetentionPolicy;
  rows: RetentionRow[];
  documentsPurged: number;
  note: string;
};

const RETENTION_NOTE =
  'Ledger, payment, settlement, receipt, dispute, credit and audit records are retained and are never purged by this job.';

/** Counts (or purges, when `dryRun` is false) each eligible class of record. */
export async function runRetention(
  client: pg.PoolClient,
  policy: RetentionPolicy,
  storage: ObjectStorageAdapter,
  options: { dryRun: boolean; actorUserId?: string | null },
): Promise<RetentionReport> {
  const rows: RetentionRow[] = [];
  const targets: Array<{ target: string; sql: string; days: number }> = [
    {
      target: 'auth_sessions',
      days: policy.sessionDays,
      sql: `DELETE FROM auth_sessions WHERE expires_at < now() - ($1 * interval '1 day')`,
    },
    {
      target: 'otp_challenges',
      days: policy.otpDays,
      sql: `DELETE FROM otp_challenges WHERE expires_at < now() - ($1 * interval '1 day')`,
    },
    {
      target: 'identity_limits',
      days: policy.identityLimitDays,
      sql: `DELETE FROM identity_limits WHERE expires_at < now() - ($1 * interval '1 day')`,
    },
    {
      target: 'ai_artifacts',
      days: policy.aiArtifactDays,
      sql: `DELETE FROM ai_artifacts a WHERE a.created_at < now() - ($1 * interval '1 day')
            AND NOT EXISTS (SELECT 1 FROM review_cases rc WHERE rc.bill_id=a.bill_id AND rc.status IN ('open','escalated','clarification'))
            AND NOT EXISTS (SELECT 1 FROM validation_findings f WHERE f.bill_id=a.bill_id AND f.resolved_at IS NULL)`,
    },
  ];

  for (const target of targets) {
    const countSql = target.sql.replace(/^DELETE FROM/, 'SELECT count(*)::int AS count FROM');
    if (options.dryRun) {
      const count = (await client.query<{ count: number }>(countSql, [target.days])).rows[0].count;
      rows.push({ target: target.target, eligible: count, purged: 0 });
    } else {
      const result = await client.query(target.sql, [target.days]);
      const purged = result.rowCount ?? 0;
      rows.push({ target: target.target, eligible: purged, purged });
    }
  }

  // Document bytes: remove the stored object past the retention window and mark
  // the metadata purged. Metadata is retained so bill references stay intact.
  const documents = await client.query<{ id: string; storage_key: string }>(
    `SELECT id, storage_key FROM bill_documents
      WHERE purged_at IS NULL AND created_at < now() - ($1 * interval '1 day')
      ORDER BY created_at LIMIT 500`,
    [policy.documentDays],
  );
  let documentsPurged = 0;
  if (!options.dryRun) {
    for (const document of documents.rows) {
      try {
        await storage.deleteObject?.(document.storage_key);
        await client.query('UPDATE bill_documents SET purged_at=now() WHERE id=$1', [document.id]);
        documentsPurged += 1;
      } catch {
        // Leave the row unpurged so a later run can retry; never fail the whole job.
      }
    }
  }
  rows.push({
    target: 'bill_documents',
    eligible: documents.rowCount ?? 0,
    purged: options.dryRun ? 0 : documentsPurged,
  });

  await client.query(
    `INSERT INTO audit_events (actor_user_id, event_type, entity_type, entity_id, payload)
     VALUES ($1, $2, 'system', NULL, $3)`,
    [
      options.actorUserId ?? null,
      options.dryRun ? 'retention.preview' : 'retention.run',
      JSON.stringify({ policy, rows, documentsPurged, note: RETENTION_NOTE }),
    ],
  );

  return {
    generatedAt: new Date().toISOString(),
    policy,
    rows,
    documentsPurged,
    note: RETENTION_NOTE,
  };
}

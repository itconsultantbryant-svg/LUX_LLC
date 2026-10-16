import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AiExtractionResultSchema, type AiExtractionResult } from '@healthwallet/shared';
import type { AiAdapter, ObjectStorageAdapter } from '../../adapters/types.js';
import { SUPPORTED_CURRENCIES } from './heuristic.js';

export type FindingSeverity = 'info' | 'warning' | 'error';
export type Finding = {
  code: string;
  severity: FindingSeverity;
  message: string;
  field?: string;
};
export type BillRow = {
  id: string;
  customer_user_id: string;
  dependent_id: string | null;
  provider_organization_id: string | null;
  category: string;
  status: string;
  currency: string | null;
  total_amount_minor: number | null;
  provider_name: string | null;
};

export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;

function normalizeProviderName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

export function evaluateExtraction(
  extraction: AiExtractionResult,
  bill: {
    currency: string | null;
    total_amount_minor: number | null;
    provider_name: string | null;
    category: string;
  },
): { findings: Finding[]; requiresReview: boolean } {
  const findings: Finding[] = [];
  const fields = extraction.fields;

  if (fields.totalAmountMinor === null) {
    findings.push({
      code: 'MISSING_TOTAL',
      severity: 'error',
      message: 'No total amount could be read from the document.',
      field: 'totalAmountMinor',
    });
  }
  if (!fields.currency) {
    findings.push({
      code: 'MISSING_CURRENCY',
      severity: 'warning',
      message: 'The document does not state a currency.',
      field: 'currency',
    });
  } else if (bill.currency && fields.currency !== bill.currency) {
    findings.push({
      code: 'CURRENCY_MISMATCH',
      severity: 'error',
      message: `Document currency ${fields.currency} differs from the bill currency ${bill.currency}.`,
      field: 'currency',
    });
  }
  if (!fields.providerName) {
    findings.push({
      code: 'MISSING_PROVIDER',
      severity: 'warning',
      message: 'No provider name was read from the document.',
      field: 'providerName',
    });
  } else if (
    bill.provider_name &&
    normalizeProviderName(fields.providerName) !== normalizeProviderName(bill.provider_name)
  ) {
    findings.push({
      code: 'PROVIDER_MISMATCH',
      severity: 'warning',
      message: `Document provider "${fields.providerName}" differs from the declared bill provider.`,
      field: 'providerName',
    });
  }
  if (fields.serviceDate) {
    const parsed = new Date(fields.serviceDate);
    if (Number.isNaN(parsed.getTime())) {
      findings.push({
        code: 'SERVICE_DATE_INVALID',
        severity: 'warning',
        message: `Service date "${fields.serviceDate}" is not a valid date.`,
        field: 'serviceDate',
      });
    }
  } else {
    findings.push({
      code: 'MISSING_SERVICE_DATE',
      severity: 'warning',
      message: 'No service date was read from the document.',
      field: 'serviceDate',
    });
  }

  const lineSum = fields.lineItems.reduce((sum, line) => sum + line.totalAmountMinor, 0);
  if (fields.lineItems.length > 0 && fields.totalAmountMinor !== null && lineSum > 0) {
    if (lineSum !== fields.totalAmountMinor) {
      findings.push({
        code: 'TOTAL_MISMATCH',
        severity: 'error',
        message: `Extracted line items total ${lineSum} which differs from the extracted total ${fields.totalAmountMinor}.`,
        field: 'totalAmountMinor',
      });
    }
  }
  if (
    bill.total_amount_minor !== null &&
    fields.totalAmountMinor !== null &&
    fields.totalAmountMinor !== bill.total_amount_minor
  ) {
    findings.push({
      code: 'BILL_TOTAL_MISMATCH',
      severity: 'warning',
      message: `Extracted total ${fields.totalAmountMinor} differs from the declared bill total ${bill.total_amount_minor}.`,
      field: 'totalAmountMinor',
    });
  }
  if (extraction.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    findings.push({
      code: 'LOW_CONFIDENCE',
      severity: 'warning',
      message: `Extraction confidence ${extraction.confidence} is below the ${REVIEW_CONFIDENCE_THRESHOLD} review threshold.`,
    });
  }

  const requiresReview = findings.some((finding) => finding.severity !== 'info');
  return { findings, requiresReview };
}

export async function recordExtraction(
  client: PoolClient,
  adapter: AiAdapter,
  input: {
    billId: string;
    documentId: string | null;
    storageKey: string;
    contentType: string;
    bytes?: Buffer;
    hintText?: string;
    actorUserId?: string | null;
  },
): Promise<{
  billId: string;
  status: string;
  requiresReview: boolean;
  findings: Finding[];
  aiRunId: string;
  confidence: number;
}> {
  const billResult = await client.query<BillRow>('SELECT * FROM bills WHERE id = $1 FOR UPDATE', [
    input.billId,
  ]);
  const bill = billResult.rows[0];
  if (!bill) {
    throw new Error('bill_not_found');
  }

  const extraction = AiExtractionResultSchema.parse(
    await adapter.extractFromDocument({
      storageKey: input.storageKey,
      contentType: input.contentType,
      bytes: input.bytes,
      hintText: input.hintText,
    }),
  );
  const { findings: coherenceFindings } = evaluateExtraction(extraction, bill);
  const findings: Finding[] = [...coherenceFindings];

  if (extraction.unreadable) {
    findings.unshift({
      code: 'UNREADABLE_DOCUMENT',
      severity: 'error',
      message:
        'The document could not be read. No values were guessed; the bill is routed to human assistance.',
    });
  }
  if (
    extraction.fields.currency &&
    !SUPPORTED_CURRENCIES.includes(
      extraction.fields.currency as (typeof SUPPORTED_CURRENCIES)[number],
    )
  ) {
    findings.push({
      code: 'CURRENCY_UNSUPPORTED',
      severity: 'error',
      message: `Currency ${extraction.fields.currency} is not supported for payment.`,
      field: 'currency',
    });
  }
  for (const field of extraction.ambiguous) {
    findings.push({
      code: 'AMBIGUOUS_FIELD',
      severity: 'warning',
      message: `Field ${field} was ambiguous in the document and needs customer confirmation.`,
      field,
    });
  }
  if (extraction.evidence.some((item) => item.kind === 'untrusted')) {
    findings.push({
      code: 'UNTRUSTED_DOCUMENT_INSTRUCTION',
      severity: 'warning',
      message:
        'The document contained instruction-like text. It was treated as untrusted data and ignored.',
    });
  }
  const requiresReview = findings.some((finding) => finding.severity !== 'info');

  const digest = createHash('sha256')
    .update(`${input.storageKey}:${input.contentType}`)
    .digest('hex');
  const confidenceBps = Math.round(extraction.confidence * 10000);

  const runResult = await client.query<{ id: string }>(
    `INSERT INTO ai_runs
      (bill_id, document_id, mode, adapter_id, model_version, status, input_digest, output, confidence_bps, requires_review, completed_at)
     VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, now())
     RETURNING id`,
    [
      bill.id,
      input.documentId,
      extraction.mode,
      extraction.adapterId,
      extraction.modelOrFixture,
      digest,
      JSON.stringify(extraction),
      confidenceBps,
      requiresReview,
    ],
  );
  const aiRunId = runResult.rows[0].id;

  for (const finding of findings) {
    await client.query(
      `INSERT INTO validation_findings (bill_id, ai_run_id, code, severity, message, field)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [bill.id, aiRunId, finding.code, finding.severity, finding.message, finding.field ?? null],
    );
  }

  await client.query(
    `INSERT INTO ai_artifacts
      (bill_id, workflow, mode, adapter_id, payload, confidence_bps, human_review_required)
     VALUES ($1, 'bill_extraction', $2, $3, $4, $5, $6)`,
    [
      bill.id,
      extraction.mode,
      extraction.adapterId,
      JSON.stringify({ extraction, findings }),
      confidenceBps,
      requiresReview,
    ],
  );

  const status = requiresReview ? 'needs_review' : 'extracted';
  await client.query('UPDATE bills SET status = $2, updated_at = now() WHERE id = $1', [
    bill.id,
    status,
  ]);

  if (requiresReview) {
    const reasons = findings
      .filter((finding) => finding.severity !== 'info')
      .map((finding) => `${finding.code}:${finding.severity}`)
      .join(',');
    const openCase = await client.query(
      'SELECT id FROM review_cases WHERE bill_id = $1 AND status = $2',
      [bill.id, 'open'],
    );
    if (openCase.rowCount === 0) {
      const providerResult = await client.query<{ id: string }>(
        'SELECT id FROM providers WHERE organization_id = $1',
        [bill.provider_organization_id],
      );
      await client.query(
        `INSERT INTO review_cases (organization_id, bill_id, provider_id, reason)
         VALUES ($1, $2, $3, $4)`,
        [
          bill.provider_organization_id,
          bill.id,
          providerResult.rowCount === 0 ? null : providerResult.rows[0].id,
          reasons || 'manual_review',
        ],
      );
    }
  }

  await client.query(
    `INSERT INTO audit_events ("actor_user_id", event_type, entity_type, entity_id, payload)
     VALUES ($1, 'bill.extracted', 'bill', $2, $3)`,
    [
      input.actorUserId ?? null,
      bill.id,
      JSON.stringify({
        requiresReview,
        confidence: extraction.confidence,
        findingCodes: findings.map((finding) => finding.code),
      }),
    ],
  );

  return {
    billId: bill.id,
    status,
    requiresReview,
    findings,
    aiRunId,
    confidence: extraction.confidence,
  };
}

export async function enqueueExtraction(
  client: PoolClient,
  billId: string,
  documentId: string,
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO job_queue (job_type, payload, status)
     SELECT 'bill.extract',
            jsonb_build_object('billId', $1::uuid, 'documentId', $2::uuid),
            'pending'
     WHERE NOT EXISTS (
       SELECT 1 FROM job_queue
       WHERE job_type = 'bill.extract'
         AND status IN ('pending', 'processing')
         AND payload->>'documentId' = $2::text
     )`,
    [billId, documentId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function processExtractionJobs(
  client: PoolClient,
  adapter: AiAdapter,
  options: { billId?: string; limit?: number } = {},
  storage?: ObjectStorageAdapter,
): Promise<
  Array<{ jobId: string; billId: string | null; status: string; requiresReview: boolean }>
> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const where = options.billId ? "AND payload->>'billId' = $2" : '';
  const params = options.billId ? [limit, options.billId] : [limit];
  const jobs = await client.query<{
    id: string;
    payload: { billId?: string; documentId?: string };
  }>(
    `SELECT id, payload FROM job_queue
     WHERE job_type = 'bill.extract' AND status IN ('pending', 'failed') AND attempts < 5
       ${where}
     ORDER BY created_at
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    params,
  );

  const results: Array<{
    jobId: string;
    billId: string | null;
    status: string;
    requiresReview: boolean;
  }> = [];
  for (const job of jobs.rows) {
    await client.query('SAVEPOINT extraction_job');
    try {
      await client.query(
        "UPDATE job_queue SET status = 'processing', attempts = attempts + 1, updated_at = now() WHERE id = $1",
        [job.id],
      );
      const documentId = job.payload.documentId;
      if (!documentId) {
        throw new Error('missing_document_id');
      }
      const document = await client.query<{
        bill_id: string;
        storage_key: string;
        content_type: string;
      }>('SELECT bill_id, storage_key, content_type FROM bill_documents WHERE id = $1', [
        documentId,
      ]);
      if (document.rowCount === 0) {
        throw new Error('document_not_found');
      }
      const doc = document.rows[0];
      let bytes: Buffer | undefined;
      if (storage?.readObject) {
        try {
          bytes = await storage.readObject(doc.storage_key);
        } catch {
          bytes = undefined;
        }
      }
      const outcome = await recordExtraction(client, adapter, {
        billId: doc.bill_id,
        documentId,
        storageKey: doc.storage_key,
        contentType: doc.content_type,
        bytes,
      });
      await client.query(
        "UPDATE job_queue SET status = 'completed', updated_at = now() WHERE id = $1",
        [job.id],
      );
      await client.query('RELEASE SAVEPOINT extraction_job');
      results.push({
        jobId: job.id,
        billId: doc.bill_id,
        status: 'completed',
        requiresReview: outcome.requiresReview,
      });
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT extraction_job');
      await client.query(
        "UPDATE job_queue SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1",
        [job.id, errorToString(error).slice(0, 500)],
      );
      results.push({ jobId: job.id, billId: null, status: 'failed', requiresReview: false });
    }
  }
  return results;
}

function errorToString(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}

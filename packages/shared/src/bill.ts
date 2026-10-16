import { z } from 'zod';

export const BillLifecycleSchema = z.enum([
  'draft',
  'extracting',
  'extracted',
  'user_review',
  'validated',
  'funding_proposed',
  'awaiting_auth',
  'paying',
  'paid',
  'failed',
  'needs_review',
]);

export type BillLifecycle = z.infer<typeof BillLifecycleSchema>;

export const MoneyAmountSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().min(3).max(3),
});

export const BillLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive().optional(),
  unitAmountMinor: z.number().int().optional(),
  totalAmountMinor: z.number().int(),
});

export const ExtractedBillSchema = z.object({
  providerName: z.string().min(1).max(300).nullable(),
  customerName: z.string().min(1).max(300).nullable(),
  billReference: z.string().min(1).max(120).nullable().default(null),
  serviceDate: z.string().nullable(),
  currency: z.string().min(3).max(3).nullable(),
  totalAmountMinor: z.number().int().nullable(),
  lineItems: z.array(BillLineItemSchema).default([]),
  rawNotes: z.string().max(2000).optional(),
});

export type ExtractedBill = z.infer<typeof ExtractedBillSchema>;

/**
 * Evidence categories. `extracted` and `interpretation` come from the model-ish
 * reader; `deterministic` is calculated by trusted code; `untrusted` marks text
 * inside the document that attempted to issue instructions.
 */
export const EvidenceKindSchema = z.enum([
  'extracted',
  'interpretation',
  'deterministic',
  'untrusted',
]);

export const EvidenceSchema = z.object({
  field: z.string(),
  note: z.string().max(500),
  source: z.string().optional(),
  kind: EvidenceKindSchema.default('extracted'),
  page: z.number().int().min(1).optional(),
  quote: z.string().max(500).optional(),
  textSpan: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).optional(),
  imageRegion: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .optional(),
});

export const AiExtractionResultSchema = z.object({
  mode: z.enum(['sandbox', 'live']),
  adapterId: z.string(),
  fields: ExtractedBillSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema).default([]),
  modelOrFixture: z.string(),
  /** True when no trustworthy text could be read; fields must not be fabricated. */
  unreadable: z.boolean().default(false),
  /** Total computed by trusted arithmetic over extracted line items (never by the model). */
  derivedTotalMinor: z.number().int().nullable().default(null),
  /** Field names that were present but ambiguous and require confirmation. */
  ambiguous: z.array(z.string()).default([]),
});

export type AiExtractionResult = z.infer<typeof AiExtractionResultSchema>;

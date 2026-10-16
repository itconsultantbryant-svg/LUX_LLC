import { AiExtractionResultSchema, type AiExtractionResult } from '@healthwallet/shared';
import type { AiAdapter } from './types.js';
import { extractText, type ParsedDocument } from '../modules/extraction/parse.js';
import { extractFields } from '../modules/extraction/heuristic.js';

const KEY_FIELDS = [
  'providerName',
  'customerName',
  'billReference',
  'serviceDate',
  'currency',
  'totalAmountMinor',
] as const;

function emptyFields(rawNotes?: string): AiExtractionResult['fields'] {
  return {
    providerName: null,
    customerName: null,
    billReference: null,
    serviceDate: null,
    currency: null,
    totalAmountMinor: null,
    lineItems: [],
    ...(rawNotes ? { rawNotes } : {}),
  };
}

/**
 * LUX HealthTrust sandbox extraction.
 * Reads the uploaded document deterministically (text/plain and FlateDecode PDFs)
 * and never invents values: unreadable documents produce an empty, flagged result.
 * Replacement point: implement AiAdapter against a live model endpoint and select via AI_ADAPTER=live.
 */
export class SandboxAiAdapter implements AiAdapter {
  readonly id = 'lux-healthtrust.ai.sandbox';
  readonly mode = 'sandbox' as const;

  async extractFromDocument(input: {
    storageKey: string;
    contentType: string;
    bytes?: Buffer;
    hintText?: string;
  }): Promise<AiExtractionResult> {
    const source: ParsedDocument = input.bytes
      ? extractText(input.bytes, input.contentType)
      : input.hintText
        ? extractText(Buffer.from(input.hintText, 'utf8'), 'text/plain')
        : { text: '', pages: [], unreadable: true, reason: 'no_document_content', pageCount: 0 };

    if (source.unreadable) {
      return AiExtractionResultSchema.parse({
        mode: 'sandbox',
        adapterId: this.id,
        fields: emptyFields(
          'No trustworthy values were extracted; routed to human assistance instead of guessing.',
        ),
        confidence: 0,
        evidence: [
          {
            field: 'document',
            kind: 'interpretation',
            note: `Document could not be read (${source.reason}); no fields were fabricated.`,
            source: input.storageKey,
          },
        ],
        modelOrFixture: 'reader:rules-v1',
        unreadable: true,
        derivedTotalMinor: null,
        ambiguous: [],
      });
    }

    const extraction = extractFields(source);
    const evidence = [...extraction.evidence];
    if (extraction.fields.lineItems.length > 0 && extraction.derivedTotalMinor !== null)
      evidence.push({
        field: 'derivedTotalMinor',
        kind: 'deterministic',
        note: 'Sum of the parsed line items, computed by trusted code.',
      });

    const present = KEY_FIELDS.filter((field) => extraction.fields[field] !== null).length;
    const coverage =
      (present + (extraction.fields.lineItems.length > 0 ? 1 : 0)) / (KEY_FIELDS.length + 1);

    return AiExtractionResultSchema.parse({
      mode: 'sandbox',
      adapterId: this.id,
      fields: {
        ...extraction.fields,
        rawNotes: `Deterministic sandbox reader for ${input.storageKey} (${input.contentType}). Not a live model result.`,
      },
      confidence: Number(coverage.toFixed(2)),
      evidence,
      modelOrFixture: 'reader:rules-v1',
      unreadable: false,
      derivedTotalMinor: extraction.derivedTotalMinor,
      ambiguous: extraction.ambiguous,
    });
  }
}

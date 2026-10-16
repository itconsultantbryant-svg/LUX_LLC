import { describe, expect, it } from 'vitest';
import type { AiExtractionResult } from '@healthwallet/shared';
import { evaluateExtraction } from './service.js';

function extraction(overrides: Partial<AiExtractionResult['fields']> = {}): AiExtractionResult {
  return {
    mode: 'sandbox',
    adapterId: 'test.adapter',
    modelOrFixture: 'fixture:unit-test',
    confidence: 0.95,
    evidence: [],
    unreadable: false,
    derivedTotalMinor: null,
    ambiguous: [],
    fields: {
      providerName: 'Demo Clinic Monrovia (simulated)',
      customerName: 'Demo Patient',
      billReference: null,
      serviceDate: '2026-09-01',
      currency: 'LRD',
      totalAmountMinor: 4000,
      lineItems: [
        {
          description: 'Consultation',
          quantity: 1,
          unitAmountMinor: 4000,
          totalAmountMinor: 4000,
        },
      ],
      ...overrides,
    },
  };
}

const bill = {
  currency: 'LRD',
  total_amount_minor: 4000,
  provider_name: 'Demo Clinic Monrovia (simulated)',
  category: 'outpatient',
};

describe('evaluateExtraction', () => {
  it('accepts a coherent extraction above the confidence threshold', () => {
    const { findings, requiresReview } = evaluateExtraction(extraction(), bill);
    expect(requiresReview).toBe(false);
    expect(findings).toHaveLength(0);
  });

  it('flags a missing total as an error', () => {
    const { findings, requiresReview } = evaluateExtraction(
      extraction({ totalAmountMinor: null, lineItems: [] }),
      bill,
    );
    expect(requiresReview).toBe(true);
    expect(findings.map((f) => f.code)).toContain('MISSING_TOTAL');
  });

  it('flags a missing provider as a warning', () => {
    const { findings, requiresReview } = evaluateExtraction(
      extraction({ providerName: null }),
      bill,
    );
    expect(requiresReview).toBe(true);
    expect(findings.map((f) => f.code)).toContain('MISSING_PROVIDER');
  });

  it('flags line item totals that do not match the extracted total', () => {
    const { findings } = evaluateExtraction(
      extraction({
        totalAmountMinor: 4000,
        lineItems: [
          {
            description: 'Partial',
            quantity: 1,
            unitAmountMinor: 1200,
            totalAmountMinor: 1200,
          },
        ],
      }),
      bill,
    );
    expect(findings.map((f) => f.code)).toContain('TOTAL_MISMATCH');
  });

  it('flags a currency mismatch against the declared bill', () => {
    const { findings, requiresReview } = evaluateExtraction(extraction({ currency: 'USD' }), bill);
    expect(requiresReview).toBe(true);
    expect(findings.map((f) => f.code)).toContain('CURRENCY_MISMATCH');
  });

  it('flags a bill total that differs from the declared bill amount', () => {
    const { findings } = evaluateExtraction(extraction({ totalAmountMinor: 4100 }), bill);
    expect(findings.map((f) => f.code)).toContain('BILL_TOTAL_MISMATCH');
  });

  it('flags a provider that differs from the declared bill provider', () => {
    const { findings } = evaluateExtraction(extraction({ providerName: 'Different Clinic' }), bill);
    expect(findings.map((f) => f.code)).toContain('PROVIDER_MISMATCH');
  });

  it('flags an invalid service date', () => {
    const { findings, requiresReview } = evaluateExtraction(
      extraction({ serviceDate: 'not-a-date' }),
      bill,
    );
    expect(requiresReview).toBe(true);
    expect(findings.map((f) => f.code)).toContain('SERVICE_DATE_INVALID');
  });

  it('requires review when confidence is below threshold even if fields are coherent', () => {
    const low = extraction();
    low.confidence = 0.64;
    const { requiresReview, findings } = evaluateExtraction(low, bill);
    expect(requiresReview).toBe(true);
    expect(findings.map((f) => f.code)).toContain('LOW_CONFIDENCE');
  });
});

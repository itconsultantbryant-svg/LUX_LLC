import { describe, expect, it } from 'vitest';
import { AiExtractionResultSchema } from './bill.js';

describe('AiExtractionResultSchema', () => {
  it('accepts a sandbox extraction payload', () => {
    const parsed = AiExtractionResultSchema.parse({
      mode: 'sandbox',
      adapterId: 'ai.sandbox',
      fields: {
        providerName: 'Demo Clinic Monrovia',
        customerName: 'A. Johnson',
        serviceDate: '2026-10-01',
        currency: 'LRD',
        totalAmountMinor: 1500000,
        lineItems: [
          {
            description: 'Consultation',
            totalAmountMinor: 1500000,
          },
        ],
      },
      confidence: 0.72,
      evidence: [{ field: 'totalAmountMinor', note: 'Matched total line' }],
      modelOrFixture: 'fixture:demo-bill-v1',
    });

    expect(parsed.mode).toBe('sandbox');
    expect(parsed.fields.currency).toBe('LRD');
  });

  it('rejects confidence outside 0..1', () => {
    expect(() =>
      AiExtractionResultSchema.parse({
        mode: 'sandbox',
        adapterId: 'ai.sandbox',
        fields: {
          providerName: null,
          customerName: null,
          serviceDate: null,
          currency: null,
          totalAmountMinor: null,
          lineItems: [],
        },
        confidence: 1.5,
        evidence: [],
        modelOrFixture: 'x',
      }),
    ).toThrow();
  });
});

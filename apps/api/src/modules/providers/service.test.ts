import { expect, it } from 'vitest';
import { InvoiceSchema, total } from './service.js';
it('calculates item totals using exact minor units and rejects overflow', () => {
  expect(
    total([
      { description: 'Consultation', quantity: 3, unitMinor: '101' },
      { description: 'Medication', quantity: 2, unitMinor: '99' },
    ]),
  ).toBe('501');
  expect(() =>
    total([{ description: 'Overflow', quantity: 10000, unitMinor: '2147483647' }]),
  ).toThrow();
  expect(() => total([{ description: 'Zero', quantity: 1, unitMinor: '0' }])).toThrow();
});
it('validates calendar dates, integral quantities and exact prices', () => {
  const valid = {
    reference: 'INV-1',
    issueDate: '2026-10-11',
    currency: 'LRD',
    category: 'general',
    items: [{ description: 'Care', quantity: 1, unitMinor: '100' }],
  };
  expect(InvoiceSchema.safeParse(valid).success).toBe(true);
  for (const issueDate of ['2026-02-30', 'not-a-date'])
    expect(InvoiceSchema.safeParse({ ...valid, issueDate }).success).toBe(false);
  for (const unitMinor of ['1.5', '1e3', '-100'])
    expect(
      InvoiceSchema.safeParse({ ...valid, items: [{ ...valid.items[0], unitMinor }] }).success,
    ).toBe(false);
  expect(
    InvoiceSchema.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 1.5 }] }).success,
  ).toBe(false);
});

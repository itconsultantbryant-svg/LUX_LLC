import { describe, expect, it } from 'vitest';
import { allocateFunding } from './allocate.js';

describe('allocateFunding', () => {
  it('allocates across sources deterministically', () => {
    const result = allocateFunding({
      currency: 'LRD',
      billAmountMinor: 10000n,
      sources: [
        { currency: 'LRD', id: 'w1', label: 'Wallet', availableMinor: 6000n },
        { currency: 'LRD', id: 'p1', label: 'Family pot', availableMinor: 8000n },
      ],
    });

    expect(result.allocatedTotalMinor).toBe(10000n);
    expect(result.shortfallMinor).toBe(0n);
    expect(result.lines[0].allocatedMinor).toBe(6000n);
    expect(result.lines[1].allocatedMinor).toBe(4000n);
  });

  it('respects category restrictions', () => {
    const result = allocateFunding({
      currency: 'LRD',
      billAmountMinor: 5000n,
      billCategory: 'pharmacy',
      sources: [
        {
          currency: 'LRD',
          id: 'ngo',
          label: 'NGO pot',
          availableMinor: 20000n,
          restrictedCategories: ['inpatient'],
        },
      ],
    });

    expect(result.lines[0].restricted).toBe(true);
    expect(result.shortfallMinor).toBe(5000n);
  });
});

it('rejects mixed currencies before allocation', () => {
  expect(() =>
    allocateFunding({
      currency: 'LRD',
      billAmountMinor: 100n,
      sources: [{ id: 'usd', label: 'USD savings', currency: 'USD', availableMinor: 100n }],
    }),
  ).toThrow('match the bill currency');
});

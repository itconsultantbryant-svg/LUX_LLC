import { describe, expect, it } from 'vitest';
import { estimateEtaMinutes, haversineKm } from './location.js';

describe('haversineKm', () => {
  it('measures one degree of latitude as ~111 km', () => {
    const km = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it('is zero for the same point', () => {
    expect(
      haversineKm({ latitude: 6.29, longitude: -10.76 }, { latitude: 6.29, longitude: -10.76 }),
    ).toBe(0);
  });

  it('is symmetric', () => {
    const a = { latitude: 6.2905, longitude: -10.7686 };
    const b = { latitude: 6.3156, longitude: -10.8072 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe('estimateEtaMinutes', () => {
  it('is at least one minute for any non-negative distance', () => {
    expect(estimateEtaMinutes(0)).toBe(1);
    expect(estimateEtaMinutes(0.1)).toBe(1);
  });

  it('scales linearly with a conservative speed', () => {
    expect(estimateEtaMinutes(24, 24)).toBe(60);
  });

  it('never returns a negative or NaN value', () => {
    expect(estimateEtaMinutes(-5)).toBe(0);
    expect(estimateEtaMinutes(Number.NaN)).toBe(0);
  });
});

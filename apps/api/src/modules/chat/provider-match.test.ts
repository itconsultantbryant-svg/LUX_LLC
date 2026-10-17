import { describe, expect, it } from 'vitest';
import { assessProvider, providerNameScore, type ProviderCandidate } from './provider-match.js';

const now = new Date('2026-10-17T00:00:00.000Z');

function candidate(over: Partial<ProviderCandidate>): ProviderCandidate {
  return {
    id: 'p1',
    legalName: 'SYNTHETIC John F. Kennedy Medical Center',
    providerStatus: 'verified',
    verificationStatus: 'verified',
    method: 'registry_check',
    validUntil: new Date('2027-01-01T00:00:00.000Z'),
    ...over,
  };
}

describe('providerNameScore', () => {
  it('scores exact and contained names highly', () => {
    expect(providerNameScore('Redemption Hospital', 'Redemption Hospital')).toBe(1);
    expect(
      providerNameScore(
        'John F. Kennedy Medical Center',
        'SYNTHETIC John F. Kennedy Medical Center',
      ),
    ).toBeGreaterThanOrEqual(0.9);
  });

  it('scores unrelated names below the match threshold', () => {
    expect(providerNameScore('Hope Clinic', 'Redemption Hospital')).toBeLessThan(0.6);
  });
});

describe('assessProvider', () => {
  it('reports unknown when there is no provider name', () => {
    expect(assessProvider(null, [candidate({})], now).status).toBe('unknown');
  });

  it('reports unknown when nothing matches', () => {
    expect(assessProvider('Hope Clinic', [candidate({})], now).status).toBe('unknown');
  });

  it('reports verified for a valid registry-verified provider', () => {
    const review = assessProvider(
      'Redemption Hospital',
      [candidate({ legalName: 'Redemption Hospital' })],
      now,
    );
    expect(review.status).toBe('verified');
    expect(review.matchedProviderName).toBe('Redemption Hospital');
  });

  it('reports expired when the validity window has passed', () => {
    const review = assessProvider(
      'Redemption Hospital',
      [
        candidate({
          legalName: 'Redemption Hospital',
          validUntil: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
      now,
    );
    expect(review.status).toBe('expired');
  });

  it('reports unverified when the provider is not currently verified', () => {
    const review = assessProvider(
      'Redemption Hospital',
      [candidate({ legalName: 'Redemption Hospital', providerStatus: 'suspended' })],
      now,
    );
    expect(review.status).toBe('unverified');
  });

  it('reports unverified when the latest review is not a registry check', () => {
    const review = assessProvider(
      'Redemption Hospital',
      [candidate({ legalName: 'Redemption Hospital', method: 'legacy' })],
      now,
    );
    expect(review.status).toBe('unverified');
  });
});

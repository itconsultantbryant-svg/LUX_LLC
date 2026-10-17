import type { ChatDocumentReview } from '@healthwallet/shared';

export type ProviderCandidate = {
  id: string;
  legalName: string;
  /** providers.status */
  providerStatus: string;
  /** latest provider_verification_records.status, or null when never reviewed */
  verificationStatus: string | null;
  method: string | null;
  validUntil: Date | null;
};

const MIN_SCORE = 0.6;

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(name: string): Set<string> {
  return new Set(
    normalize(name)
      .split(' ')
      .filter((token) => token.length > 1),
  );
}

/**
 * Deterministic similarity between a name on a bill and a directory provider.
 * Returns 0..1. No model, no network — so the result is reproducible and
 * testable. `1` is an exact match; contains/word-overlap scale down from there.
 */
export function providerNameScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length >= 0.6 * longer.length) return 0.9;
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const token of ta) if (tb.has(token)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

/**
 * Match a provider name extracted from a bill against known providers and decide
 * whether it is verified, expired, unverified, or unknown.
 */
export function assessProvider(
  providerName: string | null,
  candidates: ProviderCandidate[],
  now: Date,
): ChatDocumentReview {
  if (!providerName || !providerName.trim())
    return {
      providerName: null,
      status: 'unknown',
      matchedProviderId: null,
      matchedProviderName: null,
      validUntil: null,
      notes:
        'No provider name was readable on that bill, so I could not match it to the directory.',
    };

  let best: { candidate: ProviderCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const score = providerNameScore(providerName, candidate.legalName);
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { candidate, score };
  }

  if (!best)
    return {
      providerName,
      status: 'unknown',
      matchedProviderId: null,
      matchedProviderName: null,
      validUntil: null,
      notes: `I could not match "${providerName}" to a provider in the directory, so treat it as unverified.`,
    };

  const { candidate, score } = best;
  const validUntil = candidate.validUntil ? candidate.validUntil.toISOString() : null;
  const verifiedNow =
    candidate.providerStatus === 'verified' &&
    candidate.verificationStatus === 'verified' &&
    candidate.method === 'registry_check';

  if (verifiedNow && candidate.validUntil && candidate.validUntil.getTime() <= now.getTime())
    return {
      providerName,
      status: 'expired',
      matchedProviderId: candidate.id,
      matchedProviderName: candidate.legalName,
      validUntil,
      notes: `Matched to ${candidate.legalName}, but its registry verification expired on ${candidate.validUntil.toISOString().slice(0, 10)}. Ask the provider to re-verify before paying.`,
    };

  if (verifiedNow) {
    const confidence = score >= 0.9 ? '' : ' (name match is approximate)';
    return {
      providerName,
      status: 'verified',
      matchedProviderId: candidate.id,
      matchedProviderName: candidate.legalName,
      validUntil,
      notes: `Matched to ${candidate.legalName}, a verified provider${confidence}${validUntil ? `, verified until ${validUntil.slice(0, 10)}` : ''}.`,
    };
  }

  return {
    providerName,
    status: 'unverified',
    matchedProviderId: candidate.id,
    matchedProviderName: candidate.legalName,
    validUntil,
    notes: `Matched to ${candidate.legalName}, but it is not currently verified (status: ${candidate.verificationStatus ?? 'never reviewed'}). Treat this bill as unverified.`,
  };
}

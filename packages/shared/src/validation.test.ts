import { describe, expect, it } from 'vitest';
import {
  APPROVED_VALIDATION_POLICY,
  deriveCustomerStatus,
  decideRoute,
  type ValidationFinding,
} from './validation.js';

const policy = APPROVED_VALIDATION_POLICY;

function finding(
  over: Partial<ValidationFinding> & Pick<ValidationFinding, 'check' | 'result'>,
): ValidationFinding {
  return {
    label: over.check,
    severity: 'info',
    source: 'deterministic',
    evidence: {},
    missingInfo: [],
    recommendedAction: 'none',
    modelVersion: null,
    policyVersion: policy.version,
    ...over,
  };
}

describe('decideRoute', () => {
  it('auto-accepts a valid low-risk bill when required checks pass', () => {
    const decision = decideRoute(
      [
        finding({ check: 'required_fields', result: 'pass' }),
        finding({ check: 'bill_arithmetic', result: 'pass' }),
        finding({ check: 'provider_verification', result: 'pass' }),
        finding({ check: 'exact_duplicate', result: 'pass' }),
        finding({ check: 'available_funding', result: 'pass' }),
        finding({ check: 'funding_restrictions', result: 'pass' }),
        finding({ check: 'price_anomaly', result: 'unavailable' }),
      ],
      policy,
      4000n,
    );
    expect(decision.route).toBe('auto_accept');
    expect(decision.customerStatus).toBe('ready_for_payment');
  });

  it('does not treat an unavailable comparison dataset as a failure', () => {
    const decision = decideRoute(
      [finding({ check: 'price_anomaly', result: 'unavailable', missingInfo: ['benchmark'] })],
      policy,
      4000n,
    );
    expect(decision.route).toBe('auto_accept');
  });

  it('routes an exact duplicate to human review, never auto-approval', () => {
    const decision = decideRoute(
      [finding({ check: 'exact_duplicate', result: 'fail', severity: 'blocking' })],
      policy,
      4000n,
    );
    expect(decision.route).toBe('await_review');
    expect(decision.autoAccepted).toBe(false);
  });

  it('prefers review over correction when an uncertain finding is present', () => {
    const decision = decideRoute(
      [
        finding({ check: 'required_fields', result: 'fail', severity: 'error' }),
        finding({ check: 'near_duplicate', result: 'uncertain' }),
      ],
      policy,
      4000n,
    );
    expect(decision.route).toBe('await_review');
  });

  it('never auto-approves a high-risk amount even when every check passes', () => {
    const decision = decideRoute(
      [finding({ check: 'bill_arithmetic', result: 'pass' })],
      policy,
      BigInt(policy.autoAcceptMaxMinor) + 1n,
    );
    expect(decision.route).toBe('await_review');
    expect(decision.autoAccepted).toBe(false);
  });

  it('maps an unverified provider to awaiting provider confirmation', () => {
    const decision = decideRoute(
      [finding({ check: 'provider_verification', result: 'fail', severity: 'error' })],
      policy,
      4000n,
    );
    expect(decision.route).toBe('await_provider');
    expect(decision.customerStatus).toBe('awaiting_provider');
  });
});

describe('deriveCustomerStatus', () => {
  it('reports paid when a payment settled', () => {
    expect(deriveCustomerStatus('ready_for_payment', { status: 'paid' })).toBe('paid');
  });
  it('reports payment pending when a payment request exists', () => {
    expect(deriveCustomerStatus('ready_for_payment', { status: 'awaiting_auth' })).toBe(
      'payment_pending',
    );
  });
  it('falls back to the validation status with no payment', () => {
    expect(deriveCustomerStatus('awaiting_review', null)).toBe('awaiting_review');
  });
});

import { describe, expect, it } from 'vitest';
import {
  APPROVED_VALIDATION_POLICY,
  decideRoute,
  isTriggering,
  overallResult,
  type CheckResult,
  type CheckSeverity,
  type ValidationFinding,
} from './validation.js';

const policy = APPROVED_VALIDATION_POLICY;

function finding(
  check: ValidationFinding['check'],
  result: CheckResult,
  severity: CheckSeverity = 'info',
): ValidationFinding {
  return {
    check,
    label: check,
    result,
    severity,
    source: 'deterministic',
    evidence: {},
    missingInfo: [],
    recommendedAction: 'none',
    modelVersion: null,
    policyVersion: policy.version,
  };
}

describe('isTriggering', () => {
  it('always triggers on fail and uncertain regardless of severity', () => {
    for (const severity of ['info', 'warning', 'error', 'blocking'] as CheckSeverity[]) {
      expect(isTriggering(finding('bill_arithmetic', 'fail', severity))).toBe(true);
      expect(isTriggering(finding('bill_arithmetic', 'uncertain', severity))).toBe(true);
    }
  });

  it('triggers on a warning only when it is error or blocking severity', () => {
    expect(isTriggering(finding('price_anomaly', 'warn', 'info'))).toBe(false);
    expect(isTriggering(finding('price_anomaly', 'warn', 'warning'))).toBe(false);
    expect(isTriggering(finding('price_anomaly', 'warn', 'error'))).toBe(true);
    expect(isTriggering(finding('price_anomaly', 'warn', 'blocking'))).toBe(true);
  });

  it('never triggers on pass, info or not_applicable', () => {
    for (const result of ['pass', 'info', 'not_applicable'] as CheckResult[]) {
      expect(isTriggering(finding('required_fields', result, 'blocking'))).toBe(false);
    }
  });

  // `unavailable` is deliberately NOT triggering: a missing comparison dataset is
  // not a reason to block a bill (documented behaviour).
  it('does not trigger on an unavailable comparison dataset', () => {
    expect(isTriggering(finding('price_anomaly', 'unavailable', 'info'))).toBe(false);
  });
});

describe('decideRoute precedence', () => {
  it('lets decline outrank every other triggering route', () => {
    const decision = decideRoute(
      [
        finding('customer_eligibility', 'fail', 'blocking'),
        finding('exact_duplicate', 'fail', 'blocking'),
        finding('provider_verification', 'fail', 'error'),
        finding('bill_arithmetic', 'fail', 'error'),
      ],
      policy,
      4000n,
    );
    expect(decision.route).toBe('decline');
    expect(decision.customerStatus).toBe('declined');
  });

  it('lets review outrank provider and correction', () => {
    expect(
      decideRoute(
        [
          finding('exact_duplicate', 'fail', 'blocking'),
          finding('provider_verification', 'fail', 'error'),
          finding('bill_arithmetic', 'fail', 'error'),
        ],
        policy,
        4000n,
      ).route,
    ).toBe('await_review');
  });

  it('lets provider confirmation outrank correction', () => {
    expect(
      decideRoute(
        [
          finding('provider_verification', 'fail', 'error'),
          finding('bill_arithmetic', 'fail', 'error'),
        ],
        policy,
        4000n,
      ).route,
    ).toBe('await_provider');
  });

  it('routes to correction when only correction checks trigger', () => {
    expect(decideRoute([finding('available_funding', 'fail', 'error')], policy, 4000n).route).toBe(
      'needs_correction',
    );
  });

  it('reports triggers by check name and marks auto-accept explicitly', () => {
    const clean = decideRoute([finding('bill_arithmetic', 'pass')], policy, 4000n);
    expect(clean.autoAccepted).toBe(true);
    expect(clean.triggers).toEqual([]);

    const flagged = decideRoute([finding('exact_duplicate', 'fail', 'blocking')], policy, 4000n);
    expect(flagged.autoAccepted).toBe(false);
    expect(flagged.triggers).toContain('exact_duplicate');
  });

  it('auto-accepts with a bare validation_complete status when funding checks are absent', () => {
    const decision = decideRoute([finding('bill_arithmetic', 'pass')], policy, 4000n);
    expect(decision.route).toBe('auto_accept');
    expect(decision.customerStatus).toBe('validation_complete');
  });
});

describe('overallResult', () => {
  it('prefers fail, then uncertain, then warn, then pass', () => {
    expect(overallResult([finding('required_fields', 'warn', 'error')])).toBe('warn');
    expect(
      overallResult([
        finding('required_fields', 'warn', 'error'),
        finding('bill_arithmetic', 'uncertain'),
      ]),
    ).toBe('uncertain');
    expect(
      overallResult([
        finding('required_fields', 'warn', 'error'),
        finding('bill_arithmetic', 'uncertain'),
        finding('available_funding', 'fail', 'error'),
      ]),
    ).toBe('fail');
    expect(overallResult([finding('available_funding', 'pass')])).toBe('pass');
  });

  it('treats an empty finding set as a pass', () => {
    expect(overallResult([])).toBe('pass');
  });
});

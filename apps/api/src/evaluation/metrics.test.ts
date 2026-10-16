import { describe, expect, it } from 'vitest';
import {
  aiLatency,
  automationAll,
  automationEligible,
  computeReport,
  escalationRate,
  falsePositiveRate,
  fieldAccuracy,
  incorrectAutomatedOutcomes,
  missedSuspiciousRate,
  paymentReliability,
  reviewNotSuppressed,
  scenarioDetectionMetrics,
  uncertaintyRoutingRate,
  userTaskCompletion,
  type ExtractionObservation,
  type ScenarioObservation,
} from './metrics.js';

function comparison(
  field: ExtractionObservation['fields'][number]['field'],
  expected: string | number | null | undefined,
  actual: string | number | null,
) {
  return { field, expected, actual, correct: expected === undefined ? null : expected === actual };
}

function extraction(overrides: Partial<ExtractionObservation>): ExtractionObservation {
  return {
    caseId: 'case',
    label: 'case',
    category: 'clean',
    shouldFlag: false,
    requiresReview: false,
    status: 'extracted',
    findingCodes: [],
    fields: [],
    confidence: 1,
    latencyMs: 10,
    aiInvolved: true,
    ...overrides,
  };
}

function scenario(overrides: Partial<ScenarioObservation>): ScenarioObservation {
  return {
    id: 'scenario',
    label: 'scenario',
    kind: 'exact_duplicate',
    detected: true,
    route: 'await_review',
    expectedRoute: 'await_review',
    reviewRequired: true,
    shouldFlag: true,
    ...overrides,
  };
}

describe('evaluation metrics', () => {
  it('counts field accuracy only over cases that label the field', () => {
    const observations = [
      extraction({
        fields: [comparison('totalAmountMinor', 4000, 4000), comparison('currency', 'LRD', 'LRD')],
      }),
      extraction({
        fields: [
          comparison('totalAmountMinor', 5000, 4000),
          comparison('currency', undefined, 'LRD'),
        ],
      }),
    ];
    const total = fieldAccuracy(observations, 'totalAmountMinor');
    expect(total.numerator).toBe(1);
    expect(total.denominator).toBe(2);
    const currency = fieldAccuracy(observations, 'currency');
    expect(currency.numerator).toBe(1);
    expect(currency.denominator).toBe(1);
  });

  it('treats an explicitly absent field as its own label', () => {
    const observations = [
      extraction({ fields: [comparison('currency', null, null)] }),
      extraction({ fields: [comparison('currency', null, 'LRD')] }),
    ];
    const metric = fieldAccuracy(observations, 'currency');
    expect(metric.numerator).toBe(1);
    expect(metric.denominator).toBe(2);
  });

  it('measures false positives over clean cases only', () => {
    const metric = falsePositiveRate([
      extraction({ shouldFlag: false, requiresReview: true }),
      extraction({ shouldFlag: false, requiresReview: false }),
      extraction({ shouldFlag: true, requiresReview: true }),
    ]);
    expect(metric.numerator).toBe(1);
    expect(metric.denominator).toBe(2);
  });

  it('counts missed suspicious cases across extraction and scenarios', () => {
    const metric = missedSuspiciousRate(
      [
        extraction({ shouldFlag: true, requiresReview: false }),
        extraction({ shouldFlag: true, requiresReview: true }),
      ],
      [
        scenario({ shouldFlag: true, detected: false }),
        scenario({ shouldFlag: true, detected: true }),
      ],
    );
    expect(metric.numerator).toBe(2);
    expect(metric.denominator).toBe(4);
  });

  it('flags suppression of necessary review', () => {
    expect(reviewNotSuppressed([extraction({ shouldFlag: true, requiresReview: false })], [])).toBe(
      false,
    );
    expect(reviewNotSuppressed([extraction({ shouldFlag: true, requiresReview: true })], [])).toBe(
      true,
    );
  });

  it('measures uncertainty routing over uncertain cases', () => {
    const metric = uncertaintyRoutingRate([
      extraction({ category: 'uncertain', requiresReview: true }),
      extraction({ category: 'uncertain', requiresReview: false }),
      extraction({ category: 'clean', requiresReview: true }),
    ]);
    expect(metric.numerator).toBe(1);
    expect(metric.denominator).toBe(2);
  });

  it('keeps eligible automation distinct from all automation', () => {
    const observations = [
      extraction({ shouldFlag: false, requiresReview: false }),
      extraction({ shouldFlag: true, requiresReview: false }),
      extraction({ shouldFlag: true, requiresReview: true }),
    ];
    const eligible = automationEligible(observations);
    const all = automationAll(observations);
    expect(eligible.numerator).toBe(1);
    expect(eligible.denominator).toBe(1);
    expect(all.numerator).toBe(2);
    expect(all.denominator).toBe(3);
  });

  it('reports incorrect automated outcomes against all human-free decisions', () => {
    const metric = incorrectAutomatedOutcomes(
      [
        extraction({ shouldFlag: true, requiresReview: false }),
        extraction({ shouldFlag: false, requiresReview: false }),
      ],
      [scenario({ reviewRequired: true, shouldFlag: true })],
    );
    expect(metric.numerator).toBe(1);
    expect(metric.denominator).toBe(2);
  });

  it('reports scenario detection per class with class denominators', () => {
    const metrics = scenarioDetectionMetrics([
      scenario({ kind: 'exact_duplicate', detected: true }),
      scenario({ kind: 'exact_duplicate', detected: false }),
      scenario({ kind: 'near_duplicate', detected: true }),
    ]);
    const exact = metrics.find((m) => m.id === 'duplicate.exact.detection');
    const near = metrics.find((m) => m.id === 'duplicate.near.detection');
    expect(exact?.numerator).toBe(1);
    expect(exact?.denominator).toBe(2);
    expect(near?.numerator).toBe(1);
    expect(near?.denominator).toBe(1);
  });

  it('computes AI latency percentiles over AI-involving cases', () => {
    const observations = [10, 20, 30, 40, 50].map((latencyMs, index) =>
      extraction({ caseId: `c${index}`, latencyMs }),
    );
    const [p50, p95] = aiLatency(observations);
    expect(p50.denominator).toBe(5);
    expect(p50.numerator).toBe(30);
    expect(p95.numerator).toBe(50);
  });

  it('counts validation escalations over all scenarios', () => {
    const metric = escalationRate([
      scenario({ route: 'await_review' }),
      scenario({ route: 'auto_accept' }),
      scenario({ route: 'await_review' }),
    ]);
    expect(metric.numerator).toBe(2);
    expect(metric.denominator).toBe(3);
  });

  it('returns null value when a denominator is zero', () => {
    const metric = fieldAccuracy([extraction({ fields: [] })], 'currency');
    expect(metric.denominator).toBe(0);
    expect(metric.value).toBeNull();
  });

  it('reports payment reliability with a receipt denominator', () => {
    const metrics = paymentReliability([
      {
        id: 'p1',
        label: 'p1',
        attempted: true,
        succeeded: true,
        receiptIssued: true,
        duplicateCallbackIdempotent: true,
      },
      {
        id: 'p2',
        label: 'p2',
        attempted: true,
        succeeded: false,
        receiptIssued: false,
        duplicateCallbackIdempotent: false,
      },
    ]);
    const reliability = metrics.find((m) => m.id === 'payment.reliability');
    const idempotent = metrics.find((m) => m.id === 'payment.callback.idempotent');
    const receipts = metrics.find((m) => m.id === 'payment.receipts');
    expect(reliability?.numerator).toBe(1);
    expect(reliability?.denominator).toBe(2);
    expect(idempotent?.numerator).toBe(1);
    expect(receipts?.numerator).toBe(1);
    expect(receipts?.denominator).toBe(1);
  });

  it('computes user task completion', () => {
    const metric = userTaskCompletion([
      { id: 't1', label: 't1', completed: true },
      { id: 't2', label: 't2', completed: false },
    ]);
    expect(metric.numerator).toBe(1);
    expect(metric.denominator).toBe(2);
  });

  it('assembles a report with a definition for every metric', () => {
    const report = computeReport({
      datasetVersion: 'test-v1',
      extraction: [extraction({ fields: [comparison('currency', 'LRD', 'LRD')] })],
      scenarios: [scenario({})],
    });
    expect(report.datasetVersion).toBe('test-v1');
    expect(report.counts.extractionCases).toBe(1);
    expect(report.metrics.length).toBeGreaterThan(10);
    expect(report.metrics.every((m) => m.definition.length > 0)).toBe(true);
  });
});

/**
 * Pure metric computation for the evaluation suite.
 *
 * Every reported number is a `Metric` with an explicit numerator and
 * denominator and a definition, so no percentage can be read without knowing
 * what it was measured against. Nothing here touches the database or a model:
 * it is deterministic given the observations.
 */

import type { CriticalField } from './dataset.js';
import { CRITICAL_FIELDS } from './dataset.js';

export type FieldComparison = {
  field: CriticalField;
  /** `undefined` means the case did not label this field (excluded). */
  expected: string | number | null | undefined;
  actual: string | number | null;
  correct: boolean | null;
};

export type ExtractionObservation = {
  caseId: string;
  label: string;
  category: string;
  shouldFlag: boolean;
  requiresReview: boolean;
  status: string;
  findingCodes: string[];
  fields: FieldComparison[];
  confidence: number;
  latencyMs: number;
  aiInvolved: boolean;
};

export type ScenarioObservation = {
  id: string;
  label: string;
  kind: string;
  /** True when the expected finding was actually produced. */
  detected: boolean;
  route: string;
  expectedRoute: string;
  reviewRequired: boolean;
  /** Ground truth: a person should look at this scenario. */
  shouldFlag: boolean;
};

export type PaymentObservation = {
  id: string;
  label: string;
  attempted: boolean;
  succeeded: boolean;
  receiptIssued: boolean;
  duplicateCallbackIdempotent: boolean;
};

export type TaskObservation = {
  id: string;
  label: string;
  completed: boolean;
};

export type Metric = {
  id: string;
  label: string;
  numerator: number;
  denominator: number;
  /** numerator/denominator, or null when the denominator is zero. */
  value: number | null;
  unit: 'ratio' | 'rate' | 'count' | 'milliseconds';
  definition: string;
  notes?: string;
};

function metric(
  id: string,
  label: string,
  numerator: number,
  denominator: number,
  unit: Metric['unit'],
  definition: string,
  notes?: string,
): Metric {
  return {
    id,
    label,
    numerator,
    denominator,
    value:
      denominator === 0
        ? null
        : unit === 'count' || unit === 'milliseconds'
          ? numerator
          : numerator / denominator,
    unit,
    definition,
    ...(notes ? { notes } : {}),
  };
}

export type EvaluationInput = {
  datasetVersion: string;
  extraction: ExtractionObservation[];
  scenarios: ScenarioObservation[];
  payments?: PaymentObservation[];
  tasks?: TaskObservation[];
  /** Command that regenerates this report. */
  command?: string;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

/** Extraction accuracy for a single critical field, over labeled cases only. */
export function fieldAccuracy(observations: ExtractionObservation[], field: CriticalField): Metric {
  let numerator = 0;
  let denominator = 0;
  for (const observation of observations) {
    const comparison = observation.fields.find((item) => item.field === field);
    if (!comparison || comparison.expected === undefined) continue;
    denominator += 1;
    if (comparison.correct) numerator += 1;
  }
  return metric(
    `extraction.accuracy.${field}`,
    `Extraction accuracy — ${field}`,
    numerator,
    denominator,
    'rate',
    `Correctly extracted (including correctly absent) ${field} divided by evaluation cases that label ${field}.`,
  );
}

export function extractionAccuracyByField(observations: ExtractionObservation[]): Metric[] {
  return CRITICAL_FIELDS.map((field) => fieldAccuracy(observations, field));
}

export function extractionAccuracyOverall(observations: ExtractionObservation[]): Metric {
  let numerator = 0;
  let denominator = 0;
  for (const observation of observations) {
    for (const comparison of observation.fields) {
      if (comparison.expected === undefined) continue;
      denominator += 1;
      if (comparison.correct) numerator += 1;
    }
  }
  return metric(
    'extraction.accuracy.overall',
    'Extraction accuracy — all labeled critical fields',
    numerator,
    denominator,
    'rate',
    'Correctly extracted critical fields divided by all labeled critical fields across cases.',
  );
}

/** Detection rate for a class of scenario (duplicate, arithmetic, ...). */
export function scenarioDetection(
  scenarios: ScenarioObservation[],
  kind: string,
  id: string,
  label: string,
): Metric {
  const relevant = scenarios.filter((scenario) => scenario.kind === kind);
  const numerator = relevant.filter((scenario) => scenario.detected).length;
  return metric(
    id,
    label,
    numerator,
    relevant.length,
    'rate',
    `Scenario class "${kind}" detected by the deterministic pipeline divided by all seeded "${kind}" scenarios.`,
  );
}

export function scenarioDetectionMetrics(scenarios: ScenarioObservation[]): Metric[] {
  return [
    scenarioDetection(
      scenarios,
      'exact_duplicate',
      'duplicate.exact.detection',
      'Exact-duplicate detection',
    ),
    scenarioDetection(
      scenarios,
      'near_duplicate',
      'duplicate.near.detection',
      'Near-duplicate detection',
    ),
    scenarioDetection(
      scenarios,
      'arithmetic',
      'arithmetic.detection',
      'Arithmetic validation detection',
    ),
    scenarioDetection(scenarios, 'provider', 'provider.detection', 'Unverified-provider detection'),
    scenarioDetection(scenarios, 'funding', 'funding.detection', 'Insufficient-funding detection'),
    scenarioDetection(
      scenarios,
      'restriction',
      'restriction.detection',
      'Funding-restriction detection',
    ),
  ];
}

/** Route agreement: did the pipeline route to the policy-required outcome? */
export function routingAgreement(scenarios: ScenarioObservation[]): Metric {
  const numerator = scenarios.filter(
    (scenario) => scenario.route === scenario.expectedRoute,
  ).length;
  return metric(
    'routing.agreement',
    'Routing agreement with approved policy',
    numerator,
    scenarios.length,
    'rate',
    'Seeded scenarios whose validation route equals the approved-policy route, over all seeded scenarios.',
  );
}

/** Escalations: validation cases handed to a human reviewer. */
export function escalationRate(scenarios: ScenarioObservation[]): Metric {
  const numerator = scenarios.filter((scenario) => scenario.route === 'await_review').length;
  return metric(
    'escalation.validation',
    'Cases escalated to human review (validation layer)',
    numerator,
    scenarios.length,
    'rate',
    'Seeded validation scenarios routed to await_review, over all seeded scenarios. Escalation is not inherently bad; necessary review must never be suppressed.',
  );
}

/** False positives: cases that are genuinely fine but were flagged for review. */
export function falsePositiveRate(observations: ExtractionObservation[]): Metric {
  const clean = observations.filter((observation) => !observation.shouldFlag);
  const numerator = clean.filter((observation) => observation.requiresReview).length;
  return metric(
    'extraction.false_positive',
    'Incorrectly flagged clean cases (false positives)',
    numerator,
    clean.length,
    'rate',
    'Clean cases (ground truth: no review needed) that were nonetheless routed to review, over all clean cases.',
  );
}

/** Missed suspicious cases: ground truth says flag, but nothing did. */
export function missedSuspiciousRate(
  extraction: ExtractionObservation[],
  scenarios: ScenarioObservation[],
): Metric {
  const suspiciousExtraction = extraction.filter((observation) => observation.shouldFlag);
  const suspiciousScenarios = scenarios.filter((scenario) => scenario.shouldFlag);
  const denominator = suspiciousExtraction.length + suspiciousScenarios.length;
  const missedExtraction = suspiciousExtraction.filter(
    (observation) => !observation.requiresReview,
  ).length;
  const missedScenarios = suspiciousScenarios.filter((scenario) => !scenario.detected).length;
  return metric(
    'suspicious.missed',
    'Missed suspicious cases (false negatives)',
    missedExtraction + missedScenarios,
    denominator,
    'rate',
    'Suspicious cases (ground truth: needs a person) that were neither flagged nor detected, over all suspicious cases.',
  );
}

/** Uncertainty routing: uncertain cases that reached a human, over uncertain cases. */
export function uncertaintyRoutingRate(observations: ExtractionObservation[]): Metric {
  const uncertain = observations.filter((observation) => observation.category === 'uncertain');
  const numerator = uncertain.filter((observation) => observation.requiresReview).length;
  return metric(
    'uncertainty.routing',
    'Uncertain cases routed to a person',
    numerator,
    uncertain.length,
    'rate',
    'Cases classified uncertain (unreadable / ambiguous / low confidence) that required review, over all uncertain cases.',
  );
}

/** Human-review workload. */
export function reviewWorkload(observations: ExtractionObservation[]): Metric {
  const numerator = observations.filter((observation) => observation.requiresReview).length;
  return metric(
    'review.workload',
    'Human-review workload (extraction layer)',
    numerator,
    observations.length,
    'rate',
    'Extraction cases that required human review, over all extraction cases.',
    'A high workload is not inherently bad; necessary review must never be suppressed.',
  );
}

/** Cases processed without manual review, among those eligible for automation. */
export function automationEligible(observations: ExtractionObservation[]): Metric {
  const eligible = observations.filter((observation) => !observation.shouldFlag);
  const numerator = eligible.filter((observation) => !observation.requiresReview).length;
  return metric(
    'automation.eligible',
    'Eligible cases processed without manual review',
    numerator,
    eligible.length,
    'rate',
    'Cases with ground truth "no review needed" that were processed without review, over all such eligible cases.',
  );
}

/** All cases processed without manual review. */
export function automationAll(observations: ExtractionObservation[]): Metric {
  const numerator = observations.filter((observation) => !observation.requiresReview).length;
  return metric(
    'automation.all',
    'All cases processed without manual review',
    numerator,
    observations.length,
    'rate',
    'Extraction cases processed without review, over all extraction cases (including ones that should have been reviewed).',
  );
}

/** Incorrect automated outcomes: automated passes on cases that should have been flagged. */
export function incorrectAutomatedOutcomes(
  extraction: ExtractionObservation[],
  scenarios: ScenarioObservation[],
): Metric {
  const automatedExtraction = extraction.filter((observation) => !observation.requiresReview);
  const automatedScenarios = scenarios.filter((scenario) => !scenario.reviewRequired);
  const adjustedAutomation = [
    ...automatedExtraction.map((o) => o.shouldFlag),
    ...automatedScenarios.map((s) => s.shouldFlag),
  ];
  const wrong =
    automatedExtraction.filter((observation) => observation.shouldFlag).length +
    automatedScenarios.filter((scenario) => scenario.shouldFlag).length;
  return metric(
    'automation.incorrect',
    'Incorrect automated outcomes',
    wrong,
    adjustedAutomation.length,
    'rate',
    'Automated (no-human) passes whose ground truth says a person was needed, over all decisions made without a human in the loop.',
  );
}

/** Workflows that involve AI, over all evaluated workflows. */
export function aiInvolvedShare(
  extraction: ExtractionObservation[],
  scenarios: ScenarioObservation[],
): Metric {
  const denominator = extraction.length + scenarios.length;
  const numerator = extraction.filter((observation) => observation.aiInvolved).length;
  return metric(
    'workflow.ai',
    'Workflows involving AI',
    numerator,
    denominator,
    'rate',
    'Evaluated workflows where an AI adapter participated, over all evaluated workflows.',
  );
}

export function aiLatency(observations: ExtractionObservation[]): Metric[] {
  const ai = observations
    .filter((observation) => observation.aiInvolved)
    .map((o) => o.latencyMs)
    .sort((a, b) => a - b);
  const p50 = percentile(ai, 50);
  const p95 = percentile(ai, 95);
  return [
    metric(
      'ai.latency.p50',
      'AI extraction latency — p50',
      p50 === null ? 0 : Math.round(p50),
      ai.length,
      'milliseconds',
      'Median wall-clock duration of AI extraction calls, over all AI-involving extraction cases.',
    ),
    metric(
      'ai.latency.p95',
      'AI extraction latency — p95',
      p95 === null ? 0 : Math.round(p95),
      ai.length,
      'milliseconds',
      '95th-percentile wall-clock duration of AI extraction calls, over all AI-involving extraction cases.',
    ),
  ];
}

export function paymentReliability(payments: PaymentObservation[]): Metric[] {
  const attempted = payments.filter((payment) => payment.attempted);
  return [
    metric(
      'payment.reliability',
      'Payment reliability',
      attempted.filter((payment) => payment.succeeded).length,
      attempted.length,
      'rate',
      'Attempted payments that reached the succeeded terminal state with a receipt, over all attempted payments.',
    ),
    metric(
      'payment.callback.idempotent',
      'Repeated-callback recovery',
      attempted.filter((payment) => payment.duplicateCallbackIdempotent).length,
      attempted.length,
      'rate',
      'Attempted payments where a replayed provider callback changed nothing, over all attempted payments.',
    ),
    metric(
      'payment.receipts',
      'Receipts issued for succeeded payments',
      attempted.filter((payment) => payment.succeeded && payment.receiptIssued).length,
      attempted.filter((payment) => payment.succeeded).length,
      'rate',
      'Succeeded payments that produced a receipt, over all succeeded payments.',
    ),
  ];
}

export function userTaskCompletion(tasks: TaskObservation[]): Metric {
  return metric(
    'tasks.completion',
    'User task completion',
    tasks.filter((task) => task.completed).length,
    tasks.length,
    'rate',
    'Seeded end-to-end user tasks that completed the expected outcome, over all seeded tasks.',
  );
}

/**
 * The "never suppress necessary review" guard: automation must not come at the
 * cost of missed suspicious cases. Returns true when no suspicious case was
 * silently auto-accepted.
 */
export function reviewNotSuppressed(
  extraction: ExtractionObservation[],
  scenarios: ScenarioObservation[],
): boolean {
  const missedExtraction = extraction.some((o) => o.shouldFlag && !o.requiresReview);
  const missedScenarios = scenarios.some((s) => s.shouldFlag && !s.reviewRequired && !s.detected);
  return !missedExtraction && !missedScenarios;
}

export type EvaluationReport = {
  datasetVersion: string;
  generatedAt: string;
  command: string;
  counts: {
    extractionCases: number;
    scenarios: number;
    payments: number;
    tasks: number;
  };
  metrics: Metric[];
  reviewNotSuppressed: boolean;
};

export function computeReport(input: EvaluationInput, now = new Date()): EvaluationReport {
  const hasExtraction = input.extraction.length > 0;
  const hasScenarios = input.scenarios.length > 0;
  const metrics: Metric[] = [];

  if (hasExtraction) {
    metrics.push(
      extractionAccuracyOverall(input.extraction),
      ...extractionAccuracyByField(input.extraction),
      falsePositiveRate(input.extraction),
      uncertaintyRoutingRate(input.extraction),
      reviewWorkload(input.extraction),
      automationEligible(input.extraction),
      automationAll(input.extraction),
      ...aiLatency(input.extraction),
    );
  }
  if (hasScenarios) {
    metrics.push(
      ...scenarioDetectionMetrics(input.scenarios),
      routingAgreement(input.scenarios),
      escalationRate(input.scenarios),
    );
  }
  if (hasExtraction || hasScenarios) {
    metrics.push(
      missedSuspiciousRate(input.extraction, input.scenarios),
      incorrectAutomatedOutcomes(input.extraction, input.scenarios),
      aiInvolvedShare(input.extraction, input.scenarios),
    );
  }
  if (input.payments) metrics.push(...paymentReliability(input.payments));
  if (input.tasks) metrics.push(userTaskCompletion(input.tasks));

  return {
    datasetVersion: input.datasetVersion,
    generatedAt: now.toISOString(),
    command: input.command ?? 'test:evaluation',
    counts: {
      extractionCases: input.extraction.length,
      scenarios: input.scenarios.length,
      payments: input.payments?.length ?? 0,
      tasks: input.tasks?.length ?? 0,
    },
    metrics,
    reviewNotSuppressed: reviewNotSuppressed(input.extraction, input.scenarios),
  };
}

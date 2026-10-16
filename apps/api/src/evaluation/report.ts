import type { EvaluationReport, Metric } from './metrics.js';

function formatValue(metric: Metric): string {
  if (metric.denominator === 0) return 'n/a (0 denominator)';
  if (metric.unit === 'milliseconds') return `${metric.numerator} ms`;
  if (metric.unit === 'count') return String(metric.numerator);
  return `${(metric.value ?? 0).toFixed(3)} (${metric.numerator}/${metric.denominator})`;
}

export function renderMarkdown(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push('# LUX evaluation report');
  lines.push('');
  lines.push(`- Dataset version: \`${report.datasetVersion}\``);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(
    `- Cases: ${report.counts.extractionCases} extraction, ${report.counts.scenarios} validation scenarios, ${report.counts.payments} payments, ${report.counts.tasks} tasks`,
  );
  lines.push(
    `- Necessary review not suppressed: **${report.reviewNotSuppressed ? 'yes' : 'NO — investigate'}**`,
  );
  lines.push('');
  lines.push(
    'Every rate below states its numerator over its denominator. A number is never reported without a known denominator.',
  );
  lines.push('');
  lines.push('| Metric | Value | Unit | Definition |');
  lines.push('| --- | --- | --- | --- |');
  for (const metric of report.metrics) {
    lines.push(
      `| ${metric.label} | ${formatValue(metric)} | ${metric.unit} | ${metric.definition}${metric.notes ? ` _(${metric.notes})_` : ''} |`,
    );
  }
  lines.push('');
  lines.push('## How to reproduce');
  lines.push('');
  lines.push(
    `\`pnpm --filter @healthwallet/api ${report.command}\` (requires the isolated \`_test\` database and the matching \`*_DATABASE_TESTS=1\` flag).`,
  );
  lines.push('');
  return lines.join('\n');
}

export function renderJson(report: EvaluationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

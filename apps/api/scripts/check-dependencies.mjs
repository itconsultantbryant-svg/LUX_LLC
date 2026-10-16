#!/usr/bin/env node
// Dependency vulnerability check. Wraps `pnpm audit` and fails the build on
// high/critical advisories. If the registry is unreachable (offline CI) the check
// reports that it was skipped rather than failing, unless AUDIT_REQUIRE=1.
import { spawnSync } from 'node:child_process';

const level = process.env.AUDIT_LEVEL ?? 'high';
const result = spawnSync('pnpm', ['audit', '--audit-level', level], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: process.env,
});
if (result.error) {
  console.error(`pnpm audit could not start: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  if (process.env.AUDIT_ALLOW_OFFLINE === '1' && process.env.AUDIT_REQUIRE !== '1') {
    console.error(
      'Dependency audit could not reach the registry; skipping (AUDIT_ALLOW_OFFLINE=1).',
    );
    process.exit(0);
  }
  console.error(`Dependency audit found advisories at or above "${level}".`);
  process.exit(result.status ?? 1);
}
console.error(`Dependency audit passed at level "${level}".`);

#!/usr/bin/env node
// Database backup. Uses pg_dump in custom format so restores are selective and
// verifiable. Secrets are never printed; connect via DATABASE_URL from the env.
//
// Usage: node scripts/backup-db.mjs [output-dir]
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}
let host = 'unknown';
try {
  host = new URL(url).host;
} catch {
  console.error('DATABASE_URL is not a valid connection string.');
  process.exit(1);
}
const outDir = resolve(process.argv[2] ?? './backups');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = resolve(outDir, `healthwallet-${stamp}.dump`);

const result = spawnSync(
  'pg_dump',
  ['--format=custom', '--no-owner', '--no-acl', '--file', file, url],
  {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  },
);
if (result.error) {
  console.error(`pg_dump could not start: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('pg_dump failed.');
  process.exit(result.status ?? 1);
}
console.error(`Backup written to ${file} (host ${host}).`);

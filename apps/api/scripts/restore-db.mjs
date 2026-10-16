#!/usr/bin/env node
// Database restore. Destructive: requires RESTORE_CONFIRM=yes and refuses to run
// against a database whose name does not end in _restore or when the URL looks
// like a production endpoint (contains .neon.tech) unless RESTORE_ALLOW_REMOTE=yes.
//
// Usage: RESTORE_CONFIRM=yes node scripts/restore-db.mjs path/to/backup.dump
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('Usage: RESTORE_CONFIRM=yes node scripts/restore-db.mjs path/to/backup.dump');
  process.exit(1);
}
if (process.env.RESTORE_CONFIRM !== 'yes') {
  console.error('Refusing to restore without RESTORE_CONFIRM=yes.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}
let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error('DATABASE_URL is not a valid connection string.');
  process.exit(1);
}
const dbName = parsed.pathname.replace(/^\//, '');
if (parsed.hostname.endsWith('.neon.tech') && process.env.RESTORE_ALLOW_REMOTE !== 'yes') {
  console.error(
    'Remote restore requires RESTORE_ALLOW_REMOTE=yes (this looks like a hosted database).',
  );
  process.exit(1);
}
if (!dbName.endsWith('_restore') && process.env.RESTORE_ALLOW_ANY !== 'yes') {
  console.error(
    `Restore target "${dbName}" is not a *_restore database. Set RESTORE_ALLOW_ANY=yes to override.`,
  );
  process.exit(1);
}

const result = spawnSync(
  'pg_restore',
  ['--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname', url, resolve(file)],
  { stdio: ['ignore', 'inherit', 'inherit'], env: process.env },
);
if (result.error) {
  console.error(`pg_restore could not start: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('pg_restore reported an error.');
  process.exit(result.status ?? 1);
}
console.error(`Restore from ${resolve(file)} completed into ${dbName}.`);

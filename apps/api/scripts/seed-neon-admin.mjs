// One-command refresh of the deployed (Neon) development administrator.
//
// Reads the Neon connection string from apps/api/.env.neon (git-ignored) or the
// NEON_DATABASE_URL_UNPOOLED environment variable, then delegates to
// seed-dev-admin.mjs with the dedicated admin phone. It is a convenience wrapper
// for local/testing only and never runs against production (the seed script
// enforces the same). No HTTP endpoint invokes this.
//
// Usage:
//   pnpm seed:admin:neon            # default phone +231770000001
//   pnpm seed:admin:neon +2317...   # or a specific E.164 phone
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '..', '.env.neon'), quiet: true });

const url = process.env.NEON_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error(
    'Missing Neon connection string. Set NEON_DATABASE_URL_UNPOOLED in apps/api/.env.neon.',
  );
  process.exit(1);
}
if (/prod/i.test(url)) {
  console.error('Refusing to run: the connection string looks like production.');
  process.exit(1);
}

const phone = process.argv[2] ?? '+231770000001';
const result = spawnSync(process.execPath, [resolve(here, 'seed-dev-admin.mjs'), phone], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL_UNPOOLED: url, APP_ENV: 'development' },
});
process.exit(result.status ?? 1);

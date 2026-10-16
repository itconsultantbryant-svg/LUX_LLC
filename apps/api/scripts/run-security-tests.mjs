import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
const local = parse(readFileSync(new URL('../.env', import.meta.url)));
const url = new URL(local.DATABASE_URL_UNPOOLED || local.DATABASE_URL);
url.pathname = '/healthwallet_test';
const env = {
  ...process.env,
  ...local,
  APP_ENV: 'test',
  DATABASE_URL: url.href,
  DATABASE_URL_UNPOOLED: url.href,
  IDENTITY_DATABASE_TESTS: '1',
  SECURITY_DATABASE_TESTS: '1',
};
for (const args of [
  ['db:migrate'],
  [
    'exec',
    'vitest',
    'run',
    'src/modules/security/security.integration.test.ts',
    'src/modules/identity/postgres.integration.test.ts',
    '--testTimeout=60000',
    '--hookTimeout=60000',
    ...process.argv.slice(2),
  ],
]) {
  const result = spawnSync('pnpm', args, {
    cwd: new URL('..', import.meta.url),
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

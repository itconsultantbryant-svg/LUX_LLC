import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
const local = parse(readFileSync(new URL('../.env', import.meta.url)));
const url = new URL(local.DATABASE_URL_UNPOOLED || local.DATABASE_URL);
url.pathname = '/healthwallet_test';
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    'src/evaluation/evaluation.integration.test.ts',
    '--testTimeout=120000',
    '--hookTimeout=120000',
    ...process.argv.slice(2),
  ],
  {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      ...local,
      APP_ENV: 'test',
      STORAGE_ADAPTER: 'local',
      DATABASE_URL: url.href,
      EVALUATION_DATABASE_TESTS: '1',
    },
    stdio: 'inherit',
  },
);
process.exitCode = result.status ?? 1;

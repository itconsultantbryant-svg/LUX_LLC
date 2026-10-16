import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildApp } from '../app.js';
import { createDb } from '../db/client.js';
import { createAdapters } from '../adapters/index.js';
import { loadEnv } from '../config/env.js';
import { tokenHash } from '../modules/identity/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import { seedCore, seedId } from '../modules/ledger/seed.js';

describe.skipIf(process.env.PERF_SMOKE !== '1')(
  'performance smoke on bandwidth-limited assumptions',
  () => {
    let pool: pg.Pool, admin: pg.Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const schema = `perf_smoke_${Date.now()}`;
    let cookie: string;

    beforeAll(async () => {
      if (
        process.env.APP_ENV !== 'test' ||
        !new URL(process.env.DATABASE_URL ?? 'http://invalid').pathname.endsWith('_test')
      )
        throw Error('Use isolated test database');
      admin = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 15000,
        query_timeout: 45000,
      });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 12,
        connectionTimeoutMillis: 15000,
        query_timeout: 45000,
        options: `-c search_path=${schema}`,
      });
      const folder = new URL('../../drizzle/', import.meta.url);
      const history = JSON.parse(readFileSync(new URL('meta/_journal.json', folder), 'utf8'));
      for (const entry of history.entries)
        await pool.query(
          readFileSync(new URL(`${entry.tag}.sql`, folder), 'utf8').replaceAll(
            '"public".',
            `"${schema}".`,
          ),
        );
      await seedCore(new LedgerService(pool), 'test');
      const env = loadEnv({ ...process.env, STORAGE_ADAPTER: 'local', LOG_LEVEL: 'error' });
      app = await buildApp({ env, pool, db: createDb(pool), adapters: createAdapters(env) });
      const token = randomBytes(32).toString('hex');
      await pool.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at,auth_method) VALUES($1,$2,now()+interval '8 hours','sandbox')",
        [tokenHash(token), seedId('customer')],
      );
      cookie = `hw_session=${token}`;
    });

    afterAll(async () => {
      await app?.close();
      await pool?.end();
      if (admin) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin?.end();
    });

    async function timed(path: string, method: 'GET' = 'GET') {
      const started = performance.now();
      const response = await app.inject({
        method,
        url: path,
        headers: method === 'GET' ? { cookie } : undefined,
      });
      const ms = performance.now() - started;
      const bytes = Buffer.byteLength(response.body);
      return { path, ms, bytes, status: response.statusCode };
    }

    function percentile(values: number[], pct: number) {
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.ceil((pct / 100) * sorted.length) - 1;
      return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
    }

    it('keeps read paths within latency and payload budgets for a limited-bandwidth customer device', async () => {
      const paths = ['/api/funding', '/api/wallet'];
      const results: Array<{ path: string; p95ms: number; maxBytes: number; status: number }> = [];
      for (const path of paths) {
        const runs = [];
        for (let index = 0; index < 10; index += 1) runs.push(await timed(path));
        const status = runs[0].status;
        expect(status, `expected 200 for ${path}, got ${status}`).toBe(200);
        results.push({
          path,
          p95ms: percentile(
            runs.map((r) => r.ms),
            95,
          ),
          maxBytes: Math.max(...runs.map((r) => r.bytes)),
          status,
        });
      }
      for (const result of results) {
        expect(result.p95ms).toBeLessThan(6000);
        expect(result.maxBytes).toBeLessThan(64 * 1024);
      }
      console.log(JSON.stringify({ artifact: 'perf-smoke', results }, null, 2));
    });
  },
);

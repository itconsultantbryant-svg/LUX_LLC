import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createAdapters } from '../adapters/index.js';
import { loadEnv } from '../config/env.js';
import { LedgerService } from '../modules/ledger/service.js';
import { seedCore, seedId } from '../modules/ledger/seed.js';
import { EVALUATION_DATASET_VERSION } from './dataset.js';
import { computeReport } from './metrics.js';
import { renderJson, renderMarkdown } from './report.js';
import { runEvaluation } from './runner.js';

describe.skipIf(process.env.EVALUATION_DATABASE_TESTS !== '1')(
  'evaluation: reproducible metrics over a labeled synthetic dataset',
  () => {
    let pool: pg.Pool, admin: pg.Pool;
    const schema = `evaluation_test_${randomUUID().replaceAll('-', '')}`;
    let storageRoot: string;
    let reviewerId: string;

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
      reviewerId = randomUUID();
      await pool.query('INSERT INTO users(id,phone_e164,display_name) VALUES($1,$2,$3)', [
        reviewerId,
        '+999800000001',
        'Evaluation platform reviewer',
      ]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'platform_admin')", [
        reviewerId,
      ]);
      storageRoot = await mkdtemp(path.join(tmpdir(), 'evaluation-storage-'));
    });

    afterAll(async () => {
      await pool?.end();
      if (admin) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin?.end();
      if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    });

    it('runs the dataset, reports honest metrics and enforces the review invariant', async () => {
      const env = loadEnv({
        ...process.env,
        STORAGE_ADAPTER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        LOG_LEVEL: 'error',
      });
      const adapters = createAdapters(env);
      const input = await runEvaluation({
        pool,
        ledger: new LedgerService(pool),
        adapter: adapters.ai,
        datasetCustomerId: seedId('customer'),
        platformReviewerId: reviewerId,
      });
      const report = computeReport({ ...input, datasetVersion: EVALUATION_DATASET_VERSION });

      const docsFolder = new URL('../../../../docs/evaluation/', import.meta.url);
      await mkdir(docsFolder, { recursive: true });
      await writeFile(new URL('latest.json', docsFolder), renderJson(report), 'utf8');
      await writeFile(new URL('latest.md', docsFolder), renderMarkdown(report), 'utf8');

      const byId = new Map(report.metrics.map((metric) => [metric.id, metric]));

      // Hard invariants: the pipeline must never silently accept something that
      // a person needed to look at, and must never flag a clean case.
      expect(report.reviewNotSuppressed, 'necessary review must not be suppressed').toBe(true);
      expect(byId.get('suspicious.missed')?.numerator, 'no missed suspicious cases').toBe(0);
      expect(byId.get('extraction.false_positive')?.numerator, 'no false positives').toBe(0);

      // Every seeded detection class must fire, and routing must match policy.
      expect(byId.get('duplicate.exact.detection')?.numerator).toBe(
        byId.get('duplicate.exact.detection')?.denominator,
      );
      expect(byId.get('duplicate.near.detection')?.numerator).toBe(
        byId.get('duplicate.near.detection')?.denominator,
      );
      expect(byId.get('arithmetic.detection')?.numerator).toBe(
        byId.get('arithmetic.detection')?.denominator,
      );
      expect(byId.get('provider.detection')?.numerator).toBe(
        byId.get('provider.detection')?.denominator,
      );
      expect(byId.get('funding.detection')?.numerator).toBe(
        byId.get('funding.detection')?.denominator,
      );
      expect(byId.get('restriction.detection')?.numerator).toBe(
        byId.get('restriction.detection')?.denominator,
      );
      expect(byId.get('routing.agreement')?.numerator, 'routing must match policy').toBe(
        byId.get('routing.agreement')?.denominator,
      );
      expect(byId.get('uncertainty.routing')?.numerator).toBe(
        byId.get('uncertainty.routing')?.denominator,
      );

      // Extraction quality is measured; a material regression should fail CI.
      const overall = byId.get('extraction.accuracy.overall');
      expect(overall?.denominator ?? 0).toBeGreaterThan(0);
      expect(overall?.value ?? 0).toBeGreaterThanOrEqual(0.9);
      expect(byId.get('extraction.accuracy.totalAmountMinor')?.value ?? 0).toBeGreaterThanOrEqual(
        0.9,
      );
      expect(byId.get('extraction.accuracy.providerName')?.value ?? 0).toBeGreaterThanOrEqual(0.9);
      expect(byId.get('extraction.accuracy.currency')?.value ?? 0).toBeGreaterThanOrEqual(0.9);
    });
  },
);

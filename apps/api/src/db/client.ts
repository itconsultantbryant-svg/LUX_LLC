import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>;

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export async function pingDatabase(pool: pg.Pool): Promise<boolean> {
  const result = await pool.query('select 1 as ok');
  return result.rows[0]?.ok === 1;
}

export async function createDbFromEnv(env: Env) {
  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);
  return { pool, db };
}

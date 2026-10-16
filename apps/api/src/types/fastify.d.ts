import type pg from 'pg';
import type { Adapters } from '../adapters/index.js';
import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    ctx: {
      env: Env;
      pool: pg.Pool;
      db: Db;
      adapters: Adapters;
    };
  }
}

export {};

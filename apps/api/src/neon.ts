import { attachDatabasePool } from '@neon/functions';
import { createAdapters } from './adapters/index.js';
import { buildApp } from './build-app.js';
import { loadEnv } from './config/env.js';
import { createDbFromEnv } from './db/client.js';
import { createNeonHandler } from './neon-handler.js';

const secret = process.env.ORIGIN_SECRET;
if (!secret) throw new Error('ORIGIN_SECRET is required for the Neon backend.');
const env = loadEnv();
const app = createDbFromEnv(env).then(({ pool, db }) => {
  attachDatabasePool(pool);
  return buildApp({ env, pool, db, adapters: createAdapters(env) });
});

export default createNeonHandler(app, secret);

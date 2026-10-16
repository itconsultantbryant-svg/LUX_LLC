import { createAdapters } from './adapters/index.js';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDbFromEnv } from './db/client.js';

async function main() {
  const env = loadEnv();
  const { pool, db } = await createDbFromEnv(env);
  const adapters = createAdapters(env);
  const app = await buildApp({ env, pool, db, adapters });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      {
        appEnv: env.APP_ENV,
        paymentAdapter: adapters.payments.mode,
        aiAdapter: adapters.ai.mode,
      },
      'HealthWallet Liberia API listening',
    );
  } catch (error) {
    app.log.error(error);
    await pool.end();
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

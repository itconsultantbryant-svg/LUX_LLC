import type { FastifyPluginAsync } from 'fastify';
import { PRODUCT } from '@healthwallet/shared';
import { pingDatabase } from '../db/client.js';
import { isSimulationEnvironment } from '../config/env.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    product: PRODUCT.name,
    aiEngine: PRODUCT.aiEngine,
    operator: PRODUCT.operator,
    intendedPartner: PRODUCT.intendedPartner,
    appEnv: app.ctx.env.APP_ENV,
    simulation: isSimulationEnvironment(app.ctx.env.APP_ENV),
    adapters: {
      ai: { id: app.ctx.adapters.ai.id, mode: app.ctx.adapters.ai.mode },
      payments: { id: app.ctx.adapters.payments.id, mode: app.ctx.adapters.payments.mode },
      messaging: { id: app.ctx.adapters.messaging.id, mode: app.ctx.adapters.messaging.mode },
      storage: { id: app.ctx.adapters.storage.id, mode: app.ctx.adapters.storage.mode },
    },
  }));

  app.get('/ready', async (_request, reply) => {
    try {
      const ok = await pingDatabase(app.ctx.pool);
      if (!ok) {
        return reply.code(503).send({ status: 'not_ready', database: false });
      }
      return { status: 'ready', database: true, appEnv: app.ctx.env.APP_ENV };
    } catch (error) {
      requestLogError(error);
      return reply.code(503).send({
        status: 'not_ready',
        database: false,
        message: 'Database ping failed',
      });
    }
  });
};

function requestLogError(error: unknown) {
  // Avoid logging connection strings or secrets.
  const message = error instanceof Error ? error.message : 'unknown_error';
  console.error(`ready_check_failed: ${message}`);
}

import type { FastifyPluginAsync } from 'fastify';
import { PRODUCT, ROLE_LABELS } from '@healthwallet/shared';

/** Public product meta for the web shell — no secrets. */
export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/meta', async () => ({
    product: PRODUCT,
    appEnv: app.ctx.env.APP_ENV,
    defaultCurrency: app.ctx.env.DEFAULT_CURRENCY,
    unresolvedQuestions: [
      'What does Orange mean by 85–90% AI?',
      'Which Orange Money interfaces and sandbox capabilities are available?',
      'Who holds customer funds?',
      'Which providers, insurers, credit partners, and program sponsors participate?',
      'Which currencies, fees, limits, and authorization rules apply?',
      'Is USSD available through an approved gateway?',
      'Which data can be used for AI development and evaluation?',
    ],
    roles: ROLE_LABELS,
    modules: [
      'identity',
      'providers',
      'wallets',
      'contributions',
      'bills',
      'validation',
      'programs',
      'payments',
      'notifications',
      'reporting',
      'ai',
    ],
  }));
};

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AssistantRequestSchema } from '@healthwallet/shared';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { LedgerService } from '../modules/ledger/service.js';
import { AssistanceService } from '../modules/assistance/service.js';
import { AssistantService } from '../modules/assistant/service.js';
import { sessionToken } from './identity.js';

export const assistantRoutes: FastifyPluginAsync = async (app) => {
  const assistance = new AssistanceService(
    new LedgerService(app.ctx.pool),
    app.ctx.adapters.payments.mode,
    app.ctx.env.APP_ENV,
  );
  const assistant = new AssistantService(assistance);

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Assistant operation failed',
    );
    return reply.code(503).send({ message: 'The assistant is temporarily unavailable.' });
  });

  const route = (
    method: 'GET' | 'POST',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) =>
        withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r)),
    });

  route('POST', '/api/assistant/ask', async (a, r) => {
    const request = AssistantRequestSchema.parse(r.body);
    const answer = await assistant.ask(a, request);
    await a.audit('assistant.answered', 'assistant_answer', request.billId ?? null, {
      tool: request.tool,
      outcome: answer.outcome,
      groundedOn: answer.groundedOn,
    });
    return { answer };
  });

  route('POST', '/api/assistant/confirm', async (a, r) => {
    const body = z.object({ confirmationId: z.uuid() }).strict().parse(r.body);
    return assistant.confirm(a, body.confirmationId);
  });
};

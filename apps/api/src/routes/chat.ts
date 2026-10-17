import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ChatSendRequestSchema } from '@healthwallet/shared';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { ChatService } from '../modules/chat/service.js';
import { sessionToken } from './identity.js';

const SIMULATION_LABEL =
  'SIMULATION — sandbox assistant; no real money moves and nothing is verified.';

export const chatRoutes: FastifyPluginAsync = async (app) => {
  const chat = new ChatService(app.ctx.adapters);

  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error({ errorType: e instanceof Error ? e.name : 'Unknown' }, 'Chat operation failed');
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

  route('GET', '/api/chat/history', async (a) => ({
    messages: await chat.history(a),
    simulationLabel: SIMULATION_LABEL,
  }));

  route('GET', '/api/chat/briefing', async (a) => chat.briefing(a));

  route('POST', '/api/chat/send', async (a, r) => {
    const body = ChatSendRequestSchema.parse(r.body);
    const { user, assistant } = await chat.send(a, body);
    await a.audit('chat.message', 'chat_message', null, {
      hadDocument: Boolean(body.document),
      replyChars: assistant.content.text.length,
    });
    return { user, assistant, simulationLabel: SIMULATION_LABEL };
  });
};

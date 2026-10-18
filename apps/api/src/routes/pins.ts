import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { hasPin, setPin, verifyPin } from '../modules/security/pins.js';
import { sessionToken } from './identity.js';

const pin = z.string().regex(/^\d{4}$/, { message: 'Enter a 4-digit PIN.' });

/**
 * Wallet PIN management. This PIN authorises health-wallet payments and is
 * distinct from the Orange Money PIN, which the platform never stores.
 */
export const pinRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied PIN and try again.' });
    app.log.error({ errorType: e instanceof Error ? e.name : 'Unknown' }, 'PIN operation failed');
    return reply.code(503).send({ message: 'The PIN service is temporarily unavailable.' });
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

  route('GET', '/api/customers/pin', async (a) => ({ set: await hasPin(a.client, a.actor.id) }));

  route('POST', '/api/customers/pin', async (a, r) => {
    const body = z.object({ pin, currentPin: pin.optional() }).strict().parse(r.body);
    if (await hasPin(a.client, a.actor.id)) {
      if (!body.currentPin) throw new IdentityError(403, 'Enter your current PIN to change it.');
      await verifyPin(a.client, a.actor.id, body.currentPin);
    }
    await setPin(a.client, a.actor.id, body.pin);
    await a.audit('security.pin_set', 'user', a.actor.id, {});
    return { set: true };
  });

  route('POST', '/api/customers/pin/verify', async (a, r) => {
    const body = z.object({ pin }).strict().parse(r.body);
    await verifyPin(a.client, a.actor.id, body.pin);
    return { verified: true };
  });
};

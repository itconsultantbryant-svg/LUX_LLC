import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LocationInputSchema, LOCATION_SIMULATION_LABEL } from '@healthwallet/shared';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import {
  clearLocation,
  getLocation,
  nearbyProviders,
  upsertLocation,
} from '../modules/proximity/service.js';
import { sessionToken } from './identity.js';

/**
 * Customer location and provider proximity.
 *
 * Location is opt-in and used only to rank verified providers the customer can
 * reach. It never reaches a response other than this customer's own, and it can
 * be cleared at any time.
 */
export const locationRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied location and try again.' });
    app.log.error(
      {
        errorType: e instanceof Error ? e.name : 'Unknown',
        errorMessage: e instanceof Error ? e.message : String(e),
      },
      'Location operation failed',
    );
    return reply.code(503).send({ message: 'Location is temporarily unavailable.' });
  });

  const route = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    work: (a: Access, r: FastifyRequest) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (r) =>
        withSession(app.ctx.pool, app.ctx.env, sessionToken(r), (a) => work(a, r)),
    });

  route('GET', '/api/customers/location', async (a) => ({
    location: await getLocation(a.client, a.actor.id),
    simulationLabel: LOCATION_SIMULATION_LABEL,
  }));

  route('POST', '/api/customers/location', async (a, r) => {
    const body = LocationInputSchema.parse(r.body);
    const location = await upsertLocation(a.client, a.actor.id, body);
    await a.audit('location.updated', 'user', a.actor.id, { source: body.source });
    return { location, simulationLabel: LOCATION_SIMULATION_LABEL };
  });

  route('DELETE', '/api/customers/location', async (a) => {
    await clearLocation(a.client, a.actor.id);
    await a.audit('location.cleared', 'user', a.actor.id, {});
    return { cleared: true };
  });

  route('GET', '/api/providers/nearby', async (a, r) => {
    const query = z
      .object({
        emergency: z
          .enum(['true', 'false', '1', '0'])
          .optional()
          .transform((v) => v === 'true' || v === '1'),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(r.query ?? {});
    const origin = await getLocation(a.client, a.actor.id);
    const providers = await nearbyProviders(a.client, origin, {
      emergency: query.emergency,
      limit: query.limit,
    });
    return {
      providers,
      origin,
      emergency: Boolean(query.emergency),
      simulationLabel: LOCATION_SIMULATION_LABEL,
    };
  });
};

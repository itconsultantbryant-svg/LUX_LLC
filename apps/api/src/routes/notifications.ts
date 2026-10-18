import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Access, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { NotificationsService, notificationView } from '../modules/notifications/service.js';
import { sessionToken } from './identity.js';

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;

/**
 * The customer's in-app notification feed. The web client polls the unread
 * count and refreshes the list, which keeps the feature working on serverless
 * hosting where a long-lived stream is not reliable.
 */
export const notificationRoutes: FastifyPluginAsync = async (app) => {
  const notifications = new NotificationsService();
  app.setErrorHandler((e, _r, reply) => {
    if (e instanceof IdentityError) return reply.code(e.statusCode).send({ message: e.message });
    if (e instanceof z.ZodError)
      return reply.code(400).send({ message: 'Check the supplied fields and try again.' });
    app.log.error(
      { errorType: e instanceof Error ? e.name : 'Unknown' },
      'Notification operation failed',
    );
    return reply.code(503).send({ message: 'Notifications are temporarily unavailable.' });
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

  route('GET', '/api/notifications', async (a, r) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
      .parse(r.query ?? {});
    const rows = await notifications.list(a.client, a.actor.id, query.limit ?? 50);
    return {
      notifications: rows.map(notificationView),
      unread: await notifications.unreadCount(a.client, a.actor.id),
    };
  });

  route('GET', '/api/notifications/unread-count', async (a) => ({
    unread: await notifications.unreadCount(a.client, a.actor.id),
  }));

  route('POST', '/api/notifications/:id/read', async (a, r) => {
    const read = await notifications.markRead(a.client, a.actor.id, id(r));
    if (!read) throw new IdentityError(404, 'Notification not found.');
    return { read: true, unread: await notifications.unreadCount(a.client, a.actor.id) };
  });

  route('POST', '/api/notifications/read-all', async (a) => {
    await notifications.markAllRead(a.client, a.actor.id);
    return { read: true, unread: 0 };
  });
};

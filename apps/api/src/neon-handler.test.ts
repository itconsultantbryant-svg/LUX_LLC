import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createNeonHandler } from './neon-handler.js';

const secret = 'test-origin-secret-that-is-at-least-32-characters';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup() {
  const app = Fastify();
  apps.push(app);
  app.get('/health', async () => ({ status: 'ok' }));
  app.post('/echo', async (request, reply) => {
    reply.header('set-cookie', ['session=test; HttpOnly; Path=/api', 'other=test; Path=/api']);
    return {
      body: request.body,
      cookie: request.headers.cookie,
      forwarded: request.headers['x-forwarded-for'],
      secret: request.headers['x-secret'],
    };
  });
  app.get('/ip', async (request) => ({
    ip: request.ip,
    forwarded: request.headers['x-forwarded-for'],
    internal: request.headers['x-healthwallet-client-ip'],
  }));
  app.get('/empty', async (_request, reply) => reply.code(204).send());
  return createNeonHandler(Promise.resolve(app), secret);
}
describe('Neon Fetch adapter', () => {
  it('rejects missing or incorrect origin credentials', async () => {
    const handler = setup();
    for (const headers of [new Headers(), new Headers({ 'x-secret': 'incorrect' })]) {
      expect(
        (await handler.fetch(new Request('https://function.example/health', { headers }))).status,
      ).toBe(401);
    }
  });
  it('forwards requests to the existing API and preserves session cookies', async () => {
    const handler = setup();
    const response = await handler.fetch(
      new Request('https://function.example/echo', {
        method: 'POST',
        headers: {
          'x-secret': secret,
          'content-type': 'application/json',
          cookie: 'hw_session=example',
          'x-forwarded-for': 'forged',
        },
        body: JSON.stringify({ example: true }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      body: { example: true },
      cookie: 'hw_session=example',
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });
  it('accepts client IP only from the authenticated proxy and strips forwarding headers', async () => {
    const response = await setup().fetch(
      new Request('https://function.example/ip', {
        headers: {
          'x-secret': secret,
          'x-healthwallet-client-ip': '198.51.100.42',
          'x-forwarded-for': 'forged',
        },
      }),
    );
    expect(await response.json()).toEqual({ ip: '198.51.100.42' });
  });
  it('rejects oversized request bodies before running API routes', async () => {
    const response = await setup().fetch(
      new Request('https://function.example/echo', {
        method: 'POST',
        headers: { 'x-secret': secret },
        body: 'x'.repeat(1024 * 1024 + 1),
      }),
    );
    expect(response.status).toBe(413);
  });
  it('handles health, HEAD, and empty responses', async () => {
    const handler = setup();
    const headers = { 'x-secret': secret };
    const health = await handler.fetch(new Request('https://function.example/health', { headers }));
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(
      await (
        await handler.fetch(
          new Request('https://function.example/health', { method: 'HEAD', headers }),
        )
      ).text(),
    ).toBe('');
    expect(
      (await handler.fetch(new Request('https://function.example/empty', { headers }))).status,
    ).toBe(204);
  });
  it('collapses duplicate leading slashes so proxied routes still match', async () => {
    const response = await setup().fetch(
      new Request('https://function.example//health', { headers: { 'x-secret': secret } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

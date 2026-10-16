import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';

const MAX_BODY_BYTES = 1024 * 1024;

/** Bridge the existing API to Neon's Fetch runtime without opening a listening socket. */
export function createNeonHandler(app: Promise<FastifyInstance>, originSecret: string) {
  if (originSecret.length < 32)
    throw new Error('ORIGIN_SECRET must contain at least 32 characters.');
  const expected = Buffer.from(originSecret);
  return {
    async fetch(request: Request): Promise<Response> {
      const supplied = Buffer.from(request.headers.get('x-secret') ?? '');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return new Response('Unauthorized', { status: 401 });
      }
      const url = new URL(request.url);
      // Collapse duplicate leading slashes (e.g. a proxy target ending in "/"
      // producing "//health") so routes still match.
      const path = url.pathname.replace(/^\/+/, '/');
      const headers = Object.fromEntries(request.headers.entries());
      delete headers['x-secret'];
      const clientIp = headers['x-healthwallet-client-ip'];
      delete headers['x-healthwallet-client-ip'];
      delete headers.host;
      delete headers['content-length'];
      // Do not let client-controlled proxy headers alter protocol, IP, or host handling.
      for (const key of Object.keys(headers))
        if (key.startsWith('x-forwarded-')) delete headers[key];
      let payload: Buffer | undefined;
      if (request.body) {
        const chunks: Uint8Array[] = [];
        const reader = request.body.getReader();
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_BODY_BYTES) {
              await reader.cancel();
              return Response.json({ message: 'Request body is too large.' }, { status: 413 });
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
        payload = Buffer.concat(chunks);
      }
      const api = await app;
      const result = await api.inject({
        method: request.method.toUpperCase() as InjectOptions['method'],
        url: `${path}${url.search}`,
        headers,
        payload,
        remoteAddress: clientIp && isIP(clientIp) ? clientIp : '127.0.0.1',
      });
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(result.headers)) {
        if (
          value === undefined ||
          ['connection', 'transfer-encoding', 'content-length'].includes(key)
        )
          continue;
        if (Array.isArray(value)) for (const item of value) responseHeaders.append(key, item);
        else responseHeaders.set(key, String(value));
      }
      const empty = request.method === 'HEAD' || [204, 205, 304].includes(result.statusCode);
      return new Response(empty ? null : new Uint8Array(result.rawPayload), {
        status: result.statusCode,
        headers: responseHeaders,
      });
    },
  };
}

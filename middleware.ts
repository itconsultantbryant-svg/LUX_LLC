/**
 * Vercel Edge Middleware: same-origin proxy to the Neon-hosted backend.
 *
 * The browser only ever talks to the Vercel origin. This middleware forwards
 * `/api/*`, `/health`, and `/ready` to the Neon Function, attaching the
 * server-only `ORIGIN_SECRET` header the Neon handler requires and passing the
 * real client IP through `x-healthwallet-client-ip`. Client-supplied
 * `x-forwarded-*` headers are never trusted (the Neon handler drops them).
 *
 * This file must live at the Vercel project root. Configure the Vercel project
 * with Root Directory = repository root (see docs/DEPLOYMENT.md).
 *
 * Required Vercel environment variables (server-only, never `VITE_`):
 *   NEON_FUNCTION_URL  e.g. https://<branch-id>-<fn>.compute.<region>.aws.neon.tech
 *   ORIGIN_SECRET      >= 32 random characters, identical to the Neon Function
 */
export const config = {
  matcher: ['/api/:path*', '/health', '/ready'],
};

const target = process.env.NEON_FUNCTION_URL?.trim().replace(/\/+$/, '');
const secret = process.env.ORIGIN_SECRET;

export default async function middleware(request: Request): Promise<Response> {
  if (!target || !secret) {
    return Response.json(
      { message: 'The API proxy is not configured for this deployment.' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const upstream = new URL(url.pathname + url.search, target);

  const headers = new Headers(request.headers);
  headers.set('x-secret', secret);
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor?.split(',')[0]?.trim() || request.headers.get('x-real-ip');
  if (clientIp) headers.set('x-healthwallet-client-ip', clientIp);
  headers.delete('host');
  headers.delete('content-length');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    return await fetch(upstream, init);
  } catch {
    return Response.json(
      { message: 'The backend is temporarily unreachable. Please try again.' },
      { status: 502 },
    );
  }
}

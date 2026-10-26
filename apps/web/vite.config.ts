import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  // These root-level values are server-only: never prefix the secret with VITE_.
  const rootEnv = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), '');
  const rawTarget = process.env.NEON_FUNCTION_URL ?? rootEnv.NEON_FUNCTION_URL;
  // Local development must use the local API. An ambient Neon URL is intended for
  // deployed proxy environments and otherwise prevents local users from signing in.
  const useRemoteProxy = mode !== 'development' || process.env.USE_NEON_PROXY === 'true';
  // Strip trailing slashes so the proxy never builds a "//path" URL (which 404s).
  const target = useRemoteProxy ? rawTarget?.trim().replace(/\/+$/, '') : undefined;
  const secret = process.env.ORIGIN_SECRET ?? rootEnv.ORIGIN_SECRET;
  if (target && !secret)
    throw new Error('The Neon proxy requires ORIGIN_SECRET in the root .env.local.');
  if (target && new URL(target).protocol !== 'https:')
    throw new Error('NEON_FUNCTION_URL must use HTTPS.');
  const proxy: ProxyOptions = target
    ? {
        target,
        changeOrigin: true,
        headers: { 'x-secret': secret! },
        configure: (server) => {
          server.on('proxyReq', (outgoing, request) => {
            outgoing.setHeader(
              'x-healthwallet-client-ip',
              request.socket.remoteAddress ?? '127.0.0.1',
            );
          });
        },
        // Browsers talk to localhost; sessions remain same-origin through this proxy.
        cookieDomainRewrite: '',
      }
    : { target: 'http://127.0.0.1:4000' };
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': proxy, '/health': proxy, '/ready': proxy },
    },
  };
});

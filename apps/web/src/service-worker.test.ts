import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const offline = { offline: true };
  const cacheMatch = vi.fn().mockResolvedValue(offline);
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { origin: 'https://app.example' },
      addEventListener: (name: string, callback: (event: unknown) => void) => {
        handlers[name] = callback;
      },
    },
    URL,
    fetch,
    caches: { match: cacheMatch },
  });
  return { handlers, cacheMatch, offline };
}

describe('offline privacy boundary', () => {
  it('never intercepts API, readiness, external, or mutation requests', () => {
    const { handlers, cacheMatch } = setup();
    for (const [path, method] of [
      ['/api/auth/me', 'GET'],
      ['/health', 'GET'],
      ['/ready', 'GET'],
      ['https://other.example/', 'GET'],
      ['/account', 'POST'],
    ]) {
      const respondWith = vi.fn();
      handlers.fetch({
        request: { url: new URL(path, 'https://app.example').href, method, mode: 'navigate' },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(cacheMatch).not.toHaveBeenCalled();
  });
  it('shows only the public offline notice when navigation fails', async () => {
    const { handlers, cacheMatch, offline } = setup();
    let response: Promise<unknown> | undefined;
    handlers.fetch({
      request: { url: 'https://app.example/account', method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<unknown>) => {
        response = value;
      },
    });
    await expect(response).resolves.toEqual(offline);
    expect(cacheMatch).toHaveBeenCalledWith('/offline.html');
  });
});

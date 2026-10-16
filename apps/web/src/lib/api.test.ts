import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost } from './api';

afterEach(() => vi.unstubAllGlobals());
describe('API session transport', () => {
  it('provides actionable feedback for a network failure without claiming a write failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiPost('/api/auth/request-code', {})).rejects.toThrow(
      'check its status before retrying',
    );
  });
  it('includes session cookies for both reads and writes', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await apiGet('/api/auth/me');
    await apiPost('/api/auth/logout', {});
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    expect(fetch.mock.calls[1][1].credentials).toBe('include');
  });
  it('preserves authentication and rate-limit errors for the UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'Wait before trying again.' }), { status: 429 }),
        ),
    );
    await expect(apiPost('/api/auth/request-code', {})).rejects.toMatchObject({
      status: 429,
      message: 'Wait before trying again.',
    });
  });
  it('handles a non-JSON service outage without leaking an HTML error into the UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Gateway error</html>', { status: 502 })),
    );
    await expect(apiGet('/api/auth/me')).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502). Please try again.',
    });
  });
});

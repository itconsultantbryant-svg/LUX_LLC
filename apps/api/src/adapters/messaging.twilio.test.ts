import { afterEach, expect, it, vi } from 'vitest';
import { TwilioMessagingAdapter } from './messaging.twilio.js';
afterEach(() => vi.unstubAllGlobals());
it('sends SMS through the configured provider without exposing provider errors', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetcher);
  const adapter = new TwilioMessagingAdapter('ACtest', 'synthetic-token', '+99910000000');
  expect(
    await adapter.send({ channel: 'sms', to: '+99920000000', body: 'Synthetic code' }),
  ).toEqual({ accepted: true });
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
  expect(options.body.get('To')).toBe('+99920000000');
  expect(options.body.get('Body')).toBe('Synthetic code');
  expect(options.redirect).toBe('error');
  fetcher.mockResolvedValue({ ok: false });
  await expect(
    adapter.send({ channel: 'sms', to: '+99920000000', body: 'Synthetic code' }),
  ).rejects.toThrow('Verification provider rejected delivery');
});

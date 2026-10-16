import type { MessagingAdapter } from './types.js';
export class TwilioMessagingAdapter implements MessagingAdapter {
  readonly id = 'messaging.twilio';
  readonly mode = 'live' as const;
  constructor(
    private readonly account: string,
    private readonly token: string,
    private readonly sender: string,
  ) {}
  async send(input: Parameters<MessagingAdapter['send']>[0]) {
    if (input.channel !== 'sms')
      throw new Error('Only SMS is supported by this verification provider');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.account)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.account}:${this.token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: input.to, From: this.sender, Body: input.body }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      },
    );
    if (!response.ok) throw new Error('Verification provider rejected delivery');
    return { accepted: true };
  }
}

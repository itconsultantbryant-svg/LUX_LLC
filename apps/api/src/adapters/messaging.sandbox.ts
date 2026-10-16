import type { MessagingAdapter } from './types.js';

/**
 * Sandbox messaging sink (no external send).
 * Replacement point: approved SMS/USSD/WhatsApp gateway when U-06 is resolved.
 */
export class SandboxMessagingAdapter implements MessagingAdapter {
  readonly id = 'messaging.sandbox';
  readonly mode = 'sandbox' as const;

  async send(input: {
    to: string;
    channel: 'sms' | 'ussd' | 'whatsapp' | 'email';
    body: string;
  }): Promise<{ accepted: boolean; simulationLabel?: string }> {
    return {
      accepted: true,
      simulationLabel: `SIMULATION — ${input.channel} to ${input.to} logged only (${input.body.length} chars)`,
    };
  }
}

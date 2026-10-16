import type { UssdAdapter, UssdScreen } from './types.js';

const MENU = [
  '1. Check balance',
  '2. My vouchers',
  '3. Find a provider',
  '4. Authorize a payment',
  '5. Exit',
].join('\n');

/**
 * Sandbox USSD menu. Availability is gated by `provisioned`: until a real
 * gateway is configured the module stays unavailable. The sandbox never states
 * a balance or coverage figure itself — data screens are filled by the service
 * from records the caller is authorized to read, otherwise the screen says the
 * information is unavailable.
 */
export class SandboxUssdAdapter implements UssdAdapter {
  readonly id = 'sandbox-ussd';
  readonly mode = 'sandbox' as const;

  constructor(readonly provisioned: boolean) {}

  async handleSession(input: {
    sessionCode: string;
    phone: string;
    input: string;
    state: Record<string, unknown>;
  }): Promise<UssdScreen> {
    const step = typeof input.state.step === 'string' ? input.state.step : 'menu';
    const choice = input.input.trim();

    if (step === 'menu' && choice === '1')
      return {
        continue: true,
        screen: 'Checking your balance…',
        state: { ...input.state, step: 'balance' },
      };
    if (step === 'menu' && choice === '2')
      return {
        continue: true,
        screen: 'Loading your vouchers…',
        state: { ...input.state, step: 'vouchers' },
      };
    if (step === 'menu' && choice === '3')
      return {
        continue: true,
        screen: 'Provider lookup is available in the app.',
        state: { ...input.state, step: 'done' },
      };
    if (step === 'menu' && (choice === '5' || choice === ''))
      return { continue: false, screen: 'Goodbye.', state: { ...input.state, step: 'ended' } };
    if (step === 'menu')
      return {
        continue: true,
        screen: `Unknown option. Reply with a number.\n${MENU}`,
        state: input.state,
      };

    return {
      continue: false,
      screen: 'Thanks. Dial again for the menu.',
      state: { ...input.state, step: 'ended' },
    };
  }
}

export const USSD_MAIN_MENU = MENU;

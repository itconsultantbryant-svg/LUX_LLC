import { createHash } from 'node:crypto';
import { money } from '../modules/ledger/service.js';

export interface FundingEvent {
  eventId: string;
  paymentId: string;
  reference: string;
  amountMinor: string;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed';
}
export interface FundingAdapter {
  readonly id: string;
  readonly mode: 'sandbox' | 'live';
  readonly currencies: readonly string[];
  readonly international: boolean;
  fee(amountMinor: string, currency: string): string;
  initiate(input: {
    paymentId: string;
    amountMinor: string;
    currency: string;
  }): Promise<{ reference: string }>;
}
/** No network transfer. A separate, authorized simulation event is required to confirm. */
export class SandboxFundingAdapter implements FundingAdapter {
  readonly id = 'healthwallet-funding-simulator-v1';
  readonly mode = 'sandbox' as const;
  readonly currencies = ['LRD', 'USD'] as const;
  readonly international = true;
  fee(amountMinor: string, currency: string) {
    money(amountMinor);
    if (!this.currencies.some((c) => c === currency)) throw new Error('Unsupported currency.');
    return '0';
  }
  async initiate(input: { paymentId: string; amountMinor: string; currency: string }) {
    this.fee(input.amountMinor, input.currency);
    return {
      reference: 'sim_funding_' + createHash('sha256').update(input.paymentId).digest('hex'),
    };
  }
}

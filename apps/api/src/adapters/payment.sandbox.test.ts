import { expect, it, describe } from 'vitest';
import { SandboxPaymentAdapter } from './payment.sandbox.js';

it('requires exact positive minor-unit strings and preserves large amounts', async () => {
  const adapter = new SandboxPaymentAdapter();
  for (const amountMinor of ['0', '-1', '1.5', '1e3', '9223372036854775808'])
    expect(
      (
        await adapter.charge({
          amountMinor,
          currency: 'LRD',
          idempotencyKey: 'synthetic',
          narrative: 'synthetic',
        })
      ).status,
    ).toBe('failed');
  const response = await adapter.charge({
    amountMinor: '9007199254740993',
    currency: 'LRD',
    idempotencyKey: 'synthetic',
    narrative: 'synthetic',
  });
  expect(response.raw.amountMinor).toBe('9007199254740993');
  expect(response.mode).toBe('sandbox');
});

describe('sandbox payment lifecycle', () => {
  const adapter = new SandboxPaymentAdapter('sandbox-payment-callback-secret');

  it('never reports success at initiation and exposes a provider reference', async () => {
    const result = await adapter.initiatePayment!({
      reference: 'intent-1',
      amountMinor: '1000',
      currency: 'LRD',
      idempotencyKey: 'idem-1',
      narrative: 'synthetic',
    });
    expect(['submitted', 'pending']).toContain(result.state);
    expect(result.state).not.toBe('succeeded');
    expect(result.adapterReference).toBeTruthy();
  });

  it('rejects a tampered or missing callback signature', () => {
    const raw = Buffer.from(
      JSON.stringify({
        provider: 'sandbox-payment',
        eventId: 'e1',
        reference: 'intent-1',
        status: 'succeeded',
        sequence: 1,
        amountMinor: '1000',
        currency: 'LRD',
        occurredAt: new Date().toISOString(),
      }),
    );
    const signature = adapter.signCallback!(raw);
    expect(adapter.verifyCallback!({ rawBody: raw, signature }).valid).toBe(true);
    expect(adapter.verifyCallback!({ rawBody: raw, signature: null }).valid).toBe(false);
    expect(adapter.verifyCallback!({ rawBody: raw, signature: 'deadbeef' }).valid).toBe(false);
    const tampered = Buffer.from(raw.toString('utf8').replace('"1000"', '"9999"'));
    expect(adapter.verifyCallback!({ rawBody: tampered, signature }).valid).toBe(false);
  });

  it('accepts a refund only for a settled reference', async () => {
    const initiated = await adapter.initiatePayment!({
      reference: 'intent-2',
      amountMinor: '1000',
      currency: 'LRD',
      idempotencyKey: 'idem-2',
      narrative: 'synthetic',
    });
    const refund = await adapter.refund!({
      reference: 'intent-2',
      adapterReference: initiated.adapterReference,
      amountMinor: '1000',
      currency: 'LRD',
      idempotencyKey: 'refund-1',
      reason: 'synthetic reason',
    });
    expect(refund.state).toBe('succeeded');
  });
});

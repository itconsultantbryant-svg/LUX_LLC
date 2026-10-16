import { describe, expect, it } from 'vitest';
import { SandboxAiAdapter } from './ai.sandbox.js';

describe('SandboxAiAdapter', () => {
  it('returns schema-valid sandbox extraction labeled as simulation', async () => {
    const adapter = new SandboxAiAdapter();
    const result = await adapter.extractFromDocument({
      storageKey: 'demo/bill.txt',
      contentType: 'text/plain',
      hintText: 'Total 125.50',
    });

    expect(result.mode).toBe('sandbox');
    expect(result.fields.totalAmountMinor).toBe(12550);
    expect(result.adapterId).toContain('sandbox');
  });
});

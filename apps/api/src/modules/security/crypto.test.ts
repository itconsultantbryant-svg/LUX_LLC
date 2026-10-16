import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, newTotpSecret, totp, verifyTotp } from './crypto.js';
describe('authenticator security', () => {
  it('matches RFC 6238 SHA1 test vectors', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    for (const [time, code] of [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ] as const)
      expect(totp(secret, Math.floor(time / 30), 8)).toBe(code);
  });
  it('rejects replays, expired codes and malformed input', () => {
    const secret = newTotpSecret();
    const now = 1234567890000;
    const step = Math.floor(now / 30000);
    const code = totp(secret, step);
    expect(verifyTotp(secret, code, -1, now)).toBe(step);
    expect(verifyTotp(secret, code, step, now)).toBeNull();
    expect(verifyTotp(secret, totp(secret, step - 2), -1, now)).toBeNull();
    expect(verifyTotp(secret, '12345', -1, now)).toBeNull();
  });
  it('encrypts credentials with authenticated user binding', () => {
    const key = randomBytes(32).toString('hex');
    const secret = newTotpSecret();
    const encrypted = encryptSecret(secret, key, 'user-a');
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted, key, 'user-a')).toBe(secret);
    expect(() => decryptSecret(encrypted, key, 'user-b')).toThrow();
    expect(() => decryptSecret(encrypted, randomBytes(32).toString('hex'), 'user-a')).toThrow();
  });
});

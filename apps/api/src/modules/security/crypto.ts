import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return result;
}
function decode(secret: string): Buffer {
  let bits = 0,
    value = 0;
  const result: number[] = [];
  for (const letter of secret) {
    const n = alphabet.indexOf(letter);
    if (n < 0) throw new Error('Invalid authenticator secret');
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}
export function totp(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits)
    .toString()
    .padStart(digits, '0');
}
export function verifyTotp(
  secret: string,
  code: string,
  lastStep: number,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (
      step > lastStep &&
      step >= 0 &&
      timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
    )
      return step;
  }
  return null;
}
function key(value: string | undefined): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error('SECURITY_ENCRYPTION_KEY must be 32 random bytes in hex');
  return Buffer.from(value, 'hex');
}
export function encryptSecret(
  secret: string,
  encryptionKey: string | undefined,
  userId: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(encryptionKey), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptSecret(
  value: string,
  encryptionKey: string | undefined,
  userId: string,
): string {
  const bytes = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key(encryptionKey), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}

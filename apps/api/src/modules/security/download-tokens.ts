import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env.js';

/**
 * Short-lived, actor-bound tokens for private document download.
 *
 * Private storage never exposes direct/signed object URLs (see storage.s3.ts);
 * instead the API mints an expiring token that is verified on the streaming
 * route. The token is bound to the document *and* the requesting actor, so a
 * leaked link cannot be replayed by a different account, and it expires.
 */
export function documentDownloadSecret(env: Env): string | null {
  return env.DOWNLOAD_LINK_SECRET ?? env.SECURITY_ENCRYPTION_KEY ?? null;
}

function signature(
  secret: string,
  documentId: string,
  actorId: string,
  expiresAt: number,
  nonce: string,
) {
  return createHmac('sha256', secret)
    .update(`${documentId}.${actorId}.${expiresAt}.${nonce}`)
    .digest('hex');
}

export function mintDocumentDownloadToken(
  secret: string,
  input: { documentId: string; actorId: string; ttlSeconds: number; now?: number },
): { token: string; expiresAt: number } {
  const now = input.now ?? Date.now();
  const expiresAt = now + input.ttlSeconds * 1000;
  const nonce = randomBytes(16).toString('hex');
  const sig = signature(secret, input.documentId, input.actorId, expiresAt, nonce);
  return { token: `${expiresAt}.${nonce}.${sig}`, expiresAt };
}

export function verifyDocumentDownloadToken(
  secret: string,
  input: { documentId: string; actorId: string; token: string; now?: number },
): boolean {
  const parts = input.token.split('.');
  if (parts.length !== 3) return false;
  const [expiresRaw, nonce, provided] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt) || expiresAt < (input.now ?? Date.now())) return false;
  const expected = signature(secret, input.documentId, input.actorId, expiresAt, nonce);
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

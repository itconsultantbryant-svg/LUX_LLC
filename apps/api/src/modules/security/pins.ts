import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type pg from 'pg';
import { IdentityError } from '../identity/service.js';

/**
 * Wallet PINs.
 *
 * `user_pins` stores the customer's own health-wallet PIN as a salted scrypt
 * hash. An Orange Money PIN is never stored here or anywhere in the platform:
 * the Orange step is simulated at the adapter boundary, so we only check the
 * shape of the value the customer enters.
 */
const deriveKey = promisify(scrypt);
const PIN_PATTERN = /^\d{4}$/;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function assertPinFormat(pin: string): void {
  if (!PIN_PATTERN.test(pin)) throw new IdentityError(400, 'Enter your 4-digit PIN.');
}

export async function hashPin(pin: string): Promise<string> {
  assertPinFormat(pin);
  const salt = randomBytes(16).toString('hex');
  const derived = (await deriveKey(pin, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = (await deriveKey(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export async function setPin(client: pg.PoolClient, userId: string, pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  await client.query(
    `INSERT INTO user_pins(user_id,pin_hash,failed_attempts,locked_until,updated_at)
     VALUES($1,$2,0,NULL,now())
     ON CONFLICT(user_id) DO UPDATE SET pin_hash=$2,failed_attempts=0,locked_until=NULL,updated_at=now()`,
    [userId, pinHash],
  );
}

export async function hasPin(client: pg.PoolClient, userId: string): Promise<boolean> {
  const result = await client.query('SELECT 1 FROM user_pins WHERE user_id=$1', [userId]);
  return Boolean(result.rowCount);
}

/** Verify the health-wallet PIN, locking after repeated failures. */
export async function verifyPin(client: pg.PoolClient, userId: string, pin: string): Promise<void> {
  assertPinFormat(pin);
  const row = (
    await client.query<{ pin_hash: string; failed_attempts: number; locked_until: Date | null }>(
      'SELECT pin_hash,failed_attempts,locked_until FROM user_pins WHERE user_id=$1 FOR UPDATE',
      [userId],
    )
  ).rows[0];
  if (!row)
    throw new IdentityError(409, 'Set your wallet PIN in Settings before confirming payments.');
  if (row.locked_until && row.locked_until.getTime() > Date.now())
    throw new IdentityError(429, 'Too many incorrect PIN attempts. Try again later.');
  if (!(await verifyPinHash(pin, row.pin_hash))) {
    const attempts = row.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await client.query(
      'UPDATE user_pins SET failed_attempts=$2,locked_until=$3,updated_at=now() WHERE user_id=$1',
      [userId, attempts, lock],
    );
    throw new IdentityError(
      403,
      lock
        ? 'Too many incorrect PIN attempts. Your PIN is locked for fifteen minutes.'
        : 'Incorrect PIN. Try again.',
    );
  }
  await client.query(
    'UPDATE user_pins SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE user_id=$1',
    [userId],
  );
}

/**
 * Simulated Orange Money PIN check. The platform never receives or stores the
 * customer's real Orange PIN; a live adapter hands the authorization off to
 * Orange. In sandbox any well-formed 4-digit PIN is accepted.
 */
export function assertOrangePin(pin: string): void {
  assertPinFormat(pin);
}

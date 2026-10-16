import type pg from 'pg';
import { IdentityError } from '../identity/service.js';

/** Runtime feature/kill switches. Missing rows are treated as enabled. */
export const flagKeys = ['payments', 'ai_extraction', 'partner_modules'] as const;
export type FlagKey = (typeof flagKeys)[number];

export const FLAG_LABELS: Record<FlagKey, string> = {
  payments: 'Payment initiation, authorization and refunds',
  ai_extraction: 'AI-assisted bill document extraction',
  partner_modules: 'Partner modules (credit, insurance, rewards, USSD)',
};

type Queryable = pg.Pool | pg.PoolClient;

export function isFlagKey(value: string): value is FlagKey {
  return (flagKeys as readonly string[]).includes(value);
}

export async function flagEnabled(client: Queryable, key: FlagKey): Promise<boolean> {
  const result = await client.query<{ enabled: boolean }>(
    'SELECT enabled FROM system_flags WHERE key=$1',
    [key],
  );
  return result.rows[0]?.enabled ?? true;
}

export type FlagState = {
  key: FlagKey;
  label: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: Date | null;
};

export async function allFlags(client: Queryable): Promise<FlagState[]> {
  const rows = (
    await client.query<{ key: string; enabled: boolean; reason: string | null; updated_at: Date }>(
      'SELECT key, enabled, reason, updated_at FROM system_flags',
    )
  ).rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return flagKeys.map((key) => ({
    key,
    label: FLAG_LABELS[key],
    enabled: byKey.get(key)?.enabled ?? true,
    reason: byKey.get(key)?.reason ?? null,
    updatedAt: byKey.get(key)?.updated_at ?? null,
  }));
}

export async function setFlag(
  client: Queryable,
  key: FlagKey,
  enabled: boolean,
  reason: string | null,
  actorUserId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO system_flags(key, enabled, reason, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (key) DO UPDATE SET enabled=EXCLUDED.enabled, reason=EXCLUDED.reason, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [key, enabled, reason, actorUserId],
  );
}

/** Throws a fail-closed 503 when a feature is disabled at runtime. */
export function disabledError(label: string): IdentityError {
  return new IdentityError(503, `${label} is temporarily disabled.`);
}

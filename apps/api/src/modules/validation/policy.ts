import type pg from 'pg';
import {
  APPROVED_VALIDATION_POLICY,
  ValidationPolicySchema,
  type ValidationPolicy,
} from '@healthwallet/shared';

/**
 * Loads the approved validation policy. Automated routing only ever follows an
 * approved policy; if none is stored the built-in approved policy is used so the
 * system never silently falls back to "accept everything".
 */
export async function loadPolicy(client: pg.PoolClient): Promise<ValidationPolicy> {
  const row = (
    await client.query<{ rules: unknown }>(
      "SELECT rules FROM validation_policies WHERE status='approved' ORDER BY approved_at DESC LIMIT 1",
    )
  ).rows[0];
  if (!row) return APPROVED_VALIDATION_POLICY;
  const parsed = ValidationPolicySchema.safeParse(row.rules);
  return parsed.success ? parsed.data : APPROVED_VALIDATION_POLICY;
}

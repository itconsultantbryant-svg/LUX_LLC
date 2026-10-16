import type pg from 'pg';
import { buckets, type Bucket } from './service.js';
export async function walletSummary(client: pg.PoolClient, ownerUserId: string) {
  const rows = (
    await client.query(
      `SELECT w.id AS wallet_id,w.currency,f.id AS allocation_id,f.source,f.status,f.dependent_id,f.expires_at,f.allowed_categories,f.allowed_provider_ids,f.program_id,f.rules,f.max_per_payment_minor::text,
    a.bucket,a.balance_minor::text,
    (f.status<>'active' OR f.expires_at<=now() OR f.starts_at>now() OR f.rules<>'{}'::jsonb OR (p.id IS NOT NULL AND (p.status<>'active' OR p.expires_at<=now() OR p.starts_at>now() OR p.rule_version<>f.program_rule_version OR p.rules<>'{}'::jsonb))) AS unavailable
    FROM wallets w LEFT JOIN funding_allocations f ON f.wallet_id=w.id LEFT JOIN programs p ON p.id=f.program_id LEFT JOIN ledger_accounts a ON a.allocation_id=f.id WHERE w.owner_user_id=$1 ORDER BY w.currency,f.created_at,a.bucket`,
      [ownerUserId],
    )
  ).rows;
  type Totals = Record<Bucket, string>;
  type Allocation = {
    id: string;
    source: string;
    dependentId: string | null;
    expiresAt: Date | null;
    status: string;
    programId: string | null;
    allowedCategories: string[];
    allowedProviderIds: string[];
    maxPerPaymentMinor: string | null;
    additionalRules: unknown;
    balances: Totals;
    recordedBalances: Totals;
  };
  const empty = (): Totals => ({ available: '0', reserved: '0', pending: '0', restricted: '0' });
  const currencies = new Map<
    string,
    { currency: string; balances: Totals; allocations: Allocation[] }
  >();
  const allocations = new Map<string, Allocation>();
  for (const row of rows) {
    let group = currencies.get(row.currency);
    if (!group) {
      group = { currency: row.currency, balances: empty(), allocations: [] };
      currencies.set(row.currency, group);
    }
    if (!row.allocation_id) continue;
    let allocation = allocations.get(row.allocation_id);
    if (!allocation) {
      allocation = {
        id: row.allocation_id,
        source: row.source,
        dependentId: row.dependent_id,
        expiresAt: row.expires_at,
        status: row.status,
        programId: row.program_id,
        allowedCategories: row.allowed_categories,
        allowedProviderIds: row.allowed_provider_ids,
        maxPerPaymentMinor: row.max_per_payment_minor,
        additionalRules: row.rules,
        balances: empty(),
        recordedBalances: empty(),
      };
      allocations.set(row.allocation_id, allocation);
      group.allocations.push(allocation);
    }
    if (!buckets.includes(row.bucket)) continue;
    const recorded = row.bucket as Bucket;
    const effective: Bucket = recorded === 'available' && row.unavailable ? 'restricted' : recorded;
    allocation.recordedBalances[recorded] = row.balance_minor;
    allocation.balances[effective] = (
      BigInt(allocation.balances[effective]) + BigInt(row.balance_minor)
    ).toString();
    group.balances[effective] = (
      BigInt(group.balances[effective]) + BigInt(row.balance_minor)
    ).toString();
  }
  return {
    name: 'HealthWallet',
    balanceBasis: 'platform_ledger',
    partnerFundsVerified: false,
    currencies: [...currencies.values()],
  };
}

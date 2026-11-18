import { z } from "zod";
import { pool, transaction, one, type DB } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
import { requirePermission, type Context } from "./access.ts";
import { mode } from "./auth.ts";

const PROVIDER = "ORANGE_MONEY";

export type WalletRow = {
  id: string;
  organization_id: string;
  currency: string;
  balance_minor: string;
  simulated: boolean;
  updated_at: string;
};

async function ensureWallet(
  db: DB,
  organizationId: string,
  currency: string,
  lock = true,
) {
  await db.query(
    `INSERT INTO organization_wallets(organization_id,provider,currency,balance_minor,simulated)
     VALUES($1,$2,$3,0,true) ON CONFLICT (organization_id,provider,currency) DO NOTHING`,
    [organizationId, PROVIDER, currency],
  );
  const wallet = await one(
    db,
    `SELECT * FROM organization_wallets WHERE organization_id=$1 AND provider=$2 AND currency=$3 ${lock ? "FOR UPDATE" : ""}`,
    [organizationId, PROVIDER, currency],
  );
  if (!wallet) throw new DomainError("WALLET_UNAVAILABLE", 503);
  return wallet as WalletRow;
}

async function platformAccounts(db: DB) {
  const rows = (
    await db.query(
      `SELECT id,type FROM organizations WHERE type IN ('LUX','ORANGE') ORDER BY type,created_at`,
    )
  ).rows;
  const lux = rows.find((r: any) => r.type === "LUX")?.id;
  const orange = rows.find((r: any) => r.type === "ORANGE")?.id;
  if (!lux || !orange)
    throw new DomainError("PLATFORM_WALLET_ACCOUNTS_UNCONFIGURED", 503);
  return { lux, orange };
}

/**
 * Confirms that a demo insurer float can cover the debit before a payment is
 * prepared. No real Orange Money balance is queried and no real money moves.
 */
export async function assertWalletFunds(
  db: DB,
  organizationId: string,
  currency: string,
  amountMinor: string,
) {
  const wallet = await ensureWallet(db, organizationId, currency, false);
  if (BigInt(wallet.balance_minor) < BigInt(amountMinor))
    throw new DomainError(
      "DEMO_WALLET_INSUFFICIENT_FUNDS",
      409,
      "The simulated insurer wallet does not hold enough demo float for this payment. Add demo float in the Wallet area; no real funds are involved.",
    );
  return wallet;
}

/**
 * Moves a settled demo payment from the insurer's simulated Orange Money wallet
 * to the facility wallet and the LUX/Orange fee-share wallets. The three credits
 * always equal the insurer debit. Idempotent per payment.
 */
export async function settleWallets(db: DB, payment: any) {
  if (payment.mode !== "demo") return null;
  const existing = await one(
    db,
    "SELECT * FROM wallet_transactions WHERE payment_id=$1 AND kind='SETTLEMENT'",
    [payment.id],
  );
  if (existing) return existing;

  const split = payment.fee_snapshot;
  const insurerDebit = BigInt(split.insurerDebit);
  const facilityCredit = BigInt(split.facilityNet);
  const luxShare = BigInt(split.lux);
  const orangeShare = BigInt(split.orange);
  if (
    insurerDebit <= 0n ||
    facilityCredit < 0n ||
    luxShare < 0n ||
    orangeShare < 0n ||
    facilityCredit + luxShare + orangeShare !== insurerDebit
  )
    throw new DomainError("WALLET_SPLIT_INCONSISTENT", 503);

  const platform = await platformAccounts(db);
  const accounts: [string, bigint, "DEBIT" | "CREDIT"][] = [
    [payment.insurer_id, insurerDebit, "DEBIT"],
    [payment.facility_id, facilityCredit, "CREDIT"],
    [platform.lux, luxShare, "CREDIT"],
    [platform.orange, orangeShare, "CREDIT"],
  ];
  const wallets = new Map<string, WalletRow>();
  for (const [id] of [...accounts].sort(([a], [b]) => a.localeCompare(b)))
    wallets.set(id, await ensureWallet(db, id, payment.currency));
  const insurerWallet = wallets.get(payment.insurer_id)!;
  if (BigInt(insurerWallet.balance_minor) < insurerDebit)
    throw new DomainError(
      "DEMO_WALLET_INSUFFICIENT_FUNDS",
      409,
      "The simulated insurer wallet cannot cover this settlement. Add demo float in the Wallet area; no real money is involved.",
    );

  const tx = await one(
    db,
    `INSERT INTO wallet_transactions(payment_id,from_organization_id,to_organization_id,currency,kind,principal_minor,fee_total_minor,lux_minor,orange_minor,insurer_debit_minor,facility_credit_minor,simulated)
     VALUES($1,$2,$3,$4,'SETTLEMENT',$5,$6,$7,$8,$9,$10,true)
     ON CONFLICT (payment_id,kind) DO NOTHING RETURNING *`,
    [
      payment.id,
      payment.insurer_id,
      payment.facility_id,
      payment.currency,
      payment.base_minor,
      split.total,
      split.lux,
      split.orange,
      split.insurerDebit,
      split.facilityNet,
    ],
  );
  if (!tx)
    return one(
      db,
      "SELECT * FROM wallet_transactions WHERE payment_id=$1 AND kind='SETTLEMENT'",
      [payment.id],
    );
  for (const [orgId, amount, direction] of accounts) {
    if (amount === 0n) continue;
    await db.query(
      `UPDATE organization_wallets SET balance_minor=balance_minor${direction === "DEBIT" ? "-" : "+"}$2::bigint,updated_at=now() WHERE organization_id=$1 AND provider=$3 AND currency=$4`,
      [orgId, String(amount), PROVIDER, payment.currency],
    );
  }
  return tx;
}

/** Reverses a previously settled demo transfer, restoring every wallet. */
export async function reverseWallets(db: DB, payment: any) {
  if (payment.mode !== "demo") return null;
  const settlement = await one(
    db,
    "SELECT * FROM wallet_transactions WHERE payment_id=$1 AND kind='SETTLEMENT'",
    [payment.id],
  );
  if (!settlement) return null;
  const existing = await one(
    db,
    "SELECT * FROM wallet_transactions WHERE payment_id=$1 AND kind='REVERSAL'",
    [payment.id],
  );
  if (existing) return existing;
  const platform = await platformAccounts(db);
  const insurerDebit = BigInt(settlement.insurer_debit_minor);
  const facilityCredit = BigInt(settlement.facility_credit_minor);
  const luxShare = BigInt(settlement.lux_minor);
  const orangeShare = BigInt(settlement.orange_minor);
  const debits: [string, bigint][] = [
    [payment.facility_id, facilityCredit],
    [platform.lux, luxShare],
    [platform.orange, orangeShare],
  ].filter(([, amount]) => amount > 0n) as [string, bigint][];
  const wallets = new Map<string, WalletRow>();
  for (const id of [payment.insurer_id, ...debits.map(([id]) => id)].sort())
    wallets.set(id, await ensureWallet(db, id, payment.currency));
  for (const [orgId, amount] of debits)
    if (BigInt(wallets.get(orgId)!.balance_minor) < amount)
      throw new DomainError(
        "DEMO_WALLET_REVERSAL_INSUFFICIENT_FUNDS",
        409,
        "A wallet has already used the simulated funds; reversal needs manual reconciliation.",
      );
  const tx = await one(
    db,
    `INSERT INTO wallet_transactions(payment_id,from_organization_id,to_organization_id,currency,kind,principal_minor,fee_total_minor,lux_minor,orange_minor,insurer_debit_minor,facility_credit_minor,simulated)
     VALUES($1,$2,$3,$4,'REVERSAL',$5,$6,$7,$8,$9,$10,true)
     ON CONFLICT (payment_id,kind) DO NOTHING RETURNING *`,
    [
      payment.id,
      payment.insurer_id,
      payment.facility_id,
      payment.currency,
      settlement.principal_minor,
      settlement.fee_total_minor,
      settlement.lux_minor,
      settlement.orange_minor,
      settlement.insurer_debit_minor,
      settlement.facility_credit_minor,
    ],
  );
  if (!tx)
    return one(
      db,
      "SELECT * FROM wallet_transactions WHERE payment_id=$1 AND kind='REVERSAL'",
      [payment.id],
    );
  await db.query(
    `UPDATE organization_wallets SET balance_minor=balance_minor+$2::bigint,updated_at=now() WHERE organization_id=$1 AND provider=$3 AND currency=$4`,
    [payment.insurer_id, String(insurerDebit), PROVIDER, payment.currency],
  );
  for (const [orgId, amount] of debits)
    await db.query(
      `UPDATE organization_wallets SET balance_minor=balance_minor-$2::bigint,updated_at=now() WHERE organization_id=$1 AND provider=$3 AND currency=$4`,
      [orgId, String(amount), PROVIDER, payment.currency],
    );
  return tx;
}

export async function paymentWalletSummary(db: DB, paymentId: string) {
  return one(
    db,
    `SELECT w.*,fo.name from_organization_name,to_organization.name to_organization_name
       FROM wallet_transactions w
       JOIN organizations fo ON fo.id=w.from_organization_id
       JOIN organizations to_organization ON to_organization.id=w.to_organization_id
      WHERE w.payment_id=$1 ORDER BY w.created_at`,
    [paymentId],
  );
}

function transactionScope(ctx: Context) {
  // Only the platform operator may see the whole network ledger. A partner
  // (Orange) or a participant organization sees only transfers where it is a
  // party, never other organizations' balances or counterparties.
  const platform = ctx.orgType === "LUX";
  return {
    platform,
    sql: platform
      ? "($1::uuid IS NULL)"
      : "(w.from_organization_id=$1 OR w.to_organization_id=$1)",
    params: [platform ? null : ctx.orgId] as (string | null)[],
  };
}

export class FinanceService {
  async wallet(ctx: Context) {
    requirePermission(ctx, "wallet.read");
    const scope = transactionScope(ctx);
    const platform = ctx.orgType === "LUX";
    const partner = ctx.orgType === "ORANGE";
    const [wallets, fundings, transfers, aggregates, payable, share] =
      await Promise.all([
        pool.query(
          `SELECT w.*,o.name organization_name,o.type organization_type
           FROM organization_wallets w JOIN organizations o ON o.id=w.organization_id
          WHERE $1::boolean OR w.organization_id=$2
          ORDER BY o.type,o.name,w.currency`,
          [platform, ctx.orgId],
        ),
        pool.query(
          `SELECT f.*,o.name organization_name
           FROM wallet_fundings f JOIN organizations o ON o.id=f.organization_id
          WHERE $1::boolean OR f.organization_id=$2
          ORDER BY f.created_at DESC LIMIT 50`,
          [platform, ctx.orgId],
        ),
        pool.query(
          `SELECT w.*,fo.name from_organization_name,too.name to_organization_name,
                CASE WHEN w.from_organization_id=$1 THEN 'OUT'
                     WHEN w.to_organization_id=$1 THEN 'IN'
                     ELSE 'PLATFORM' END direction
           FROM wallet_transactions w
           JOIN organizations fo ON fo.id=w.from_organization_id
           JOIN organizations too ON too.id=w.to_organization_id
          WHERE ${scope.sql}
          ORDER BY w.created_at DESC LIMIT 60`,
          scope.params,
        ),
        pool.query(
          `SELECT currency,kind,count(*)::int count,
                sum(principal_minor)::text principal,
                sum(fee_total_minor)::text fees,
                sum(lux_minor)::text lux,
                sum(orange_minor)::text orange,
                sum(insurer_debit_minor)::text insurer_debit,
                sum(facility_credit_minor)::text facility_credit
           FROM wallet_transactions w
          WHERE ${scope.sql}
          GROUP BY currency,kind`,
          scope.params,
        ),
        ctx.orgType === "INSURER"
          ? pool.query(
              `SELECT * FROM (
               SELECT c.id,c.reference,c.currency,c.submitted_minor,c.approved_minor,c.state,
                      p.display_name patient_name,f.name facility_name,
                      c.approved_minor - COALESCE((
                        SELECT sum(a.amount_minor) FROM claim_payment_allocations a
                         WHERE a.claim_id=c.id AND a.status IN ('RESERVED','CONFIRMED')
                      ),0) payable_minor
                 FROM claims c
                 JOIN patients p ON p.id=c.patient_id
                 JOIN organizations f ON f.id=c.facility_id
                WHERE c.insurer_id=$1 AND c.state IN ('APPROVED','PARTIALLY_APPROVED')
             ) q WHERE payable_minor>0 ORDER BY reference`,
              [ctx.orgId],
            )
          : Promise.resolve({ rows: [] as any[] }),
        // A partner sees only its own accrual aggregate, never the paying or
        // receiving organization, the principal or the other fee share.
        partner
          ? pool.query(
              `SELECT currency,
                      sum(CASE WHEN kind='REVERSAL' THEN -1 ELSE 1 END)::int count,
                      sum(CASE WHEN kind='REVERSAL' THEN -orange_minor ELSE orange_minor END)::text orange
                 FROM wallet_transactions
                GROUP BY currency`,
            )
          : Promise.resolve({ rows: [] as any[] }),
      ]);

    const totals = new Map<
      string,
      {
        currency: string;
        count: number;
        principal: bigint;
        fees: bigint;
        lux: bigint;
        orange: bigint;
        insurerDebited: bigint;
        facilityCredited: bigint;
      }
    >();
    for (const row of aggregates.rows) {
      const sign = row.kind === "REVERSAL" ? -1n : 1n;
      const key = row.currency;
      if (!totals.has(key))
        totals.set(key, {
          currency: key,
          count: 0,
          principal: 0n,
          fees: 0n,
          lux: 0n,
          orange: 0n,
          insurerDebited: 0n,
          facilityCredited: 0n,
        });
      const t = totals.get(key)!;
      t.count += Number(row.count) * Number(sign);
      t.principal += sign * BigInt(row.principal);
      t.fees += sign * BigInt(row.fees);
      t.lux += sign * BigInt(row.lux);
      t.orange += sign * BigInt(row.orange);
      t.insurerDebited += sign * BigInt(row.insurer_debit);
      t.facilityCredited += sign * BigInt(row.facility_credit);
    }
    return {
      mode,
      simulated: true,
      simulationNotice:
        "All wallet balances and transfers are simulated Orange Money records. No live Orange Money API is configured, no real PIN is accepted and no real funds move.",
      scope: platform ? "PLATFORM" : partner ? "PARTNER" : "ORGANIZATION",
      wallets: wallets.rows,
      fundings: fundings.rows,
      transactions: transfers.rows,
      feeShare: share.rows.map((r: any) => ({
        currency: r.currency,
        count: Number(r.count),
        orangeMinor: String(r.orange || 0),
      })),
      totals: [...totals.values()].map((t) => ({
        currency: t.currency,
        count: t.count,
        principalMinor: String(t.principal),
        feesMinor: String(t.fees),
        luxMinor: String(t.lux),
        orangeMinor: String(t.orange),
        insurerDebitedMinor: String(t.insurerDebited),
        facilityCreditedMinor: String(t.facilityCredited),
      })),
      payableClaims: payable.rows,
      canFund:
        ctx.orgType === "LUX" &&
        ctx.permissions.includes("organizations"),
    };
  }

  /**
   * Demo-only float for an insurer or partner wallet. It never touches a real
   * provider balance and is recorded in the append-only funding ledger.
   */
  async fund(ctx: Context, input: unknown) {
    requirePermission(ctx, "organizations");
    if (mode !== "demo")
      throw new DomainError("DEMO_WALLET_FUNDING_UNAVAILABLE", 404);
    const data = z
      .object({
        organizationId: z.uuid(),
        currency: z.enum(["USD", "LRD"]).default("USD"),
        amountMinor: z.string().regex(/^[1-9]\d{0,11}$/),
        reason: z.string().trim().min(5).max(240),
      })
      .parse(input);
    return transaction(async (db) => {
      const wallet = await ensureWallet(db, data.organizationId, data.currency);
      const funding = await one(
        db,
        `INSERT INTO wallet_fundings(organization_id,provider,currency,amount_minor,reason,simulated)
         VALUES($1,$2,$3,$4,$5,true) RETURNING *`,
        [
          data.organizationId,
          PROVIDER,
          data.currency,
          data.amountMinor,
          data.reason,
        ],
      );
      const updated = await one(
        db,
        `UPDATE organization_wallets SET balance_minor=balance_minor+$2::bigint,updated_at=now()
          WHERE id=$1 RETURNING *`,
        [wallet.id, data.amountMinor],
      );
      return {
        funding,
        wallet: updated,
        simulated: true,
        notice:
          "Simulated demo float only. This is not a customer deposit and LUX holds no customer money.",
      };
    });
  }
}

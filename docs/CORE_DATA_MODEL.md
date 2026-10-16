# Core model and double-entry ledger

The core migration is `apps/api/drizzle/0004_cheerful_ikaris.sql`. It extends the existing identity and authorization schema. `schema.ts` defines the tables; the migration additionally installs PostgreSQL triggers for accounting integrity. Use versioned migrations, not `drizzle-kit push`, to retain those database invariants.

## Model map

| Domain                      | Tables                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Identity and access         | `users`, `user_roles`, `auth_sessions`, `consents`, `dependents`, `care_authorizations`               |
| Institutions                | `organizations`, `organization_memberships`, `organization_invitations`                               |
| Provider verification       | `providers`, `provider_verification_records`, `verification_reviews`                                  |
| HealthWallet                | `wallets`, `funding_allocations`, `funding_reservations`                                              |
| Accounting                  | `ledger_accounts`, `journal_entries`, `journal_lines`, `financial_operations`, `currency_conversions` |
| Contributions and benefits  | `contributions`, `programs`, `vouchers`, `credit_records`                                             |
| Care and documents          | `bills`, `bill_items`, `bill_documents`                                                               |
| AI and review               | `ai_runs`, `validation_findings`, `review_cases`; legacy `ai_artifacts` remains readable              |
| Payments                    | `payment_intents`, `payment_attempts`, `partner_settlements`, `receipts`                              |
| Communication and oversight | `notifications`, `disputes`, `audit_events`                                                           |

Existing `ledger_entries` was a single-sided placeholder. New writes to it are rejected. Existing rows are retained for reconciliation and are not silently treated as opening double-entry balances. If a deployment has legacy financial rows, reconcile them before posting explicit opening journals. Never infer partner cash from those rows.

## Money and currency

New accounting amounts are PostgreSQL `bigint` minor units. Existing bill, contribution and payment-intent integer columns remain exact, bounded integers. Rates use `numeric(38,18)`. Monetary arithmetic uses SQL integer/numeric operations or JavaScript `bigint`; JSON amounts and wallet balances are decimal strings. The funding allocator also uses bigint, and the browser formats exact minor-unit strings without converting them to Number.

Journals and their accounts/lines must have the same currency. Financial child records must match their parent currency. A customer's wallet response groups sources by currency and never adds LRD and USD into one number.

`LedgerService.convert` requires an explicit quote reference, source/destination amounts and an exact decimal rate expressed as **destination minor units per source minor unit**. It posts a balanced journal in each currency and the conversion record in one transaction. The database verifies `round(source_minor * rate) = destination_minor` (positive amounts, half-up rounding). It rejects orphan conversion journals. Conversion is limited to unrestricted personal savings belonging to the same beneficiary; no live FX provider is implied.

## Posting and concurrency

Only draft journals accept lines. Posting requires at least two positive lines, equal debit/credit totals, and matching currency. PostgreSQL locks all affected accounts in UUID order using `FOR NO KEY UPDATE`, applies the net balance changes, and rejects negative wallet balances. These locks are compatible with foreign-key key-share locks, preventing unnecessary lock-upgrade deadlocks.

Account balance changes are allowed only from the posting trigger. Account identity and posted journals/lines cannot be edited; posted rows cannot be deleted or truncated. A reversal must exactly invert the original and may occur only once. Payment reservations/captures and currency conversions require their own lifecycle corrections rather than a detached generic reversal.

Every service operation runs inside a transaction and takes an advisory lock for its idempotency key. The persisted request fingerprint and result are committed with the journal and business changes. An identical retry returns the original result; different input with the same key fails. Failed operations roll back, leaving the key available for a legitimate retry. Callers should derive keys from durable business events, not generate new keys when retrying an uncertain result.

Transactions have bounded lock/statement waits. A timeout or connection failure is not evidence that a payment succeeded or failed: retry the same operation with the same key. The database guarantees are for the trusted application role; database owners can administratively disable triggers, so database credentials must remain server-only.

## Available, reserved, pending and restricted

Each allocation has four separate liability accounts. Sources are personal savings, family contributions, employer benefits, sponsor vouchers, rewards and partner credit. Allocations identify the wallet, beneficiary, optional exact dependent, source, currency, expiry, program and rules version. Supported restrictions include permitted care categories/providers and per-payment caps. Unknown additional rules fail closed for spending; changed program terms require a new rule version and old allocations require review.

| Operation                     | Debit              | Credit                                                      |
| ----------------------------- | ------------------ | ----------------------------------------------------------- |
| Platform funding credit       | Partner receivable | Allocation's available, pending or restricted account       |
| Reserve eligible care         | Available          | Reserved                                                    |
| Release reservation           | Reserved           | Available, or restricted if allocation is expired/suspended |
| Capture fully reserved intent | Reserved           | Partner payable                                             |
| Approved bucket adjustment    | Previous bucket    | New bucket                                                  |

Pending and restricted funds cannot be reserved. Reservation checks beneficiary/dependent, currency, program version, expiry, care category/provider, allocation and program caps, and total intent funding. It checks policy again at capture. Expired holds cannot be captured and can be released idempotently. A scheduler may call release for expired holds; automatic scheduling is not enabled by this migration.

The wallet projection labels expired, inactive, future, or unsupported-rule funding as restricted without altering historical postings. Available amounts are for eligible care; each source shows its restrictions. Reservations remain held until explicitly released or captured.

## Partner settlement is separate

`ledger_captured` is not `paid`. Ledger credit/capture creates an **expected** settlement record with no confirmation evidence. `partner_settlements` records partner identity, external reference, mode, amount/currency, status, evidence and confirmation time. A confirmed record requires evidence and a partner reference. Issued receipts require a matching confirmed settlement; the synthetic receipt is explicitly pending.

The wallet returns `balanceBasis: "platform_ledger"` and `partnerFundsVerified: false`. A future partner adapter must reconcile authenticated partner events against expected settlements. This model does not activate real payments or establish custody of partner funds.

## Application boundary

`GET /api/wallet` returns only the authenticated customer's wallets, grouped by currency with per-source balances and restrictions. The customer home renders loading, empty, signed-out, network-error/retry and populated states. Existing document and institutional access controls remain in force.

The ledger service is an internal module, not a public credit/debit API. A calling workflow must authorize the operation and validate any partner evidence before invoking it. No customer endpoint can mint funds, change ledger balances, or perform arbitrary journal adjustments.

## Synthetic seed and tests

After migrations, run:

```sh
pnpm --filter @healthwallet/api db:seed
```

The seed requires `--synthetic` (included by this command), APP_ENV development/demo/test, and a database ending `_dev`, `_demo` or `_test`. It is atomic and idempotent, uses deterministic fixture identifiers and fictional +999 phone numbers, and creates no usable session or PlatformAdmin. It includes six funding sources, separate LRD/USD wallets, all four balance states, a care bill with items/document, AI/review records, provider verification, a voucher, offered credit, a pending receipt/settlement, notifications and a dispute. The synthetic document is written through the configured storage adapter after the database seed; retry safely if that storage write fails.

Run the Neon ledger integration suite with:

```sh
node apps/api/scripts/run-ledger-tests.mjs
```

It targets only `healthwallet_test`, creates a random isolated schema, applies all migrations and seeds, and drops only that schema afterward. It tests exact large amounts, duplicate retries, concurrent spending, currency and rule restrictions, immutable history, reversals, capture/release, FX atomicity, and reconciliation. Financial history is never deleted for test cleanup in shared schemas.

Sources for database behavior: [PostgreSQL exact numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html) and [row/advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html).

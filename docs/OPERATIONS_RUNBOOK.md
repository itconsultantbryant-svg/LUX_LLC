# Operations Runbook

Product: **HealthWallet Liberia** · AI: **LUX HealthTrust**

Operational procedures for backups, restore, data retention, runtime incidents,
and payment recovery. All commands run from `apps/api` unless noted. Never paste
secrets into tickets or logs.

---

## 1. Scheduled jobs

| Job            | Command                    | Cadence (suggested) | Notes                                                   |
| -------------- | -------------------------- | ------------------- | ------------------------------------------------------- |
| Reconciliation | `pnpm worker:reconcile`    | every 15 min        | Expires stale quotes/payments, releases reservations.   |
| Data retention | `pnpm worker:retention`    | daily               | Add `--dry-run` to preview counts first.                |
| Backup         | `pnpm db:backup ./backups` | daily               | Custom-format dump; store off-host and encrypt at rest. |

Retention never purges ledger, payment, settlement, receipt, dispute, credit, or
audit records.

## 2. Backup and restore

### Backup

```bash
DATABASE_URL=postgres://... pnpm db:backup ./backups
```

Writes `healthwallet-<timestamp>.dump` via `pg_dump --format=custom`. Verify the
file is non-empty and copy it to durable, access-controlled storage.

### Restore

Restore is destructive and guarded:

```bash
RESTORE_CONFIRM=yes DATABASE_URL=postgres://.../healthwallet_restore pnpm db:restore ./backups/healthwallet-<ts>.dump
```

- Refuses without `RESTORE_CONFIRM=yes`.
- Refuses a `.neon.tech` (hosted) target unless `RESTORE_ALLOW_REMOTE=yes`.
- Prefers a database whose name ends in `_restore`; override with
  `RESTORE_ALLOW_ANY=yes`.

After restore, run migrations to confirm the schema is current, then run the
read-path smoke test.

### Recovery drill (quarterly)

1. `pnpm db:backup ./backups`
2. `RESTORE_CONFIRM=yes DATABASE_URL=.../healthwallet_restore pnpm db:restore ./backups/<file>`
3. `pnpm db:migrate` against the restore database.
4. Spot-check a recent bill, receipt, and audit event.

## 3. Configuration preflight

Before promoting a production environment:

```bash
pnpm check:production /path/to/production.env.local
```

Verifies production settings (TLS origins, private storage, Twilio, encryption
key, payment callback secret) without printing values.

## 4. Runtime incidents

### Kill switches

Disable a subsystem without a deploy (platform admin, fresh MFA):

```bash
# inspect
curl /api/admin/flags
# disable AI extraction
curl -X PUT /api/admin/flags/ai_extraction -d '{"enabled":false,"reason":"incident INC-123"}'
```

Flags: `payments`, `ai_extraction`, `partner_modules`. Every change is audited.

### Payment incidents

`GET /api/admin/payment-incidents` inventories failed/stuck intents, rejected or
unsigned provider events, failed refunds, and unsettled partner settlements.
Investigate, then run `pnpm worker:reconcile`. Reconciliation adjusts platform
state only and never fabricates partner settlement.

### Provider callback replay

Callbacks are idempotent and sequenced by `last_event_sequence`; re-sending a
duplicate or stale event is rejected as `rejected_transition`/`stale` without
double-posting. To re-drive a legitimate missed event, use the sandbox
`simulate-callback` path in non-production only.

### Fraud escalation

`POST /api/admin/bills/:id/fraud-escalation` opens an escalated review case and,
optionally, suspends the provider. All escalations are audited.

## 5. Data subject requests

- Export: the customer calls `GET /api/account/export`. Escalate if the account
  is compromised.
- Deletion: the customer calls `POST /api/account/deletion`; an operator
  processes it via `POST /api/admin/account-deletions/:id/process`. Financial and
  audit records are retained by policy (`docs/SECURITY_HARDENING.md` §7).

## 6. Dependency and secret hygiene

```bash
pnpm audit:check        # fails on high/critical advisories
```

Set `AUDIT_ALLOW_OFFLINE=1` for air-gapped CI (skips instead of failing).
Secret scanning runs in CI (gitleaks).

## 7. Escalation

| Symptom                      | First action                                               |
| ---------------------------- | ---------------------------------------------------------- |
| Suspected payment corruption | Disable `payments`; capture `payment-incidents`; reconcile |
| Suspected data exposure      | Disable affected flag; rotate secrets; review audit trail  |
| Provider fraud               | Fraud-escalation route; suspend provider                   |
| Database loss                | Restore to `*_restore`; validate; cut over                 |

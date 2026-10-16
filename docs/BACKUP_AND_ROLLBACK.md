# Backup, restore, and rollback

How the database is backed up on a schedule, how a restore is **verified** (not
just assumed), and how to roll a bad deploy back. The scripts referenced here
also appear in [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md); this document
adds the schedule, the drill evidence, and the rollback procedure.

## 1. Backup schedule

| What           | When             | How                                                         |
| -------------- | ---------------- | ----------------------------------------------------------- |
| Full DB backup | Daily, 02:30 UTC | `pnpm db:backup` (custom-format `pg_dump`) → artifact       |
| Neon PITR      | Continuous       | Neon point-in-time restore within the branch retention      |
| Restore drill  | Quarterly        | Restore the newest backup into `*_restore` and check parity |

Backups use `pg_dump --format=custom --no-owner --no-acl`, which is portable
across environments and supports selective/parallel restore. Each run writes
`backups/healthwallet-<timestamp>.dump` and prints only the target host — never
the password.

Run it manually against an unpooled connection:

```bash
DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:backup backups
```

The scheduled version lives in
[`.github/workflows/scheduled-ops.yml`](../.github/workflows/scheduled-ops.yml)
and uploads each dump as a 30-day workflow artifact. Point the schedule at any
scheduler you prefer; the command is the interface. Store production backups in
a location with restricted access and an independent retention policy — a backup
beside the database is not a backup.

## 2. Restore

`restore-db.mjs` is deliberately hard to run by accident. It refuses unless:

- `RESTORE_CONFIRM=yes` is set,
- the target database name ends in `_restore` (override with
  `RESTORE_ALLOW_ANY=yes`), and
- the target is not a hosted `.neon.tech` endpoint (override with
  `RESTORE_ALLOW_REMOTE=yes`).

```bash
# 1. Create an empty target database (or a throwaway Neon branch)
createdb healthwallet_restore

# 2. Restore
RESTORE_CONFIRM=yes DATABASE_URL="$RESTORE_URL" \
  pnpm db:restore backups/healthwallet-<timestamp>.dump
```

`pg_restore --clean --if-exists --no-owner --no-acl` drops and recreates objects
in the target, so the target must be disposable.

### Restoring into production

1. Take a fresh backup of the current production database first.
2. Prefer restoring into a new database/branch and switching the connection
   string, so the current data is untouched until cutover.
3. If you must restore in place, `RESTORE_ALLOW_REMOTE=yes RESTORE_ALLOW_ANY=yes`
   and accept that the `--clean` step drops existing objects.
4. Re-run `/ready` and the demo smoke after the restore.

## 3. Verified restore (drill evidence)

A restore is only trustworthy if it has been exercised. Last drill: **2026-10-15**,
on the demo database.

- Backup: `backups/healthwallet-2026-10-15T23-13-30-076Z.dump` (custom format).
- Target: a fresh `healthwallet_restore` database.
- Result: `pg_restore` exited 0; table count matched (75 public tables in both).
- Parity spot checks: `users` 3/3, `bills` 1/1, `payment_intents` 1/1,
  `ledger_accounts` 30/30, `audit_events` 9/9.

Reproduce the drill:

```bash
createdb healthwallet_restore
DATABASE_URL="$UNPOOLED" pnpm db:backup backups
RESTORE_CONFIRM=yes DATABASE_URL="$RESTORE_URL" \
  pnpm db:restore "$(ls -t backups/*.dump | head -1)"
# Compare table counts and a few row counts against the source database
```

Record each quarterly drill's date and result here so the evidence is auditable.

## 4. Rollback

A deploy is rolled back in the layer that failed. Vercel and the Neon Function
deploy independently.

### Frontend (Vercel)

Bad static build or middleware: promote the previous deployment in the Vercel
dashboard ("Instant Rollback"), or `vercel rollback`. No database involvement.
Edge Middleware changes roll back with the frontend deployment.

### Backend (Neon Function)

Redeploy the previous function build for the branch. The API is stateless, so a
backend rollback alone is safe as long as the schema is backward compatible.

### Schema

If the failed deploy included a migration that is not backward compatible:

1. Stop the failing deploy (roll back the function/frontend first).
2. Restore the pre-migration backup into a new database/branch (see §2), or
   apply the explicit reverse migration you wrote when authoring the change.
3. Point the function at the restored connection string.
4. Verify `/ready`, then `pnpm test:journey`.

Because migrations prefer expand/contract (see [MIGRATIONS.md](./MIGRATIONS.md)),
most schema changes do **not** require a data restore — the previous code keeps
working against the expanded schema.

### Rollback checklist

- [ ] Frontend: previous deployment promoted.
- [ ] Backend: previous function build deployed.
- [ ] Schema: compatible, or restored/reversed and verified.
- [ ] `/health` and `/ready` green.
- [ ] `node deploy/verify-demo.mjs <origin>` passes.
- [ ] `pnpm test:journey` passes.
- [ ] Incident logged (see [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)).

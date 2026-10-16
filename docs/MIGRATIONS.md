# Database migrations

Migrations are hand-written SQL in `apps/api/drizzle/`, applied in filename
order by Drizzle's migrator (`apps/api/src/db/migrate.ts`). The runner is
idempotent: Drizzle records applied migrations in `drizzle.__drizzle_migrations`
and skips them on re-run.

## Running migrations

```bash
# Local / demo
APP_ENV=demo DATABASE_URL=postgresql://.../healthwallet_demo pnpm db:migrate

# Production (before deploying the function that needs the change)
APP_ENV=production DATABASE_URL_UNPOOLED=postgresql://... pnpm db:migrate
```

- Always migrate with the **unpooled** connection string; poolers reject some
  DDL. The runner prefers `DATABASE_URL_UNPOOLED` when present.
- Migrate **before** the function deploy that depends on the new schema.
- The runner logs a masked connection string; it never prints passwords.

## Authoring a migration

1. Edit the Drizzle schema in `apps/api/src/db/schema.ts`.
2. Generate SQL: `pnpm db:generate`.
3. Review the generated file. Keep the `--> statement-breakpoint` separators.
   Prefer additive changes (new columns/tables, `NOT NULL DEFAULT`, new indexes)
   so old and new code can run side by side.
4. Add the file to `apps/api/drizzle/` and run it locally against `_dev`.
5. Add or extend a database integration test proving the change.

## Expand / contract (zero-downtime changes)

For anything that is not purely additive:

1. **Expand** — add the new column/table, allow nulls or provide a default.
   Deploy code that writes both old and new shapes.
2. **Backfill** — populate the new shape in a batched statement.
3. **Contract** — once all readers use the new shape, add constraints and drop
   the old column in a later migration.

Never rename or drop a column that still-running code reads. A function deploy
and a migration deploy independently; the schema must tolerate the window where
one is ahead of the other.

## Change checklist

- [ ] Migration is additive or uses expand/contract.
- [ ] Applied and verified locally against `_dev`.
- [ ] A backup was taken immediately before applying to production
      (`pnpm db:backup`; see [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)).
- [ ] The change is covered by a database integration test.
- [ ] `pnpm check` is green.
- [ ] The rollback path is written down (redeploy prior build + restore backup,
      or a reverse migration).

## Verifying which migrations are applied

```bash
psql "$DATABASE_URL_UNPOOLED" -c \
  "select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 5;"
```

## Rollback

Schema changes are normally reverted by restoring the pre-migration backup, not
by editing history. Drizzle does not auto-generate down migrations, so write an
explicit reverse migration only for changes that cannot be reverted by restore
(and test it on a `_test` database first). The full procedure is in
[BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md).

import "../packages/config/env.ts";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
const source = process.env.DATABASE_URL,
  target = process.env.RESTORE_DATABASE_URL;
if (
  !source ||
  !target ||
  source === target ||
  process.env.ALLOW_RESTORE_DRILL !== "true"
)
  throw Error(
    "Supply a separate empty RESTORE_DATABASE_URL and ALLOW_RESTORE_DRILL=true.",
  );
const check = new pg.Pool({ connectionString: target });
const existing = await check.query(
  `SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'`,
);
await check.end();
if (existing.rows[0].n)
  throw Error(
    "Restore target must be empty; existing data will not be overwritten.",
  );
const dir = await mkdtemp(
  path.join(process.env.OPENCODE_TEMP_DIR || tmpdir(), "lux-restore-"),
);
const file = path.join(dir, "backup.dump");
try {
  execFileSync("pg_dump", ["--format=custom", "--file=" + file, source], {
    stdio: "pipe",
  });
  execFileSync("pg_restore", ["--no-owner", "--dbname=" + target, file], {
    stdio: "pipe",
  });
  const restored = new pg.Pool({ connectionString: target });
  for (const table of [
    "organizations",
    "claims",
    "claim_versions",
    "ledger_entries",
    "audit_events",
  ]) {
    const count = await restored.query(`SELECT count(*)::int n FROM ${table}`);
    console.log(table, count.rows[0].n);
  }
  await restored.end();
  console.log(
    "Logical restore completed in isolated database. No worker was started. External payment reconciliation and object restoration remain operator tasks.",
  );
} finally {
  await rm(file, { force: true });
  await rmdir(dir);
}

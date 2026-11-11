import { pool, transaction } from "../packages/db/index.ts";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await pool.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
);
for (const name of (await readdir(new URL("./migrations/", import.meta.url)))
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  const sql = await readFile(
    new URL("./migrations/" + name, import.meta.url),
    "utf8",
  );
  const checksum = createHash("sha256").update(sql).digest("hex");
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(772310)");
    const previous = (
      await db.query("SELECT checksum FROM schema_migrations WHERE name=$1", [
        name,
      ])
    ).rows[0];
    if (previous) {
      if (previous.checksum !== checksum)
        throw Error("Migration checksum mismatch: " + name);
      return;
    }
    await db.query(sql);
    await db.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
    console.log("Applied", name);
  });
}
await pool.end();

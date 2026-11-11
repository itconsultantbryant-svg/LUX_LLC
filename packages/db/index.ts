import "../config/env.ts";
import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
export type DB = Pick<pg.PoolClient, "query">;
export async function transaction<T>(
  work: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const value = await work(db);
    await db.query("COMMIT");
    return value;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function one(
  db: DB,
  sql: string,
  args: unknown[] = [],
): Promise<any> {
  return (await db.query(sql, args)).rows[0];
}

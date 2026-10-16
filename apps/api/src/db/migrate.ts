import { config as loadDotenv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

loadDotenv();

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL ??
  'postgresql://healthwallet:healthwallet@127.0.0.1:5432/healthwallet_dev';

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.join(here, '../../drizzle');

  console.log(`Running migrations against ${maskDatabaseUrl(databaseUrl)}`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');
  await pool.end();
}

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[unparseable DATABASE_URL]';
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

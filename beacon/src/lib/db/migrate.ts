import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../../db/migrations");

/**
 * Apply any not-yet-applied SQL migrations (in filename order) using an ADMIN
 * connection string. Each migration runs in its own transaction and is recorded
 * in `_migrations`. Safe to run repeatedly.
 */
export async function runMigrations(adminUrl: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
      if (rows.length > 0) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations(name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

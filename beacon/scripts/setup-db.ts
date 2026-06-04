import "./_bootstrap.js";
import pg from "pg";

/**
 * Idempotently provision the local Postgres cluster for Beacon:
 *   - a NON-superuser `beacon_app` login role (so RLS is enforced at runtime)
 *   - `beacon_dev` and `beacon_test` databases owned by the admin role
 *   - CONNECT grants for `beacon_app`
 *
 * Requires a superuser connection. Uses the maintenance `postgres` database.
 * Honors env: PGSUPER_URL (default postgres://postgres:postgres@127.0.0.1:5432/postgres)
 */
const SUPER_URL =
  process.env.PGSUPER_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const APP_PASSWORD = process.env.BEACON_APP_PASSWORD ?? "beacon_app";

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: SUPER_URL });
  await client.connect();
  try {
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'beacon_app'");
    if (role.rows.length === 0) {
      await client.query(
        `CREATE ROLE beacon_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
      console.log("created role beacon_app");
    } else {
      console.log("role beacon_app already exists");
    }

    for (const db of ["beacon_dev", "beacon_test"]) {
      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
      if (exists.rows.length === 0) {
        await client.query(`CREATE DATABASE ${db}`);
        console.log(`created database ${db}`);
      } else {
        console.log(`database ${db} already exists`);
      }
      await client.query(`GRANT CONNECT ON DATABASE ${db} TO beacon_app`);
    }
  } finally {
    await client.end();
  }
  console.log("setup-db complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

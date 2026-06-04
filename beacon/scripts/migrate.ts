import "./_bootstrap.js";
import { runMigrations } from "../src/lib/db/migrate.js";
import { env } from "../src/lib/env.js";

async function main(): Promise<void> {
  // Always migrate the dev DB; also migrate the test DB so `npm test` is ready.
  const targets = [
    process.env.DATABASE_ADMIN_URL ?? env.databaseAdminUrl,
    process.env.DATABASE_ADMIN_URL_TEST ??
      "postgres://postgres:postgres@127.0.0.1:5432/beacon_test",
  ];
  for (const url of targets) {
    const applied = await runMigrations(url);
    const dbName = url.split("/").pop();
    console.log(
      applied.length > 0
        ? `migrated ${dbName}: ${applied.join(", ")}`
        : `migrated ${dbName}: already up to date`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

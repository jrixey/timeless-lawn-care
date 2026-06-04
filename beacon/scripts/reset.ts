import "./_bootstrap.js";
import { adminPool } from "../src/lib/db/pool.js";

/** Truncate all application data (admin connection, bypasses RLS). */
async function main(): Promise<void> {
  await adminPool().query("TRUNCATE agencies CASCADE");
  console.log("reset: all data truncated");
  await adminPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

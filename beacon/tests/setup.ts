import { config } from "dotenv";
config();

// Ensure test mode so env.ts selects the *_TEST databases and mock providers.
// Vitest already sets NODE_ENV=test and VITEST=true; assign defensively without
// tripping the read-only NODE_ENV type.
Object.assign(process.env, { NODE_ENV: "test", VITEST: "true" });

import { beforeAll, beforeEach } from "vitest";
import { runMigrations } from "../src/lib/db/migrate.js";
import { env } from "../src/lib/env.js";
import { adminPool } from "../src/lib/db/pool.js";
import { outbox } from "../src/lib/adapters/mock/outbox.js";
import { resetAdapters } from "../src/lib/adapters/index.js";

beforeAll(async () => {
  await runMigrations(env.databaseAdminUrl);
});

beforeEach(async () => {
  await adminPool().query("TRUNCATE agencies CASCADE");
  outbox.clear();
  resetAdapters();
});

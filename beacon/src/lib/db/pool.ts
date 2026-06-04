import pg from "pg";
import { env } from "@/lib/env";

const { Pool } = pg;

// Postgres returns BIGINT/NUMERIC as strings by default; for our integer-cents
// and counts we want JS numbers where safe. Keep BIGINT as string to avoid
// precision loss, but parse INT counts normally (pg already does that).

declare global {
  // eslint-disable-next-line no-var
  var __beaconAppPool: pg.Pool | undefined;
  // eslint-disable-next-line no-var
  var __beaconAdminPool: pg.Pool | undefined;
}

/**
 * Application pool. Connects as the NON-superuser `beacon_app` role so Postgres
 * RLS is enforced. All runtime queries MUST go through `withTenant`.
 */
export function appPool(): pg.Pool {
  if (!globalThis.__beaconAppPool) {
    globalThis.__beaconAppPool = new Pool({
      connectionString: env.databaseUrl,
      max: env.isTest ? 5 : 10,
    });
  }
  return globalThis.__beaconAppPool;
}

/**
 * Admin pool. Connects as a superuser/owner role that BYPASSES RLS. Allowed
 * ONLY for migrations, seeding, and the auth credential lookup. Do not import
 * this from feature code.
 */
export function adminPool(): pg.Pool {
  if (!globalThis.__beaconAdminPool) {
    globalThis.__beaconAdminPool = new Pool({
      connectionString: env.databaseAdminUrl,
      max: 5,
    });
  }
  return globalThis.__beaconAdminPool;
}

export async function closePools(): Promise<void> {
  await globalThis.__beaconAppPool?.end();
  await globalThis.__beaconAdminPool?.end();
  globalThis.__beaconAppPool = undefined;
  globalThis.__beaconAdminPool = undefined;
}

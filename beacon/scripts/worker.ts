import "./_bootstrap.js";
import { getAdapters } from "../src/lib/adapters/index.js";
import { processDueJobs, resetStaleJobs } from "../src/lib/queue/worker.js";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? "2000");

async function main(): Promise<void> {
  const adapters = getAdapters();
  await resetStaleJobs();
  console.log(`[worker] started (poll ${INTERVAL_MS}ms, providers via env)`);
  // Simple poll loop. In production this would be a hosted cron/queue worker.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const n = await processDueJobs(adapters, new Date());
      if (n > 0) console.log(`[worker] processed ${n} job(s)`);
    } catch (err) {
      console.error("[worker] batch error", err);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

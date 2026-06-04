import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Tenant-isolation tests mutate Postgres session state; run serially per file
    // and never share a worker across files to avoid leaking RLS settings.
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

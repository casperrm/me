import { defineConfig } from "vitest/config";

// Same pin as apps/web/vitest.config.ts — integration tests here (the
// health-score job) exercise real Postgres and must never run against
// the dev database. See that file's comment for the full rationale.
export default defineConfig({
  test: {
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/cedarpoint_test",
    },
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false,
  },
});

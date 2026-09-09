import { defineConfig } from "vitest/config";

// Same shape as packages/auth/vitest.config.ts: eval.integration.test.ts
// exercises runRoutingEval/getRecentEvalRuns against real Postgres (real
// AiEvalRun/AiEvalResult writes), so this package needs the same
// dedicated test database pin — never the dev database, and overridable
// via TEST_DATABASE_URL for CI/local setups that don't match the default
// local connection string.
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

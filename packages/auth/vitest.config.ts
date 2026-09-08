import { defineConfig } from "vitest/config";

// Same shape as apps/web/vitest.config.ts: authorize.integration.test.ts
// exercises requirePermission/requireAnyPermission against real Postgres
// (the MFA-gate check added here queries prisma.membership directly), so
// this package needs the same dedicated test database pin — never the
// dev database, and overridable via TEST_DATABASE_URL for CI/local setups
// that don't match the default local connection string.
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

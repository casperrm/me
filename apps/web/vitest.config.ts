import { defineConfig } from "vitest/config";

// Integration tests exercise the real service layer against Postgres.
// They must never run against the dev database (bootstrapOrganization's
// happy path alone requires an empty `organizations` table, which the
// seeded dev DB never has) — so this pins a dedicated test database
// regardless of what .env has set locally or in CI. Override with
// TEST_DATABASE_URL if the default local connection string doesn't fit
// your setup.
export default defineConfig({
  test: {
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/cedarpoint_test",
    },
    hookTimeout: 20000,
    testTimeout: 20000,
    // Integration test files share one Postgres database and each wipes
    // it in beforeAll — running files in parallel would let them race and
    // clobber each other's fixtures. Sequential is slower but correct;
    // revisit (e.g. one schema/database per file) if this suite grows
    // large enough for that to matter.
    fileParallelism: false,
  },
});

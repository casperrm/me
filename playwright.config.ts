import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Bible Section 32/35's "critical end-to-end flows," run against a real
// browser rather than curl. See tests/e2e/README.md for what's covered
// and why this runs against the seeded dev database (reset immediately
// before the suite by the same npm script that invokes this config).

// This repo's own dev sandbox has a pre-installed Chromium build at this
// fixed path (see the "Pre-installed browser" note in the environment
// docs) — using it there avoids a redundant download. A real CI runner
// (Section 31.2's "run smoke tests" gate — see .github/workflows/ci.yml)
// has no such path, so it falls through to `undefined`, letting
// Playwright launch its own managed browser (installed there via
// `npx playwright install --with-deps chromium`). Never hardcode this
// path unconditionally — it silently breaks E2E anywhere but this one
// sandbox.
const SANDBOX_CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const executablePath = existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // tests share one seeded database and must not race
  workers: 1, // fullyParallel:false only serializes within a file — force it across files too
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    // A production build, not `next dev` — dev mode's on-demand route
    // compilation plus Fast Refresh raced with client-side
    // router.push()/router.refresh() calls (LoginForm.tsx,
    // AcceptInviteForm.tsx) and produced flaky, non-deterministic
    // navigation failures. A prebuilt app has neither, matching how
    // every manual smoke test in this project's history has run.
    command: "npm run build --workspace=@cedar/web && npm run start --workspace=@cedar/web",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

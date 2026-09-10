# CI: E2E/smoke-test gate

Bible reference: Section 31.2 (CI/CD Gates) — "Build frontend/backend/
workers and run smoke tests."

## The gap

`.github/workflows/ci.yml` already covered lint, typecheck, migration
validation, unit+integration tests, an `apps/web` build, and a
dependency audit — but never ran the real browser-driven E2E suite in
`tests/e2e/` (8 spec files, `npm run test:e2e`), despite that suite
already existing and being the project's own "smoke test" layer (see
`tests/e2e/README.md`). It only ever ran locally, by hand.

A second, more fundamental problem sat underneath that: `playwright.config.ts`
hardcoded `launchOptions.executablePath` to
`/opt/pw-browsers/chromium` — this sandbox's own pre-installed Chromium
path. A real GitHub Actions runner has no such path. Simply adding a CI
step to run `npm run test:e2e` without fixing this first would have
failed immediately on every real CI run, for a reason that would have
looked like a browser/environment problem rather than the actual root
cause (a path hardcoded to one specific dev sandbox).

## What's built

- `playwright.config.ts`: `executablePath` is now conditional —
  `existsSync("/opt/pw-browsers/chromium")` selects the sandbox's
  pre-installed browser when present (this project's own dev sandbox,
  where installing a second browser would be wasteful and is explicitly
  disallowed), and falls through to `undefined` otherwise, letting
  Playwright launch whatever browser it manages itself.
- `.github/workflows/ci.yml`: after the existing `apps/web` build step,
  a new `npx playwright install --with-deps chromium` step (a real,
  managed download with the OS-level libraries headless Chromium needs
  on a bare Ubuntu runner — the `--with-deps` flag), then a new
  `npm run test:e2e` step. That script already does everything needed
  self-contained: resets the CI database
  (`cedarpoint_ci`, CI's equivalent of the local dev `cedarpoint`
  database) to a known seeded state, clears any stale Redis rate-limit
  buckets (`scripts/reset-rate-limits.ts` — see
  `docs/specs/rate-limiting.md`'s "E2E suite interaction" note for why
  that step exists at all), then Playwright's own `webServer` config
  builds and starts a real production `apps/web` and runs all 8 spec
  files against it.
- On failure, a new step uploads Playwright's `test-results/` (traces,
  screenshots) as a workflow artifact, so a CI failure is debuggable
  without needing to reproduce it locally from scratch.

## Testing / verification

- Confirmed the conditional `executablePath` logic branches correctly
  both ways (a quick standalone check: `existsSync` returns `true` for
  the real sandbox path, `false` for a path that doesn't exist).
- Ran the full local `npm run test:e2e` suite after the config change —
  all 8 spec files pass, proving the sandbox branch (the one this
  environment can actually exercise) is unaffected by the fix.
- The YAML itself was validated for syntax correctness
  (`python3 -c "import yaml; yaml.safe_load(...)"`).

**Honest limit on what could be verified here:** the actual "fresh
Playwright-managed Chromium install on a bare Ubuntu GitHub Actions
runner, no pre-installed browser" branch could not be executed end to
end from within this sandbox — there is no GitHub Actions runner access
here, and this sandbox's own `/opt/pw-browsers/chromium` always exists,
so the `undefined`-`executablePath` code path is exercised by inspection
and by the passing conditional-logic check above, not by a real run
against a browser Playwright downloaded itself. This mirrors every other
environment-gated item in this project (no `ANTHROPIC_API_KEY`, no OAuth
credentials, no staging infra) — the code is real and correct by
inspection, but the specific external environment needed to prove it
live isn't available here. This will get its first real proof the
moment this workflow runs on an actual push/PR against GitHub Actions.

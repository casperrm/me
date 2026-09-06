# tests/e2e

Critical end-to-end flows (Bible Section 32, 35), run against a real
browser (Playwright/Chromium) — not curl, not a mock DOM.

## What's here

- **`auth.spec.ts`** — login → protected page (CEO Dashboard) → logout,
  plus a direct check that an unauthenticated visit to a protected page
  redirects to `/login`.
- **`invite-and-accept.spec.ts`** — the fuller identity lifecycle: an
  owner sends a real invite through the `/team` UI, reads the invite
  link the app displays (no email provider is wired up yet — see
  `InviteForm.tsx` — so this is exactly what a real inviter would
  copy/paste), opens it in a brand-new browser context (no prior
  session, like a real invitee), accepts it, and lands in a real
  session. The test then asserts the CEO Dashboard's own `finance:read`
  permission check refuses the newly created `ACCOUNT_MANAGER` member —
  proving this is a genuine RBAC-scoped session for that exact member,
  not merely "some page loaded."

## Running it

```
npm run test:e2e
```

This resets the dev database to its seeded state first (`npm run
db:reset`), builds and starts a production instance of `apps/web`, runs
the suite against it, and tears the server down. Run it again anytime —
it's idempotent (each invite email is timestamp-unique, and the DB reset
guarantees a known starting point).

**Why a production build, not `next dev`:** the first version of this
suite ran against `next dev` and both login-dependent tests failed
non-deterministically — `next dev`'s on-demand route compilation and
Fast Refresh raced with the app's own client-side `router.push()`
immediately followed by `router.refresh()` (in `LoginForm.tsx` and
`AcceptInviteForm.tsx`), aborting the navigation's RSC data fetch and
leaving the browser on `/login` even though the login API call itself
had already succeeded. Switching the config's `webServer` to build +
`next start` — matching how every manual smoke test in this project's
history has actually been run — made both tests pass reliably. This
was a real, reproducible dev-server-only quirk, not a bug in the
shipped app; it's noted here rather than silently worked around,
in case a future dev-mode-driven test setup hits it again.

## What's still not covered

- Approval workflow (request → decide), Content Calendar status
  transitions, Client Portal access as an external contact, MFA
  enrollment/challenge — all have integration-test coverage
  (`apps/web/src/lib/services/*.integration.test.ts`) but no
  browser-driven E2E yet. Add here as the highest-value flows are
  identified, not as a blanket "cover everything" pass.
- API-contract tests for the route handlers themselves (auth headers,
  error envelopes, idempotency) — still genuinely missing, tracked in
  `ROADMAP.md`'s cross-cutting gaps.

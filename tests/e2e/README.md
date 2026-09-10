# tests/e2e

Critical end-to-end flows (Bible Section 32, 35), run against a real
browser (Playwright/Chromium) — not curl, not a mock DOM. Runs in CI
(`.github/workflows/ci.yml`) on every push/PR, not just locally by hand —
see `docs/specs/ci-e2e-gate.md`.

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
- **`approval-workflow.spec.ts`** — Bible Section 15.1's approval
  lifecycle: navigates to the seeded client's project/campaign, creates
  a new creative (starts at `DRAFT`), clicks "Request approval" (a
  fresh creative has no `Approval` row at all until this real
  transition happens), confirms the status badge itself updates to
  `PENDING_APPROVAL` (not just the button), then records a real
  "Approve" decision and confirms both the confirmation message and the
  status badge show `APPROVED`. Navigates by visible link text
  (client/project/campaign names from the seed), not hardcoded ids, so
  it survives a fresh `db:reset` generating new ids every run.
- **`client-portal.spec.ts`** — Bible Section 15.2: an owner invites a
  new `CLIENT_PORTAL` contact scoped to one client, the contact accepts
  and lands in a real session, then — the actual guarantee this test
  exists to prove — direct navigation to `/dashboard` and `/clients`
  afterward is refused every time, redirected back to `/portal`. This
  is a different guarantee than `auth.spec.ts`'s unauthenticated
  redirect: it's an authenticated session whose *role* restricts it,
  checked repeatedly rather than only at first login (Section 38).
- **`mfa.spec.ts`** — Bible Section 23.1: enrolls TOTP on the seeded
  owner through the real `/security` UI, computing a valid code with
  `otplib` against the secret the page itself displays (the same
  technique `mfa.integration.test.ts` uses at the service layer), then
  logs out and back in to prove the account is actually challenged for
  a code on its *next real login* — not just that the enrollment API
  call returned 200. Password alone is confirmed insufficient (still on
  `/login`) before the real second-factor code is submitted.
- **`content-calendar.spec.ts`** — Bible Section 9: creates a content
  item through the real UI (starts at `BRIEF`) and moves it through two
  real, server-validated transitions (`BRIEF → DRAFT → INTERNAL_REVIEW`),
  asserting the status badge itself updates each time.
  `ContentItemStatusForm.tsx`'s own comment notes the server
  re-validates every transition regardless of what the UI's dropdown
  offers — this test proves that real chain through the actual UI, not
  a mocked click handler.

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

Every flow originally named in this file's own gap list now has
browser E2E coverage. What's left is depth, not breadth — more
permutations of the flows above (e.g. a "changes requested" approval
decision, MFA recovery-code login, additional Content Calendar
transition branches) and any newly-built feature reaching the same bar
as it ships. Add here as the next highest-value gap is identified, not
as a blanket "cover everything" pass.

- API-contract tests (`apps/web/src/app/api/**/*.route.contract.test.ts`,
  see `docs/specs/api-route-contracts.md`) now cover every route handler
  in the app — this used to be partial, closed by a later slice.

# Roadmap

Canonical phase structure: `docs/CEDAR_POINT_OS_BIBLE.md` Section 36. This
file tracks progress against it and adds the concrete next steps within
each phase. Section numbers below refer to the Bible unless noted.

Per Section 0.1: before adding anything not implied by the current phase,
ask whether it saves time, improves quality, improves decision-making,
preserves Cedar Point's knowledge, or increases profitability — and check
`docs/adr/` for whether a related decision has already been deferred on
purpose.

## Phase 0 — Foundation: **mostly done**

Target deliverable (Section 36): secure owner login, invite-only
membership, role assignment, audit trail, health endpoints, staging
deployment.

- [x] Monorepo, environments config (`packages/config`), PostgreSQL +
      migrations (`packages/db`).
- [x] Authentication (session-based), organizations/memberships/
      invitations, RBAC (`packages/domain`, `packages/auth`).
- [x] Audit framework (`packages/events`, Section 23.2 schema).
- [x] Base UI system, owner dashboard, team/permissions screens
      (`apps/web`). A follow-up slice closed a real Section 28.2 gap
      ("meaningful empty/error states") this app never had: no
      `error.tsx` boundary anywhere, meaning an uncaught error from any
      Server Component render or server action crashed the *entire*
      page to Next.js's generic "Application error" screen — the exact
      failure mode two earlier slices had each hit and separately
      worked around at one specific call site (`docs/specs/
      projects-and-calendar.md`'s blocked-task bug; `docs/specs/mfa.md`'s
      explicitly-named "server actions don't catch
      AuthorizationError/MfaRequiredError" gap), without ever fixing the
      underlying absence of a boundary. New shared
      `apps/web/src/components/ErrorBoundaryContent.tsx` plus three
      `error.tsx` files — `(app)/error.tsx` (→ `/dashboard`),
      `portal/error.tsx` (→ `/portal`), and the root `apps/web/src/app/
      error.tsx` (→ `/login`, and — per Next.js's nesting rule that a
      segment's own `layout.tsx` sits outside that segment's
      `error.tsx` — the only boundary that can catch a failure inside
      `(app)/layout.tsx` or `portal/layout.tsx` themselves, both of
      which do real data fetching). Deliberately never renders
      `error.message` — Next.js already strips it for a server-thrown
      error before the boundary sees it, a security default worth
      keeping, not fighting. Explicit scope boundary in
      `docs/specs/error-boundaries.md`: no `global-error.tsx` (the true
      root layout only renders static shell markup, nothing in it can
      throw); server actions still don't do their own try/catch, so
      this is the *last* line of defense, not a replacement for
      preventing a predictable rejection at the call site (the pattern
      already used for the blocked-task bug); no error-tracking service
      wired up, only `console.error` with the real `digest`. Verified
      live against the real running server: reproduced a genuine
      uncaught server-action error on purpose — tampered with
      `TaskPriorityForm`'s hidden `taskId` input via the browser's own
      DOM (a real-world equivalent of a task deleted in another tab)
      and submitted, driving a real, uncaught `AuthError("Task not
      found.")` from inside `setTaskPriorityAction` — and confirmed the
      real app showed the new friendly boundary with a working "Try
      again" button, not Next's generic crash page.
- [x] Health endpoints (`apps/api` `/health` + `/ready`).
- [x] Queue/worker runtime (`apps/worker`) now carries a real job — the
      Section 30 overdue-escalation scan (hourly, `immediately: true` on
      restart), see `docs/specs/notifications.md`.
- [x] Object storage abstraction — `StorageAdapter` interface with a
      local-filesystem dev implementation, real checksums, signed
      time-limited download URLs, upload validation (type/size).
      Production S3-compatible backend still open — see ADR-005.
- [ ] **Staging deployment — not started.** `infra/` is empty; ADR-010
      needs a decision before this can happen. This is Phase 0's one
      concretely unmet deliverable.
- [x] MFA (Section 23.1) — TOTP enrollment/login-challenge/recovery codes,
      per-user opt-in from `/security`, plus two follow-up enforcement
      slices. First: `Organization.mfaRequiredForPrivilegedRoles` (off by
      default, toggled from a new "Security policy" card on `/team`,
      `organization:manage`-gated) makes MFA mandatory, not just
      offered, for OWNER/ADMIN members. The shared `(app)/layout.tsx`
      shell redirects any gated, unenrolled OWNER/ADMIN to `/security`
      on every other page (a new `middleware.ts` forwards the real
      request pathname so the layout can exempt `/security` itself
      without a route-group assumption); a banner there explains why.
      Second (this slice): closed that first slice's own explicitly-named
      remaining gap — the gate blocked page navigation only, not a direct
      API call made with an already-valid session. Moved
      `MFA_PRIVILEGED_ROLES` to its canonical home,
      `packages/domain/src/roles.ts` (previously duplicated in
      `mfa-policy-service.ts`), and added the real gate to
      `packages/auth/src/authorize.ts`'s `requirePermission`/
      `requireAnyPermission` — the actual authorization choke point every
      mutating server action/API route already calls — via a new
      `MfaRequiredError`, thrown only *after* the permission check itself
      passes (so an actor who isn't authorized at all still gets a plain
      `AuthorizationError`, never leaking MFA-gating status to someone
      who was never going to be allowed the action regardless).
      Deliberately not added to `isAuthorized`/`isAuthorizedAny` — those
      are documented read-branching helpers for UI conditionals that
      return a boolean rather than throw, not the security boundary.
      Mapped to HTTP 403 with a consistent message in all 38 API route
      files that already catch `AuthorizationError`, following this
      codebase's established per-file convention rather than introducing
      a shared error-mapping abstraction. See `docs/specs/mfa.md` for
      full design rationale, what's still open (WebAuthn/security-key, a
      per-role-configurable policy — both unchanged from the first
      slice), and one explicit gap this slice did not fix:
      `apps/web/src/lib/actions/*.ts` server actions still don't catch
      `AuthorizationError`/`MfaRequiredError` at all, so an uncaught
      `MfaRequiredError` from one propagates the same way an uncaught
      `AuthorizationError` already did — pre-existing, out of scope here.
      New coverage: `packages/auth/src/authorize.integration.test.ts` (9
      tests, real Postgres, new `packages/auth/vitest.config.ts` since
      this package had no integration-test database wiring before);
      3 existing route-contract files extended with real HTTP-level 403
      coverage (expenses +2, team/invite +2, milestone toggle +1); 2
      pre-existing test files' fixtures fixed for a real, correct
      behavior change the gate surfaces (an unenrolled OWNER/ADMIN can no
      longer turn the org's own MFA policy back off via the API until
      they enroll — not a lockout of the organization, since any other
      enrolled privileged member, or the same member after enrolling,
      still can). Full suite: 526 tests across 6 workspaces, all passing.
      Verified live against the real running server and dev database
      with real HTTP only (not a browser — this gap was specifically
      about bypassing the UI): logged in as the seeded owner, confirmed
      baseline 200 on a direct `POST /api/expenses`, turned the org's MFA
      policy on via the real API, confirmed via `psql`, then — with the
      *same* still-valid session cookie and no page ever visited — issued
      the identical direct mutation and got a real 403 with the
      MFA-required message; completed real enrollment through the
      running app (`otplib`-computed TOTP code against the real returned
      secret), repeated the mutation, got a real 200. Restored state
      through real flows in the correct order (learned live: disabling
      MFA before turning the policy off leaves the account unable to turn
      its own policy off, so cleanup re-enrolled, toggled the policy off
      first, then disabled MFA), cross-checked via `psql`: policy back to
      `false`, user back to unenrolled with no stored secret or recovery
      codes, `expenses` row count back to its exact pre-test value with
      the two smoke-test rows and their audit events deleted, and 7
      legitimate new audit events (a real login plus the real MFA/policy
      lifecycle) left in place as genuine history, matching the first
      slice's own precedent. Confirmed no server process left running
      afterward.
- [x] Rate limiting (Section 23.1) — a real gap, closed for two of the
      four named categories. New `packages/auth/src/rate-limit.ts`:
      `checkRateLimit(bucketKey, limit, windowSeconds)`, a Redis-backed
      fixed-window counter (atomic `INCR`+`EXPIRE` via a Lua script, so a
      process crash mid-check can't leave a bucket with no TTL). This is
      `apps/web`'s first direct Redis connection — previously only
      `apps/worker`'s BullMQ queues used `REDIS_URL`, which was already
      required config but otherwise unconsumed outside the worker.
      Applied to `POST /api/auth/login` (10 attempts/15 min per IP —
      brute-force/credential-stuffing protection) and
      `POST /api/integrations/webhooks/[id]` (120 requests/min per
      connection — the one endpoint in the app with no session auth at
      all, the clearest match for the "webhooks" category). Both return
      429 with a `Retry-After` header. AI endpoints and client-portal
      endpoints — the other two Section 23.1 categories — deliberately
      not covered: Cedar Brain already has a more targeted control (AI
      budget governance, spend-based not request-based) and portal
      endpoints are session-authenticated like the rest of the app, so
      they don't share the login/webhook endpoints' defining
      no-prior-authentication property. See `docs/specs/rate-limiting.md`
      for the full scope boundary, including the honest gap that
      `X-Forwarded-For` trust depends on the eventual hosting platform
      (ADR-010, still unresolved). New
      `packages/auth/src/rate-limit.integration.test.ts` (4 tests, real
      Redis); extended both routes' `route.contract.test.ts` files with a
      dedicated 429 test each and gave the login test's four pre-existing
      cases distinct fake IPs so they don't share a rate-limit bucket.
      Full suite: 643 tests across 7 workspaces, all passing; monorepo
      typecheck, lint, and production build all clean. Live-verified
      against a real running production build and real Redis: 11 real
      `POST`s to `/api/auth/login` from a fake IP (10 allowed, 11th real
      429 with a real `Retry-After`); a real webhook connection created
      through the authenticated API, then 121 real signed `POST`s to its
      webhook URL (120 allowed, 121st real 429). All rate-limit keys, the
      smoke-test connection, and its audit/connection-event rows deleted
      afterward; confirmed no server process left running.
- [x] Session/device management (Section 23.1) — "secure session
      lifecycle, and device/session revocation" was schema-ready
      (`Session.revokedAt`/`ipAddress`/`userAgent`, and
      `packages/auth`'s `revokeSession`/`revokeAllSessionsForUser`) but
      not reachable by a user: `revokeSession` was only ever called from
      `logout()`, and `revokeAllSessionsForUser` had zero callers
      anywhere. New `listMySessions`/`revokeMySession`/
      `revokeAllOtherSessions` in `apps/web/src/lib/services/auth-service.ts`
      — the ownership check inside `revokeMySession` (refusing to revoke a
      session that isn't the caller's own, 404 not silently ignored) is
      the one real security boundary in this slice, not just a
      convenience feature. `revokeAllOtherSessions` is a distinct
      function from `revokeAllSessionsForUser`, deliberately excluding
      the caller's own current session so the self-service "log out other
      devices" action can't sign the user out of the device performing
      it. Three new API routes under `/api/security/sessions/**`
      (self-scoped account-security actions, same no-`requirePermission`
      shape as the existing MFA setup/disable routes) and a new "Active
      sessions" card on `/security` (`ActiveSessions.tsx`) showing
      device/IP/sign-in-time with a per-session "Sign out" and a
      "Sign out all N other device(s)" bulk action. New coverage: 4 tests
      in `identity.integration.test.ts`, 7 in a new
      `sessions.route.contract.test.ts`. Full suite: 656 tests across 7
      workspaces; typecheck/lint/build clean. Live-verified against a
      real running production build with three simultaneous real browser
      logins (Playwright/Chromium): confirmed the "this device" label,
      confirmed a single "Sign out" click really logged out exactly one
      of the two other real sessions (its next navigation redirected to
      `/login`), confirmed "Sign out all other devices" then logged out
      the last one, confirmed the device performing the actions stayed
      signed in throughout. The live test also surfaced a real, honest
      finding: this dev database's seeded account has accumulated
      roughly 90 active sessions from this project's own extensive
      smoke-testing history, rendered with no pagination — documented in
      `docs/specs/session-management.md` as a known, deliberately
      unaddressed gap (a real user's session count stays naturally small;
      building pagination for a dev-sandbox artifact would be solving the
      wrong problem).
- [x] Worker job retries + dead-letter handling (Section 18.2) — every
      scheduled `apps/worker` job (escalations, health scores, AI eval)
      had zero retry configuration (BullMQ's default is one attempt),
      and a failure only ever reached `logger.error`, with nothing
      persisted once BullMQ's own `removeOnFail: 10` cap rolled the
      record off. Added `attempts: 3` + exponential backoff to each
      scheduled job; new `WorkerJobFailure` model (deployment-wide, not
      tenant data — same precedent as `AiEvalRun`) persisted only once
      every retry attempt is exhausted, via new
      `apps/worker/src/dead-letter.ts` (`isFinalAttempt`/
      `recordJobFailureIfFinal`) — extracted out of `index.ts`
      specifically so this logic has direct test coverage, since
      `index.ts` self-executes `main()` on import and can't be tested by
      importing it directly. New "Background job health" card on
      `/command/supervisor` (same `ai:supervise` gate as the rest of
      that page — reused rather than inventing a new permission for a
      deployment-wide operational signal this app has no other surface
      for). New coverage:
      `apps/worker/src/dead-letter.integration.test.ts` (2 tests against
      a real, throwaway BullMQ queue/worker on real Redis — a job that
      fails once then succeeds never gets a dead-letter row; a job that
      exhausts every attempt gets exactly one, with the real error and
      attempt count); 2 new tests in
      `ai-supervisor.integration.test.ts` for the listing function. Full
      suite: 664 tests across 7 workspaces, all passing; monorepo
      typecheck/lint/build clean. Live-verified: started the real
      `apps/worker` process and confirmed clean startup with the new
      retry options (no regression across all four jobs); inserted one
      representative dead-letter row via `psql` and confirmed via a real
      headless-Chromium screenshot that the new card renders the real
      queue/job name, attempt count, and error message. Explicitly not
      built: alerting/paging on a dead-letter row (no outbound
      notification channel exists for deployment-wide, non-tenant
      signals), a retry/replay UI, and per-job partial-progress resume
      (each retry re-runs the whole idempotent scan from scratch, which
      is correct for these particular jobs, not a gap). See
      `docs/specs/worker-job-reliability.md`.
- [x] Command Palette keyboard/semantic accessibility (Section 39:
      "Keyboard and semantic accessibility are part of definition of
      done for core UI") — never referenced anywhere in this project
      before this slice (confirmed by grepping ROADMAP.md for
      "accessib"/"aria"/"keyboard"). Deliberately scoped to one
      representative component rather than an app-wide audit: the
      Command Palette (Cmd/Ctrl+K), the app's single most keyboard-
      driven interaction. Real gaps found and fixed: no dialog ARIA
      semantics (`role="dialog"`/`aria-modal`/`aria-label`), no
      combobox/listbox pattern linking the input to results
      (`role="combobox"`, `aria-expanded`/`aria-controls`/
      `aria-activedescendant` on the input; `role="listbox"`/
      `role="option"`/`aria-selected` on results), no focus trap (Tab
      could escape into the page behind the still-open overlay), and no
      focus restoration to the trigger button on close. New
      `tests/e2e/command-palette-accessibility.spec.ts` — one real
      Playwright/Chromium test driven entirely by keyboard (no mouse),
      asserting on actual ARIA roles and focus state via `getByRole`/
      `toBeFocused()`, which only pass if the semantics are genuinely
      correct. **A real regression this slice caused and fixed along the
      way:** the test's first version logged in fresh per test case via
      `beforeEach` (4 logins), breaking this repo's established
      one-login-per-file E2E convention; combined with every other spec
      file's own login, one full `npm run test:e2e` run performed enough
      real logins from the same IP to trip the real login rate limiter
      built earlier this session (10 attempts/15 min —
      `docs/specs/rate-limiting.md`), causing a real 429 that broke the
      previously-passing, unrelated `mfa.spec.ts`. Fixed by consolidating
      to one login (matching the established convention) AND hardening
      the E2E pipeline itself: new `scripts/reset-rate-limits.ts`
      (`packages/auth`'s new `resetAllRateLimitsForTests()`) now runs in
      `npm run test:e2e` alongside the existing `db:reset`, so this class
      of bug can't silently reappear as the E2E suite keeps growing. 1
      new test for the reset function in
      `rate-limit.integration.test.ts`. Full suite: 665 tests across 7
      workspaces, all passing; full `npm run test:e2e` run (production
      build, all 8 spec files) passes end to end including the
      previously-broken `mfa.spec.ts`. Explicitly not built: an app-wide
      accessibility audit, an automated axe-core/lint gate in CI, or a
      color-contrast/screen-reader-output review — see
      `docs/specs/command-palette-accessibility.md` for the full scope
      boundary.
- [x] `updatedAt` on collaboratively-edited records (Section 27.1:
      "created_at, updated_at... where meaningful"). A survey of all 46
      models in `packages/db/prisma/schema.prisma` found only 10 had
      `updatedAt` at all. Added it to the 3 that are genuinely mutated in
      place by multiple team members with previously no way to know
      when: `Task` (status/priority/assignee/due date), `Creative`
      (approval-lifecycle status transitions), `Meeting` (notes edited
      in place). Deliberately did NOT add it to the other 33 —
      append-only audit/telemetry rows, version-history records (a new
      row is created rather than an old one edited), and short-lived
      security artifacts that already track their own specific
      lifecycle transitions explicitly are all correctly immutable-or-
      already-tracked, not gaps; genuinely-immutable-once-created
      records with no edit feature (`TaskComment`, `Note`, `Expense`)
      were deliberately skipped too, to avoid repeating a real mistake
      caught while scoping this slice: `Invoice.currency` is a field
      that's set once and never read anywhere in the app (confirmed via
      grep) — a write-only column nobody benefits from. Surfaced in the
      UI so this field is provably real: "Last updated" text on the
      Creative and Meeting detail pages, a `title` tooltip on task rows
      (chosen to avoid cluttering an already-dense list). Migration
      backfills existing rows to migration time (their real prior update
      time isn't recoverable) via a temporary DB default, immediately
      dropped in a follow-up migration to match Prisma's own
      `@updatedAt` semantics. New coverage: one test each in
      `project-and-calendar.integration.test.ts`,
      `creative-service.integration.test.ts`, and
      `meeting-service.integration.test.ts`, each capturing the
      post-creation timestamp and asserting a real mutation bumps it.
      Full suite: 667 tests across 7 workspaces, all passing.
      Live-verified against a real running production build: changed a
      real task's status through the actual UI dropdown, confirmed via
      `psql` that both `status` and `updatedAt` changed, confirmed via a
      real headless-Chromium check that the task row's tooltip reflected
      the new, real timestamp. All smoke-test rows cleaned up. See
      `docs/specs/data-model-timestamps.md`.
- [x] E2E/smoke-test CI gate (Section 31.2: "Build frontend/backend/
      workers and run smoke tests"). The real browser-driven E2E suite
      (`tests/e2e/`, 8 spec files) already existed but only ever ran
      locally by hand — CI covered lint/typecheck/migrations/unit+
      integration tests/build/dependency-audit but never it. Fixed a
      real blocker underneath first: `playwright.config.ts` hardcoded
      its browser's `executablePath` to this dev sandbox's own
      pre-installed Chromium path (`/opt/pw-browsers/chromium`) — a
      path that doesn't exist on a real GitHub Actions runner, so simply
      adding a CI step to run the suite would have failed immediately
      for a reason that would have looked like an environment problem
      rather than the actual root cause. Made it conditional
      (`existsSync` selects the sandbox path when present, `undefined`
      otherwise, letting Playwright launch its own managed browser).
      `.github/workflows/ci.yml` gained `npx playwright install
      --with-deps chromium` plus `npm run test:e2e` after the existing
      build step, and a trace/screenshot artifact upload on failure.
      Verified: the conditional path-selection logic checked directly
      (`existsSync` returns `true`/`false` correctly for the real vs. a
      nonexistent path); the full local E2E suite re-run after the
      config change — all 8 specs still pass, proving the sandbox branch
      is unaffected. Honest limit stated in
      `docs/specs/ci-e2e-gate.md`: the actual "fresh Playwright-managed
      install on a bare Ubuntu runner" branch couldn't be executed end
      to end from within this sandbox (no GitHub Actions runner access
      here) — same category of environment-gated verification as every
      `ANTHROPIC_API_KEY`/OAuth-blocked item in this project; it gets
      its first real proof on this workflow's next actual CI run.
- [x] Correlation IDs for worker job logs (Section 31.3: "structured
      logs with correlation/request/workflow/agent IDs"). ADR-010
      already described a `correlationId` field as "available on every
      call site," but grepping for real usage across `apps/*` before
      starting this slice found zero — a typed hook, not a working
      mechanism, structurally identical to the `Invoice.currency`
      dead-field pattern caught earlier this session. New
      `packages/observability/src/correlation.ts` uses Node's built-in
      `AsyncLocalStorage` (`runWithCorrelationId`/`getCorrelationId`,
      no new dependency) to thread an ID through an async call chain
      several layers deep without touching every function signature in
      between; `logger.ts` now auto-merges the ambient ID into every
      log line unless a call site passes its own explicit one.
      `apps/worker/src/index.ts` wraps its three real scheduled job
      handlers (escalations, health scores, AI eval) in
      `runWithCorrelationId(job.id, ...)`, reusing BullMQ's own
      per-execution `job.id` rather than minting a separate UUID — the
      same value the "job failed" log line and `WorkerJobFailure`
      dead-letter rows already reference. The shared
      `worker.on("failed", ...)` handler re-establishes the same
      correlation id explicitly, since BullMQ fires it as a separate
      event-listener invocation that doesn't inherit the handler's own
      async context. `heartbeat` deliberately left unwrapped — a
      trivial one-line debug tick, not a multi-step workflow worth
      tracing. Explicitly deferred: per-HTTP-request correlation IDs
      across `apps/web`'s ~61 API routes (a much larger, separate
      change — Next.js middleware can't establish `AsyncLocalStorage`
      context on a route handler's behalf, since they run as separate
      function invocations) and distributed tracing (needs a real
      tracing backend, out of scope for the same reason ADR-010 gives
      for not adopting a full logging framework yet). New
      `packages/observability/src/correlation.test.ts` — this
      package's first-ever test file, 8 tests covering absence outside
      context, scoped availability, nested-async propagation, no
      cross-contamination between concurrent runs, and logger
      auto-tagging (omit/include/override). Live-verified against a
      real running `apps/worker` process: log output confirmed a
      nested call (`runAiEvalJob`) and its wrapper shared one real
      correlation ID, and different job types running in the same
      process got different, non-overlapping IDs; all incidental rows
      cleaned up afterward. See `docs/specs/worker-log-correlation.md`.
- [x] Inline errors for reachable server-action failures, instead of a
      full-page crash (Section 28.2). `docs/specs/error-boundaries.md`
      named "retrofit every action to return a structured `{ error }`
      result" as an explicit, unbuilt follow-up. Rather than converting
      all three of this repo's `"use server"` action files speculatively,
      audited each action's real failure paths against what the UI
      already prevents and found exactly two reachable, non-hypothetical
      cases: `setTaskStatusAction`'s blocked-completion race (the "done"
      option is only disabled using blocker data as of the page's last
      render — a blocker added after that is a real two-tab/two-person
      race, not contrived), and `changeRoleAction`/
      `revokeMembershipAction` when an ADMIN targets a non-last OWNER
      (the Team page only hides these forms for the *last remaining*
      OWNER, not for "any OWNER when the actor isn't one" — policy.ts's
      `canManageMembership` forbids exactly that combination). The other
      three actions (`setTaskPriorityAction`, `setTaskEstimateAction`,
      `grantClientScopeAction`) were checked and left unconverted — no
      comparable reachable failure exists for them, and wrapping them
      anyway would mean building a display path that can never fire
      (the same over-completeness this project has caught and rejected
      elsewhere, e.g. `Invoice.currency`). Since this repo's `react-dom`
      is pinned to 18.3.1 (no `useFormState`/`useActionState`, both
      React 19 APIs), the fix calls the action directly from an
      `onSubmit` handler instead of the `<form action={...}>` prop —
      identical server-action semantics, just invoked from client code
      the same way the rest of the app's mutations already are. New
      `MemberRowActions.tsx` client component extracted from the Team
      page's inline forms to carry this state; `TaskStatusForm.tsx`'s
      select is now controlled so a rejected change visibly reverts
      instead of showing a change that didn't happen. New
      `apps/web/src/lib/actions/{task,membership}.test.ts` (4 tests
      against real Postgres). Live-verified against a real running
      production build with a real headless-browser session: reproduced
      both real failure scenarios (adding the task's blocking dependency
      *after* page render, to exercise the server check the same way a
      genuine race would, since the pre-existing disabled option
      correctly blocks the render-time case), confirmed the real inline
      error text rendered with no "Something went wrong" full-page
      crash and the rest of the page intact, and confirmed via direct
      query that the rejected mutation left no partial write. All
      fixture rows cleaned up afterward. See
      `docs/specs/inline-action-errors.md`.
- [x] Real optimistic concurrency for Membership updates (Section 27.1:
      "version/concurrency field on collaboratively edited records").
      `Membership.version` has existed since the original schema with a
      comment invoking this exact rule, and `changeMemberRole`/
      `revokeMembership` have always incremented it on every write — but
      nothing ever compared it before writing, so it couldn't actually
      catch a lost update. Two admins acting on the same membership from
      stale `/team` page loads (one revoking while the other changes its
      role, say) would silently clobber each other with no warning to
      either. Different from the `Invoice.currency`/`Asset.version`
      write-only-field pattern this project has caught before: the
      Bible explicitly names this exact mechanism as required and the
      field's own comment states its intent, so the fix was finishing
      the half-built mechanism, not rejecting a speculative one.
      `changeMemberRole`/`revokeMembership` now take `expectedVersion`
      and use `prisma.membership.updateMany({ where: { id, version:
      expectedVersion }, ... })` — the version check happens inside the
      same write, not as a separate read-then-compare step that would
      leave its own race window. Zero rows matched throws an `AuthError`
      ("changed by someone else since the page loaded"), which the
      previous slice's inline-error plumbing already displays with no
      new UI mechanism needed; the action layer now also revalidates on
      any `AuthError`, not just success, so a rejected request's stale
      view gets refreshed. New `MemberRowActions.tsx` `version` prop +
      hidden `expectedVersion` input on both affected forms. 2 new
      integration tests (against real Postgres): the actual lost-update
      scenario (first write succeeds at version 2, second write with
      the same stale `expectedVersion: 1` is rejected, final row shows
      only the first write applied) and a malformed-`expectedVersion`
      guard. Live-verified with two real browser sessions racing the
      same membership on a running production build: confirmed the
      real inline conflict error, no full-page crash, and via direct
      query that only the first tab's write landed. `Asset.version`
      (a different, unrelated field found during this investigation)
      is confirmed genuinely dead code — never read or written anywhere
      — and deliberately left alone rather than inventing a use for it.
      See `docs/specs/membership-optimistic-concurrency.md`.
- [x] Populate `AuditEvent.approvalId` on the approval workflow
      (Section 23.2/27.1). Found via the same discovery method as the
      two slices above: `approvalId` existed with a comment "reserved
      for when the Approval model lands (Phase 2)" — the Approval model
      landed long ago, but none of this codebase's 74 `emitAuditEvent`
      call sites ever populated it. `Approval` is itself an append-only
      log (every `requestApproval`/`recordApprovalDecision` call creates
      a new row, never updates one in place), so a `CreativeVersion`
      that goes through multiple approval rounds produces several
      `AuditEvent` rows sharing the exact same `resourceId` — without
      `approvalId`, there was no way to tell which event documents which
      specific `Approval` row short of timestamp-order guessing.
      `requestApproval`/`recordApprovalDecision`
      (`creative-service.ts`) already hold the just-created `approval`
      row at the point they call `emitAuditEvent`; both now pass
      `approvalId: approval.id` — no new query, using data already in
      scope. `resourceType`/`resourceId` unchanged, so this is additive:
      the old "every approval event on this version" query still works,
      and "the exact Approval row this one event is about" now also
      does. `AuditEvent.correlationId` (a separate, unrelated field,
      also always null today) deliberately left alone — populating it
      needs the same per-HTTP-request correlation context
      `docs/specs/worker-log-correlation.md` already named as a larger,
      deferred follow-up; wiring it only for approval events would be an
      inconsistent half-measure. New integration test drives a
      CreativeVersion through two full approval rounds without a new
      version in between (four Approval rows, all sharing one
      resourceId), confirms each resulting AuditEvent's approvalId
      resolves to the exact matching Approval row by decision, and that
      the old resourceId-based query still returns all four. Live-
      verified via a real HTTP call to the real decide route on a
      running production build, followed by a direct Postgres query
      confirming a real approvalId resolved to a real Approval row with
      matching decision/creativeVersionId; the mutation and its
      ClientTimelineEvent were reverted afterward. See
      `docs/specs/audit-event-approval-linkage.md`.
- [x] Workflow Automation Engine v1 (Section 18/18.2) — `packages/automation`
      had been a placeholder ("Not implemented yet") since Phase 0. New
      `runWorkflow()`: a `WorkflowDefinition` (named steps) run in order
      against a real `WorkflowRun` row per invocation (status, per-step
      history, correlation ID — picked up automatically from the
      existing ambient correlation context, Section 31.3). `apps/worker`'s
      escalation scan migrated onto it as the first real consumer (one
      step per category), which surfaced and fixed a genuine bug in the
      process: the job previously ran its four categories through a bare
      `Promise.all`, so one category throwing silently aborted the other
      three, unrelated categories for that entire run. Steps are now
      isolated — a broken category is recorded in that run's step
      history without blocking the healthy ones. New "Automation runs"
      card on `/command/supervisor`, same pattern as the existing
      "Background job health" card. Explicitly not built: a generic
      trigger registry (schedule is still the only trigger source — a
      second one would need to exist before generalizing), a
      rule-authoring UI, step-level retries, and pause/cancel/replay —
      all named directly in Section 18.2 but requiring either a second
      real consumer or a durable resumption model this first cut
      doesn't have. New `packages/automation/src/workflow.integration.test.ts`
      (this package's first-ever test file, 4 tests) plus 2 new/extended
      tests in `escalations.integration.test.ts`, including a dedicated
      regression test simulating a real single-category failure and
      proving the other categories still ran and notified. Live-verified
      against a real running `apps/worker` process (a real `WorkflowRun`
      row with a correlation ID matching the job's own log lines) and a
      real headless-browser session confirming the Supervisor card
      renders it correctly. See `docs/specs/automation-engine.md`.
- [x] Knowledge Graph v1: Client -> Meeting -> Decision structured
      retrieval (Section 19/19.1). `context-retrieval-service.ts`'s
      `buildGovernedContext` already did Section 19.1's "structured
      queries first for canonical facts" for Brand DNA/health score/
      timeline, and its own doc comment already cited Section 6.6's
      "decisions" as in scope — but never once queried `Meeting
      .decisions`, even though every piece it needed (the `Meeting`
      model, its `decisions` JSON column, `Client.meetings`) already
      existed from the Meetings module. Now pulls the 3 most recent
      meetings for the client and adds a line per real decision found
      (never a placeholder for a meeting with none), with a real,
      countable `sources` entry — Section 19.1's "retain source/resource
      references for traceability." Explicitly not built: a graph
      database, semantic/vector retrieval (still deferred per ADR-008 —
      no embedding infra, no live model calls to use one against even if
      it existed), graph expansion beyond this one hop, or any
      promotion/curation machinery (19.2) — this is one bounded
      relational hop through data that already existed, not the query
      layer. `context-retrieval.integration.test.ts` extended to 10
      tests (from 9): the main test now asserts real decision content
      and its source count; a new dedicated test confirms a meeting with
      no decisions contributes nothing. Live-verified via a real HTTP
      call to `POST /api/cedar-brain` on a running production build,
      confirming the real decision surfaced in the response's
      `contextSources`; row cleanup confirmed the dev database was back
      to its seeded baseline. See
      `docs/specs/knowledge-graph-meeting-decisions.md`.
- [x] Cedar Decision Engine v1: Client Renewal Recommendation (Section 20).
      Section 20's own worked example names "Client renewal" with exactly
      this evidence list: profitability, health score, delivery history,
      payment behavior, opportunity — every one of which was already a
      real, independently computed signal elsewhere in this app (Client
      Health Score, `getClientProfitability`, `getOpportunitiesForClient`,
      the same overdue task/invoice queries `escalations.ts` already
      uses); nothing had combined them into one go/no-go call before this
      slice. New `getClientRenewalRecommendation()` returns
      `{ recommendation: "renew" | "at_risk" | "do_not_renew", evidence,
      risks, assumptions, requiresApproval: true }` — deterministic, no
      model call, same "decision support, not autonomous truth" stance as
      Client Health Score and the AI Business Advisor. `requiresApproval`
      is structural, not a label: no write path anywhere acts on the
      recommendation. Caught and fixed a real bug during testing:
      `getClientProfitability` returns a zeroed entry for every client in
      the org rather than `null` for one with no financial history, which
      would have produced a misleading "$0.00" line for a brand-new
      client — the service now explicitly checks for all-zero revenue and
      cost before treating profitability as real data. New "Renewal
      recommendation" card on the Client 360 page, above Opportunities.
      Explicitly not built: "alternatives" and "expected impact" fields
      Section 20 names — no real alternatives-generation or
      impact-modeling capability exists yet to draw from, and fabricating
      either would violate this project's own no-invented-data rule; and
      every other decision type Section 20's pattern implies (budget
      reallocation, hiring, etc.) — each would need its own real evidence
      inputs that don't exist in this codebase yet. New
      `decision-engine.integration.test.ts` (5 tests) against real
      Postgres. Live-verified against a real running production build and
      real seeded client data (Volt Mobile: health score 82, one overdue
      $2,500 invoice) via a real headless-browser login and page load —
      confirmed the correct "At risk" badge and real evidence/risk lines
      rendered, screenshot-verified. See
      `docs/specs/cedar-decision-engine.md`.
- [x] Cedar Innovation Lab v1: telemetry-driven improvement backlog
      (Section 21 / 6.4, and Section 20's "System improvement" decision
      type). Every signal Section 21/6.4 ask a system-level advisory layer
      to monitor — usage telemetry, error rate, agent evaluation, user
      friction — already existed as real recorded data (AI Supervisor
      telemetry, the AI Eval Harness, WorkerJobFailure) and was already
      individually visible as separate cards on `/command/supervisor`;
      nothing combined them into the prioritized backlog Section 21 names.
      New `getInnovationBacklog()` turns four real thresholds (Cedar Brain
      success rate, the latest eval run's regressions, the
      flagged-incorrect rate, and a job failing repeatedly within a 7-day
      window) into severity-ranked `{ title, affectedModule, severity,
      evidence }` items, empty when nothing is concerning. Explicitly not
      built: Section 21's `impact`/`effort`/`dependencies`/`suggested
      experiment` fields — no real data source exists for any of those,
      so none are fabricated, same discipline as the Decision Engine's own
      omitted "alternatives"/"expected impact." No self-deployment is
      structural: no write path exists from a backlog item to any change.
      New "Improvement backlog" card on `/command/supervisor`, placed
      first as the actionable summary above the raw telemetry cards it
      reads. New `innovation-lab.integration.test.ts` (7 tests) against
      real Postgres. Live-verified against a real running production
      build: confirmed the honest empty state first against the real dev
      database's zero telemetry rows, then inserted realistic fixture
      telemetry directly via Postgres and confirmed the correct
      high/medium-severity items rendered with real evidence,
      screenshot-verified; fixture rows deleted and counts confirmed back
      to zero afterward. See `docs/specs/cedar-innovation-lab.md`.
- [x] Cedar Experience Engine v1: frequently selected templates (Section
      22). Of Section 22's four named examples ("commonly used views,
      recurring command patterns, preferred approval routes, and
      frequently selected templates"), only the last already had a real
      data source: `createProjectFromTemplate` has recorded `templateId`
      on a real `AuditEvent` for every instantiation since project
      templates were built — nothing new to instrument. New
      `getTemplateUsageCounts()` reads that existing history into a
      per-template usage count. Wired into two real touchpoints — the
      `/templates` management page (sorted most-used-first, "used N
      times" shown) and the Client 360 "+ From template" picker (sorted
      the same way, usage shown in each option label) — a real "adapt
      shortcuts without hiding functionality": every template still
      appears everywhere, only order and an informational label changed.
      The other three examples remain unbuilt — no page-view, command-
      invocation, or generic approval-route log exists anywhere in this
      system to build a real signal from, and this project's own rules
      forbid inventing one. Explicitly not a per-user preference profile
      (only org-wide usage is tracked, stated as such) and explicitly
      nothing to "reset or override" (recomputed fresh from audit history
      on every read, never cached/learned state). 3 new tests in
      `project-template-service.integration.test.ts` (27 total in that
      file) against real Postgres. Live-verified entirely through the
      real UI on a running production build — real "Save as template" and
      real template-picker instantiation, not direct DB writes — then
      confirmed the sorted order and counts rendered correctly on both
      surfaces, screenshot-verified; every fixture row was deleted
      afterward and counts confirmed back to baseline. See
      `docs/specs/cedar-experience-engine.md`.
- [x] Cedar Knowledge Promotion v1: meeting decision -> Agency Memory
      (Section 19.2 / 6.6 / 13). Section 19.2: "Raw AI output is not
      automatically institutional knowledge. Promotion requires an
      approved outcome, explicit curation, a verified external source, or
      a defined system rule." Section 13's own text names the first real
      trigger: "Approved meeting decisions... can be promoted into
      memory." Meeting decisions (already built) had no promotion path —
      this is that path. New `AgencyMemoryEntry` model (migration
      `20260910124021_agency_memory_entries`) and
      `promoteMeetingDecisionToMemory()`, triggered only by a person
      clicking "Promote to Agency Memory" on a real meeting decision,
      never automatically — mirrors the existing
      `promoteFollowUpToTask()` "promote" pattern and its
      already-promoted guard. Maps Section 19.2's five required fields to
      real data only: provenance (source meeting + decision + promoter),
      freshness (promotedAt), and scope (clientId, nullable) are all real;
      "confidence" is deliberately not a fabricated numeric score — every
      row's existence, by construction, already is the real confidence
      signal, since explicit curation is the only path that creates one;
      "supersession links" are the one field NOT built — no real trigger
      exists yet to set one, and an always-null column would be exactly
      the unused scaffolding this project's own discipline forbids (see
      the earlier `Asset.version` rejection). New `/memory` page
      (org-wide `clients:write` gate, matching `/templates`) lists every
      promoted entry with its client, promoter, and a link back to the
      source meeting. New "Promote to Agency Memory" button on each
      meeting decision. New `agency-memory.integration.test.ts` (6 tests)
      and a route-contract test for the new promote endpoint (5 tests)
      against real Postgres. ADR-008 updated: promoted entries are not
      yet wired into Cedar Brain's own retrieval (`buildGovernedContext`)
      — this slice is promotion machinery, not retrieval; that wiring
      remains future work. Live-verified entirely through the real UI on
      a running production build — real meeting creation, real decision,
      real promote click — then confirmed the entry rendered correctly on
      `/memory` with the right client and promoter names, screenshot-
      verified; every fixture row was deleted afterward and counts
      confirmed back to baseline. See `docs/specs/agency-memory.md`.
- [x] Wired Agency Memory into Cedar Brain's own governed context
      retrieval (Section 19.2 follow-up). The Knowledge Promotion slice
      above explicitly left this open — `AgencyMemoryEntry` rows existed
      but Cedar Brain never read them back. `buildGovernedContext` now
      also queries the 5 most recent entries **org-wide** (not scoped to
      the client the context is being built for) and adds an "Agency
      Memory (curated lessons)" section with a real source count. The
      org-wide scope is deliberate: Section 6.6 already distinguishes
      Client Memory (client-specific) from Agency Memory (cross-client,
      curated), and the explicit-curation step promotion requires is
      exactly what makes a lesson from one client's meeting safe to
      surface while building another client's context. 2 new/updated
      tests in `context-retrieval.integration.test.ts` (11 total, up from
      9) — including one proving a decision promoted from Client A's own
      meeting appears in Client B's context even though Client B has no
      meetings of its own. ADR-008 updated: still no semantic/vector
      retrieval (structured `findMany` ordered by `promotedAt`, not
      similarity ranking) — only Section 19.2's promoted-knowledge layer
      became reachable. Live-verified against a real running production
      build: promoted a real decision via the real UI, then called the
      real `POST /api/cedar-brain` endpoint (same session, via
      Playwright's request context) and confirmed `contextSources`
      included the real Agency Memory entry; every fixture row (including
      the `CedarBrainRequest` the API call itself created) was deleted
      afterward. See `docs/specs/agency-memory.md`'s "Follow-up" section.
- [x] Cedar Decision Engine v1.1: Hiring/capacity recommendation (Section
      20's third worked decision type — "workload, deadlines,
      utilization, pipeline, service demand"). Unlike Client Renewal, this
      reuses an entire existing service rather than re-querying:
      `getBusinessAdvisorBriefing` (Section 16.2, already shipped) had
      already computed per-member `capacityRisks` and cross-client
      `upsellRollup`, both already shown raw on the CEO Dashboard — this
      turns them into one structured `hire`/`monitor`/`no_action_needed`
      call based on the real ratio of strained team members. "Pipeline" is
      deliberately omitted — this codebase has no lead/deal-stage concept
      at all, so there's no real data to report; "utilization" stays
      honestly named as the task-count proxy it already was, not
      relabeled as something more precise. New card on the CEO Dashboard,
      directly below AI Business Advisor. 4 new tests in
      `decision-engine.integration.test.ts` (9 total, up from 5), each
      using its own isolated organization since capacity math is org-wide.
      Live-verified against a real running production build: confirmed
      the honest baseline ("No action needed") against the real seeded
      org first, then inserted 5 real open tasks for the one seeded member
      and confirmed the card switched to "Consider hiring" with the real
      count, screenshot-verified; fixture tasks deleted afterward. See
      `docs/specs/cedar-decision-engine.md`'s "Second decision type"
      section.
- [x] Complete server-action error handling: catch
      AuthorizationError/MfaRequiredError, not just each action's own
      business-rule AuthError (Section 23.1/28.2 follow-up). Both
      `docs/specs/mfa.md` and `docs/specs/error-boundaries.md` explicitly
      named this gap: every write action in `task.ts`/`membership.ts`
      calls a service that itself calls `requirePermission`/
      `requireAnyPermission`, which can throw `AuthorizationError` or
      `MfaRequiredError` — a different failure source than each action's
      own business rule, which the earlier `inline-action-errors.md`
      slice's per-action audit didn't consider. A real, reachable race:
      an org turns its MFA-required policy on while a privileged user
      already has a page open — their next submit used to crash into the
      full-page `error.tsx` boundary instead of showing an inline
      message. All six write actions across both files now catch and
      report both error types via a shared `actionErrorMessage()`
      helper. `TaskPriorityForm.tsx`/`TaskEstimateForm.tsx` and
      `MemberRowActions.tsx`'s grant-scope form converted from plain
      `<form action={...}>` to the same controlled inline-error pattern
      `TaskStatusForm.tsx` already established. 2 new tests (one per
      action file) against real Postgres with a real unenrolled
      OWNER/ADMIN under a real MFA-required org policy. Live-verified
      against a real running production build: loaded a real task page
      while the org's MFA policy was off, flipped it on directly in
      Postgres without reloading (reproducing the exact race — a reload
      would hit the layout-level redirect instead), then confirmed the
      real inline error rendered with no crash and the underlying write
      was genuinely rejected in Postgres, not just visually reverted.
      Policy reset afterward. See `docs/specs/inline-action-errors.md`'s
      "Follow-up" section.
- [x] Audit Log viewer UI (Section 23.2/27). `audit:read` has been a real
      permission in the RBAC catalog since Phase 0, granted to ADMIN/OWNER
      by default — a repo-wide search found zero call sites checking it
      anywhere before this slice, the same "declared but never wired"
      shape already caught once this session for `AuditEvent.approvalId`.
      This directly closes `audit-event-approval-linkage.md`'s own named
      follow-up ("No UI surfaces approvalId yet... a separate, smaller
      follow-up"). New `listAuditEvents()` (org-wide, paginated,
      optional resourceType filter, batched actor/client name
      resolution) and a new `/audit` page + nav item, gated on the
      now-finally-used `audit:read`. Explicit scope boundary: no
      export/download (a real compliance feature with retention-policy
      questions this slice doesn't invent answers to), no
      integrity-hash-chain verification tool, no full-text search beyond
      the one resourceType filter, no correlation-id cross-reference UI
      (most events still have `correlationId: null` — API-route-level
      correlation IDs remain `worker-log-correlation.md`'s own
      deliberately-deferred, much-larger gap). 4 new tests against real
      Postgres. Live-verified against a real running production build:
      confirmed the nav item and page render real history for the real
      OWNER actor (every login session this entire build-out session
      created, plus the real `org.seeded` event), screenshot-verified;
      confirmed the resourceType filter genuinely constrains the query
      server-side (not just a label) by comparing `?resourceType=User`
      vs `?resourceType=Organization` results directly. Read-only smoke
      test — no fixture cleanup needed. See `docs/specs/audit-log.md`.
- [x] Client creation (Section 4). A dedicated Explore agent's exhaustive
      codebase search confirmed there was **no way to create a new Client
      anywhere in the running application** — `prisma.client.create` was
      called only from `packages/db/prisma/seed.ts` and test fixtures; no
      service function, server action, or API route existed; the
      `/clients` empty state literally told users to reseed the database.
      This is the same "declared but never wired" shape caught repeatedly
      this session (`audit:read`, `AuditEvent.approvalId`) but more
      severe — Client is the system's primary entity, and this is core
      CRUD, not a secondary read surface, despite Phase 1 below being
      marked "complete." New `createClient()` (org-wide `clients:write`,
      same tier as project-template creation, with a real `AuditEvent`),
      new `POST /api/clients` route, new `/clients/new` page + form
      covering every real baseline `Client` field (name, company name,
      industry, lifecycle stage, primary contact name/email), and a
      "+ New Client" button on the `/clients` list page gated on the same
      permission. Explicit scope boundary: no bulk import, no
      prospect-to-active workflow automation, no logo upload, no
      `connectedAccounts`/`services` UI (nothing in the app writes to
      those yet at all — this only initializes `services` to `[]`), no
      client-editing UI (a distinct, smaller follow-up). 6 new service
      integration tests + 7 new route-contract tests against real
      Postgres, including the org-wide `ScopedGrant` permission tier.
      Full suite: 641/641 passed. Full monorepo typecheck: clean on all
      15 packages. Production build succeeded. Live-verified against a
      real running production build via real Playwright/Chromium: logged
      in as the real seeded OWNER, created a real client through the real
      UI end to end, confirmed it on the client detail page and the
      `/clients` list, confirmed the real Postgres row and `AuditEvent`
      matched exactly what was typed, then deleted the fixture and
      confirmed the dev database returned to its exact seeded baseline
      (`Volt Mobile`, the only client). One test-script bug was caught and
      fixed mid-smoke-test: a generic `button[type="submit"]` selector
      first matched the authenticated shell's own "Log out" button before
      the real form's submit button, logging the session out — fixed by
      scoping the click to the button's own text. See
      `docs/specs/client-creation.md`.
- [x] Client note creation (Section 4). A quick sanity pass over other
      primary entities' creation paths right after closing the client
      gap above (Campaign, Creative, Task, Project all confirmed real via
      `.create(` grep) surfaced the same shape one level down:
      `prisma.note.create` had zero non-test call sites anywhere — both
      the client detail page's Notes card and the dedicated
      `/clients/[id]/notes` list page were read-only. New `createNote()`
      (client-scoped `clients:write`, same tier `createProject`/
      `createShoot`/`createExpense` already use, with a real
      `AuditEvent`), new `POST /api/clients/[id]/notes` route, and a new
      `AddNoteForm.tsx` wired into both previously-read-only surfaces.
      Explicit scope boundary: no note editing/deletion (treated as an
      append-only log, matching `ClientTimelineEvent`/`AuditEvent`), no
      `authorId` field added to the `Note` model itself (who wrote it is
      still recoverable via the `AuditEvent` this slice emits, the same
      indirection the Audit Log viewer already relies on), no rich
      text/attachments. 4 new service integration tests + 5 new
      route-contract tests against real Postgres. Full suite: 650/650
      passed. Full monorepo typecheck: clean on all 15 packages.
      Production build succeeded. Live-verified against a real running
      production build via real Playwright/Chromium: logged in as the
      real seeded OWNER, added a real note from the client detail page's
      Notes card, confirmed it appeared there and on the dedicated
      `/notes` list page, added a second note directly from that list
      page, confirmed both real rows and their `AuditEvent`s in Postgres,
      then deleted both fixtures and confirmed the dev database returned
      to its exact seeded baseline (the one original seeded note). See
      `docs/specs/client-note-creation.md`.
- [x] Client editing (Section 4). The client-creation slice's own explicit
      scope boundary named this as the deferred next step ("no
      client-editing UI... a distinct, smaller follow-up"), confirmed
      directly: `client-service.ts` had exactly one exported function
      (`createClient`), `prisma.client.update` had zero non-test call
      sites, and no `PATCH /api/clients/[id]` route or edit UI existed —
      once created, a client's core fields were permanently fixed. New
      `updateClient()` — the missing write half of `createClient` — is
      gated client-scoped `clients:write` (not org-wide, since it's a
      write on an already-existing client, the same tier
      `createProject`/`createShoot`/`createNote` use), takes every field
      as optional, rejects an empty-fields call, clears optional fields to
      `null` on an empty string, and emits a real `AuditEvent` with a
      genuine `{before, after}` diff of only what actually changed — no
      event at all when nothing changed. New `PATCH /api/clients/[id]`
      route and a new `/clients/[id]/edit` page (pre-filled form,
      structurally identical to `/clients/new`'s), with an "Edit details"
      link on the client detail page gated on the same `clients:write`
      check already computed there. 7 new service tests + 5 new
      route-contract tests against real Postgres. Full suite: 662/662
      passed. Full monorepo typecheck: clean on all 15 packages.
      Production build succeeded. Live-verified against a real running
      production build via real Playwright/Chromium on the real seeded
      "Volt Mobile" client (not a fixture insert, since this mutates
      existing data): confirmed the edit form was genuinely pre-filled
      from Postgres, changed lifecycle stage and industry through the
      real UI, confirmed the real `PATCH` request and the resulting
      `AuditEvent`'s before/after diff matched exactly, then reverted the
      seeded client's fields directly in Postgres and confirmed it matched
      its exact original baseline. See `docs/specs/client-editing.md`.
- [x] Expense editing and deletion (Section 4.2/16 Finance Hub). Same
      create-only shape as the just-fixed Client-editing gap, found by a
      targeted follow-up sweep: `expense-service.ts` had only
      `createExpense`, `prisma.expense.update`/`.delete` had zero
      non-test call sites, and `/clients/[id]/expenses/page.tsx` rendered
      a plain read-only list. A fat-fingered amount/category was
      previously permanent, and that number feeds directly into
      `getClientProfitability`/`getProjectProfitability`/
      `getCampaignProfitability` and the CEO Dashboard's cost aggregate —
      a real data-integrity gap in the systems recent profitability
      slices have been hardening. New `updateExpense()`/`deleteExpense()`
      — org-wide `finance:write`, the same tier `createExpense` already
      uses (an expense's `clientId` is optional, so this can't be
      client-scoped the way `updateClient` is) — with a real before/after
      `AuditEvent` diff on update and a full snapshot on delete.
      Deliberately does NOT allow reassigning `clientId`/`projectId`/
      `campaignId` (moving an expense between books is a separate, larger
      question); only `category`/`amountCents`/`description`/
      `incurredAt` are editable. New `PATCH`/`DELETE /api/expenses/[id]`
      routes and inline edit/delete controls on the expenses list page,
      gated on the existing `canWriteFinance` check. 10 new service tests
      + 9 new route-contract tests against real Postgres. Full suite:
      681/681 passed. Full monorepo typecheck: clean on all 15 packages.
      Production build succeeded. Live-verified against a real running
      production build via real Playwright/Chromium on the real seeded
      client: logged a real fixture expense, edited it through the real
      inline form, deleted it with the real confirm dialog, confirmed the
      full `created → updated → deleted` audit trail in Postgres matched
      exactly, then cleaned up and confirmed the org's two pre-existing
      seeded expenses were untouched. See `docs/specs/expense-editing.md`.

## Phase 1 — Agency Core: **complete**

Deliverable: Cedar Point can operate client/project work from one
canonical system.

- [x] Clients/contacts, Brand DNA (versioned, with a real edit UI at
      `/clients/[id]/brand/edit` — see `docs/specs/brand-dna.md`),
      projects/tasks (creation, assignment, status transitions, and —
      added in nine follow-up slices — per-task checklists: add/toggle/
      delete a flat ordered list of sub-items; task priority
      (low/medium/high, defaulting to medium, changeable inline via its
      own `<select>` next to status); task estimate (a nullable hours
      figure, changeable inline via a number input with an explicit
      "Set" button); task comments (a flat, append-only, per-author
      conversation log, collapsed behind a "Show comments (N)" toggle);
      task attachments (reusing the existing Files module's `Asset`
      model and storage adapter rather than a parallel upload path — an
      attachment is just an `Asset` row with `taskId` set alongside
      `clientId`/`projectId`); project milestones (a named deadline
      with a computed, not stored, overdue signal — `!done && dueDate <
      now` — now unified into `/calendar` alongside task/project/invoice
      due dates); task dependencies (a task can declare it's blocked by
      another task in the same project — a "Blocked by: X" pill, and a
      hard rule inside `setTaskStatus` itself that a task can't be
      marked done while an open blocker remains, so every caller of
      status changes gets the rule automatically, not just the UI); and
      reusable project templates (save any project's current tasks —
      title + priority — as an org-wide `ProjectTemplate`, then
      instantiate a new project from one for any client, with a "+ From
      template" picker on the client page), all `clients:write`-gated
      the same way task writes already were — see
      `docs/specs/projects-and-calendar.md`) with client isolation
      enforced server-side, not just in the UI. Those follow-ups closed
      every item Section 12 explicitly named as "not built yet" —
      checklist, priority, estimate, comments, attachments, milestones,
      (the smallest real cut of) task dependencies, and (a similarly
      scoped cut of) project templates — leaving only a real
      dependency-graph/critical-path engine as a still-deliberately-
      unbuilt refinement within those cut features, not an open list
      item. A ninth follow-up then closed that same paragraph's other
      named refinement, template *editing*: `renameProjectTemplate`,
      `deleteProjectTemplate` (deletes the template's
      `ProjectTemplateTask` rows first, in one `prisma.$transaction`,
      since that relation has no `onDelete: Cascade`), `addTemplateTask`
      (append-only, same `position = current count` convention checklist
      items use, importing `TASK_PRIORITIES` from `project-service.ts`
      rather than redefining it), and `removeTemplateTask` — all four
      gated on `clients:write` with **no `clientId`**, restricting them
      to an actor who holds it organization-wide (OWNER always, ADMIN by
      role, or an explicit org-wide `ScopedGrant`) rather than any one
      client's grant, since managing the shared template library isn't
      scoped to a client the way creating/instantiating a template is —
      verified by a dedicated integration test proving a per-client (not
      org-wide) `clients:write` grant is correctly denied. A new
      `/templates` management page (nav-gated the same org-wide way,
      matching `/integrations`'s own pattern) lists every template with
      an inline rename form, a `confirm()`-guarded delete button (same
      weight `RevokeConnectionButton` already established), and a
      per-task remove button plus add-task form — no reordering, same
      append-only precedent checklist items set. Deleting a template
      never affects projects already instantiated from it, since
      `createProjectFromTemplate` copies tasks into independent rows
      rather than keeping a live reference — confirmed by re-reading
      that function before documenting it. New coverage: the existing
      `project-template-service.integration.test.ts` grew from 12 to 24
      tests; three new route-contract files
      (`project-templates/[id]/route.contract.test.ts` for PATCH/DELETE,
      `project-templates/[id]/tasks/route.contract.test.ts`,
      `project-template-tasks/[id]/route.contract.test.ts`) add 19 more.
      Full suite: 557 tests across 6 workspaces (up from 526), all
      passing. Verified live against the real running server and dev
      database: reused the seeded "FastCharge Launch" project rather
      than creating a fresh one, saved it as a template through the
      real pre-existing UI flow (proving that path still works), then
      through a real headless-Chromium pass on the new `/templates`
      page renamed the template, added a task, removed a task, and
      deleted the whole template (accepting its real `confirm()`
      dialog) — each step cross-checked with `psql`, including
      confirming the deleted template's task rows were really gone with
      no FK error ever surfacing to the user. A screenshot taken
      mid-pass was visually inspected and showed a clean layout with no
      overlapping or unclickable controls. Cleaned up back to the exact
      pre-test row counts (0 templates/0 template tasks), leaving only
      the real audit events and login sessions the pass legitimately
      generated, and confirmed no server process was left running
      afterward.
      Each slice was verified live against a real
      running server: checklist via a full real add/toggle/delete round
      trip driven through a headless browser against a real seeded
      task; priority via a real API-created task whose priority was
      then changed through the real UI dropdown and confirmed with
      `psql` after a page reload; estimate the same way, changing a
      real task's hours through the real input and "Set" button;
      comments by posting one through the real API, confirming its
      author attribution with `psql`, then posting a second through the
      real UI form and confirming both rendered with the right author
      names after a reload; attachments by uploading a real file
      through the real API, confirming the persisted row and the
      on-disk file, then removing it through the real UI and confirming
      both the row and the file were gone afterward; milestones by
      creating a real past-due milestone, confirming the real "Overdue"
      badge rendered on the project page and disappeared once marked
      done, then separately confirming a near-future milestone appeared
      on the real `/calendar` page with the correct badge; dependencies
      by creating a real blocking edge through the real API, then in a
      real browser confirming the blocked task's "Done" option was
      disabled, unblocking it by completing the blocker, completing the
      blocked task successfully, and removing the dependency via its
      "✕" button — this live pass caught a real bug (an uncaught
      `AuthError` from the new status-change rule crashing the whole
      page with no error boundary to catch it) that the integration and
      route-contract tests alone had not, fixed by disabling the "Done"
      option client-side whenever a task has an open blocker; templates
      by saving a real project as a template and instantiating a new
      project from it through the real API, confirming both the task
      snapshot and the copied tasks via `psql`, then repeating the full
      save/instantiate round trip through the real UI — which caught a
      second real bug, a header-row layout overflow that made the
      instantiate form's own "Create" button unclickable, fixed by
      moving the form into the card body and adding `flex-wrap`.
- [x] Calendar — `/calendar` unifies task/project/invoice/milestone due
      dates, scoped to what the actor can read. A follow-up slice
      finally joined `Shoot.scheduledAt` and client-scoped
      `Meeting.occurredAt` — this bullet's own prior wording named both
      as pending "once those modules exist," and both now do. An
      internal (clientless) meeting is deliberately excluded: every
      other event type here has exactly one client, and the calendar is
      inherently client-centric, so there's no client thread for one to
      hang off of — it stays visible on `/meetings` instead. Campaign
      launches remain the one still-pending item (Phase 4, blocked on
      real ad-platform connectors this environment can't obtain OAuth
      credentials for). Extended
      `project-and-calendar.integration.test.ts`'s existing
      `getUpcomingEvents` tests with a real scheduled shoot and a
      client-scoped meeting (both asserted present and correctly
      client-scoped) plus a real internal meeting in the same window
      (asserted absent from every result, scoped or org-wide) — still 29
      tests total, since these extend existing assertions rather than
      adding new cases. Verified live: created a real shoot and a real
      client-scoped meeting through the running server, confirmed both
      rendered on `/calendar` with the correct new "Shoot"/"Meeting"
      badges and client names, then confirmed a real internal meeting
      created the same way never appeared there.
- [x] Meetings and Decision Capture (Section 13) — closes a real gap
      this file never named as built: `Meeting`/`MeetingAttendee` were
      scaffolded early alongside the core domain models, but had no
      service, API route, UI, or test anywhere in the codebase
      referencing them. Section 13's own text is a large, partly
      AI-dependent, partly speculative vision (transcript capture,
      AI-generated summaries, decisions with "approver ... and
      evidence," promotion into memory); this slice builds the smallest
      real cut on top of the real (dead) schema rather than inventing a
      feature from scratch, and Section 36's phase list only mentions
      "Meetings" in passing as a future Cedar Brain AI capability — the
      record-keeping half built here is squarely Phase 1 agency-core
      work, not an AI feature, so it's placed here alongside Section
      12's Projects/Tasks/Calendar rather than under Phase 3. Two real,
      pre-existing schema bugs were fixed in one migration first (zero
      rows in either table in both the dev and test databases, confirmed
      via `psql` before touching anything — safe to restructure with no
      data-migration risk): `Meeting` had no `organizationId`, so a
      clientless internal meeting (a real case — an agency has internal
      team meetings too) would have had no tenant scope at all (a real
      Section 38 gap); `MeetingAttendee.userId` pointed at the bare
      global `User` instead of `Membership`, inconsistent with every
      other actor-reference in this schema
      (`Task.assigneeId`/`TaskComment.membershipId`/`Asset.uploadedBy`).
      New `meeting-service.ts`: `createMeeting`/`updateMeetingNotes`/
      `addMeetingDecision`/`addMeetingFollowUp`/`getMeeting`/
      `listMeetingsForClient`/`listMeetingsForOrganization` (the last
      following `calendar-service.ts`/`search-service.ts`'s established
      already-resolved-`clientIds` contract exactly, no
      `requirePermission` inside it), and `promoteFollowUpToTask` — the
      standout feature, turning a follow-up into a real `Task` by
      reusing the existing `createTask` (Section 12) rather than
      reimplementing task creation, the concrete buildable half of
      Section 13's "approved meeting decisions update relevant
      client/project context" (Agency Memory itself doesn't exist yet —
      `docs/specs/client-memory.md` already documents that gap — so
      "promoted into memory" stays unbuilt). No new permission: reuses
      `clients:write`/`clients:read`, gated by the meeting's own scope
      (its `clientId`, or org-wide when internal) exactly the way
      `project-template-service.ts`'s template-management functions
      already precedent this "sometimes client-scoped, sometimes
      org-wide" shape. Decisions are deliberately simple user-entered
      records (`text`, optional `rationale`) rather than a second
      approval workflow with an approver/evidence model, which would
      duplicate Section 15.1's existing Approval engine for a different
      resource type. Five new routes under `/api/meetings/**`; a new
      `/meetings` list page (ungated nav item like `/metrics`, computing
      `clientIds` via `getReadableClientIds` the same way `/calendar`'s
      page does, plus a new `getWritableClientIds` — the write-side
      mirror of that helper — for the "+ New meeting" client picker) and
      `/meetings/[meetingId]` detail page (notes textarea with an
      explicit "Save" button matching `TaskEstimateForm.tsx`'s
      explicit-save pattern, a Decisions list, and a Follow-ups list
      with a "Promote to task →" control that becomes a "✓ Task
      created" link once promoted); the client 360 page gained a
      compact "Meetings" card mirroring the Invoices/Expenses cards'
      shape. New coverage: `meeting-service.integration.test.ts` (26
      tests, including a dedicated org-wide-vs-per-client permission
      boundary test — same shape as the one added for project template
      management — proving a per-client-only `ScopedGrant` holder can
      create/read that client's meetings but not an internal one, even
      one that already exists) plus five `*.route.contract.test.ts`
      files (28 tests). Full suite: 625 tests across 6 workspaces with
      any tests (up from 571), all passing; clean typecheck/lint/build.
      Verified live against the real running server and seeded dev
      database with a real headless-Chromium pass: created a real
      client-scoped meeting for the seeded "Volt Mobile" client with a
      real attendee through the actual `/meetings` UI, confirmed it
      appeared both on `/meetings` and on that client's 360 page's new
      Meetings card; opened its detail page, saved a real note through
      the UI, reloaded, and confirmed it persisted (cross-checked via
      `psql` against the real dev database); added a real decision and a
      real follow-up (with an owner and a due date), confirmed both
      rendered; promoted the follow-up to a task against the seeded
      "FastCharge Launch" project, confirmed the UI switched to "✓ Task
      created," and confirmed via `psql` that a real `Task` row existed
      with the right title/assignee/due date and the meeting's
      `followUps` JSON had `promotedTaskId` set correctly; confirmed the
      promote button was correctly gone from the UI for the
      now-promoted follow-up, then proved the server-side guard
      directly via a real authenticated `curl` request repeating the
      same promotion and got back a real 400 "This follow-up has
      already been promoted to a task."; created a second, real internal
      meeting (no client) through the UI, confirmed it appeared on
      `/meetings` labeled "Internal" but never appeared on the client
      360 page. A screenshot of the meeting detail page (its Follow-ups
      card in particular — owner/due-date/promote-button sharing one
      row, a layout shape this session has gotten wrong before) was
      visually inspected and showed a clean layout with no overlapping
      or unclickable controls. Cleaned up every row this pass created
      (both meetings, their attendee row, the promoted task, and the 7
      tied audit/timeline events) and cross-checked via `psql` that dev
      database row counts matched their exact pre-test values, leaving
      only the 2 real login audit events the pass legitimately
      generated as genuine history (same precedent as every prior live
      smoke test this session). Confirmed no server process was left
      running afterward. See `docs/specs/meetings.md` for the full
      design, the schema-fix rationale, and the explicit scope
      boundary (no transcript capture/AI summary, decisions are not an
      approval workflow, no memory promotion).
- [x] Files/assets — upload, download, delete with real validation,
      checksums, and signed URLs on a dev-grade local storage backend
      (see `docs/specs/files-and-assets.md`, ADR-005). Virus/malware
      scanning is the one explicitly unbuilt piece. Follow-up slice
      closed a real Section 14 gap found by cross-checking the schema
      against the service layer: `creative_versions.assetId` is
      `ON DELETE SET NULL`, so `deleteAsset` previously let a file still
      attached to a creative version be deleted, silently nulling out
      that version's deliverable with no warning or audit trail —
      exactly the "orphaned asset" Section 14's "prevent orphaned assets
      through reference tracking" asks not to happen. `deleteAsset` now
      checks for a referencing `CreativeVersion` first and refuses with a
      409 (a new `AssetValidationError` case, mapped in
      `/api/assets/[id]/route.ts` before the generic 404
      `AuthError` branch). The client page's `AssetsList.tsx` "Remove"
      button previously ignored the fetch response entirely — since a
      delete could now fail, it gained real error handling (checks
      `res.ok`, shows the server's message) matching this app's existing
      inline-error pattern elsewhere. New coverage: extended
      `asset-service.integration.test.ts` (attach an asset to a real
      creative version, confirm deletion is refused, detach, confirm it
      then succeeds) and `route.contract.test.ts` (409 at the HTTP
      layer). Live-verified against a real running production build:
      uploaded a real file via the authenticated API, attached it to a
      real creative version, got a real 409 from a real `DELETE` request
      with the asset row still present, cleared the reference, got a
      real 200 with the row actually gone. All smoke-test rows cleaned
      up. Explicitly not built: the inverse cleanup job (assets uploaded
      but never referenced anywhere accumulating in storage) — that
      needs a real lifecycle-policy decision, not just a guard on
      deletion.
- [x] Notifications (Section 30) — in-app notification center
      (severity/category/client/resource/action/read-acknowledged
      state), a real fan-out (`notifyClientWriters`) wired into approval
      requests (QC-aware severity), failed content-calendar publishes,
      and a new hourly worker escalation job for overdue tasks/projects/
      content. A follow-up slice added the payment-risk trigger this
      module's own scope boundary had deferred — real invoicing didn't
      exist yet at the time; it does now (`Invoice.dueAt`/`.status`, the
      same data Client Health Score's `payment_status` factor already
      uses). New `escalateOverdueInvoices()` in
      `apps/worker/src/jobs/escalations.ts`, mirroring the existing
      task/project/content pattern exactly (same 24h dedupe window,
      `notifyClientWriters`) but `CRITICAL` severity, not `WARNING` —
      unpaid revenue past due is weighted heaviest in Client Health
      Score for the same reason. This slice also wrote
      `escalations.integration.test.ts`, the first real test coverage
      that file ever had despite being `apps/worker`'s very first job
      (3 tests: all four escalation types fire exactly once and
      deduplicate correctly on a re-scan, a paid invoice past due is
      never escalated, an invoice not yet due is never escalated).
      Explicit scope boundary in `docs/specs/notifications.md`:
      integration-degradation escalation still needs Phase 4 connectors
      that don't exist; email/push channels are adapters for later, not
      built. Verified live: created a real overdue unpaid invoice for
      the seeded demo client, ran the real worker process, confirmed via
      `psql` a real `CRITICAL` `invoice_overdue` notification with the
      correct formatted-dollar title, confirmed it rendered on
      `/notifications` with the right action URL, and confirmed a
      second scan produced no duplicate; test rows cleaned up
      afterward.
- [x] Global search / command palette (Section 28.2) — `⌘K`/`Ctrl+K`
      overlay finding Clients/Projects/Campaigns/Creatives/Content
      Calendar items/Shoots by name, scoped through the same
      `getReadableClientIds` isolation the Section 12 calendar uses. A
      follow-up slice added `Task` as a 7th searchable entity type — the
      original slice predates Task priority/comments/attachments/
      dependencies, and a core, high-frequency record with a real
      `title` field being unsearchable was a real gap, not a deliberate
      decision; a task result links to its own project's detail page,
      the same pattern `content`/`shoot` results already used (neither
      has a standalone per-item URL). `Invoice` stays deliberately out
      of scope — no free-text field exists to match against, so adding
      it would mean inventing a search key nobody asked for. Explicit
      scope boundary in `docs/specs/search.md`: this is "find records,"
      not Section 28.2's paired "initiate permitted actions" — that
      belongs with Cedar Command Center, not a second parallel
      command-execution path. Verified live: searched for a real seeded
      task's title through the actual `⌘K` palette in a headless
      browser, confirmed the "Task" badge rendered and selecting it
      navigated to the task's real project page. A second follow-up
      slice (same day the Meetings module below shipped) added `Meeting`
      as an 8th entity type for the identical reason `Task` needed one —
      a real `title` field, unsearchable. `Meeting` scopes differently
      from every other entity here: it carries `organizationId` directly
      (an internal meeting has no client at all), so a scoped reader
      only matches a meeting tied to one of their readable clients,
      excluding internal/clientless meetings entirely (mirroring
      `listMeetingsForOrganization`'s own identical rule) — an org-wide
      reader matches every meeting, internal ones included. 9
      integration tests (up from 7), 5 route-contract tests (up from 4).
      Verified live: searched for a real meeting through the `⌘K`
      palette, confirmed the "Meeting" badge and correct subtitle
      (client name, or "Internal meeting") rendered, and confirmed
      selecting it navigated to the real meeting detail page.
- [x] Activity timeline (`ClientTimelineEvent`) now gets real writes from
      Brand DNA saves, project creation, campaign creation, asset
      uploads, creative approvals, task creation/completion, and invoice
      creation/sending/payment. Invoices also gained their first real
      write path (`invoice-service.ts`'s `createInvoice`/`sendInvoice`/
      `markInvoicePaid`, gated on `finance:write`) — previously
      seed-only, like `Expense` before `createExpense`. See
      `docs/specs/activity-timeline.md` for the exact scope boundary:
      automatic `OVERDUE` status transition isn't built (overdue is
      already computed on the fly everywhere it's needed; storing it too
      would create a second source of truth), and only task *completion*
      (not every status flip) is timeline-worthy.

## Phase 2 — Creative and Approval Operations: **complete**

Deliverable: brief-to-client-approval lifecycle is operational.

- [x] Campaigns, Creatives, versioning, and the full approval state
      machine (requested → changes_requested/approved/canceled, with a
      new version superseding whatever the previous one's state was) —
      see `docs/specs/approvals.md`. A version can link to an uploaded
      file from the Files module.
- [x] Content Calendar (planning/scheduling, distinct from the Section 12
      due-date calendar) — `ContentCalendarItem` (client/channel/campaign/
      pillar/format/owner/status/dueDate/publishAt, optional link to a
      `Creative` for its own approval history), a 7-state workflow
      enforced server-side (BRIEF → DRAFT → INTERNAL_REVIEW →
      CLIENT_APPROVAL → SCHEDULED → PUBLISHED, plus FAILED with a
      required reason and retry), a per-client planning page at
      `/clients/[id]/content`, and due/publish dates now feed into the
      Section 12 unified `/calendar` as `content_due`/`content_publish`
      events. `PUBLISHED` means "the plan says this went out," not a real
      connector call — see `docs/specs/content-calendar.md` for the exact
      scope boundary (actual publish execution is Phase 4).
- [x] Video/production workflows (Section 11) — `VideoBrief`/
      `VideoBriefVersion` (versioned concept/hook/storyboard/script/
      voiceover/caption/edit-instruction/music-note/platform-variant
      planning, 1:1 with a `Creative`) and `Shoot` (schedule/location/
      crew/equipment/permits/call sheet/shot list/product list/
      references/status for Section 11.2 photography/production). Video
      brief editor lives on the Creative detail page (video-type
      creatives only); `/clients/[id]/shoots` covers scheduling. The
      final video file's approval/publishing still goes through the
      existing Creative/CreativeVersion/Approval pipeline rather than a
      parallel one. Explicit scope boundary (see
      `docs/specs/video-and-production.md`): Section 11's *AI* assistance
      (shot-list generation, angle ideas, schedule suggestions) is not
      built — this is the data model/workflow a human plans against.
- [x] Client Portal (Section 15.2) — `/portal` + `/portal/[clientId]`
      curated view (pending approvals with a decide action, approved
      history, invoices, files); a `CLIENT_PORTAL` membership has zero
      org-wide permissions, all access comes from `ScopedGrant`s
      auto-created on invitation acceptance; a new narrow
      `approvals:decide` permission (OR'd with `clients:write` via
      `requireAnyPermission`) lets a portal contact record their own
      decision, always attributed to their own authenticated identity —
      `Approval.decidedBy` free text from a portal contact is discarded
      server-side, never trusted. See `docs/specs/client-portal.md`.
- [x] Quality Control (Section 5/6.1/7: brand consistency, spelling/
      language, required information, dimensions/specifications before
      client review) — runs automatically inside `requestApproval`:
      prohibited-language scan and required-disclaimer presence check
      against two new Brand DNA fields (`prohibitedLanguage`,
      `requiredDisclaimers`), plus an image aspect-ratio check against a
      static per-platform spec table (via `sharp`). Advisory, not a hard
      gate — a FAIL is stored and rendered prominently on the Creative
      detail page but never blocks the approval request, matching
      Section 5's "before client review" as a visibility requirement.
      Explicit scope boundary (see `docs/specs/quality-control.md`):
      every check is a deterministic rule check, not an LLM judgment
      call — no AI Foundation wiring exists yet for a genuine "does this
      feel on-brand" assessment (Phase 3+).

## Phase 3 — AI Foundation and Command Center: **thin slice exists**

- [x] Cedar Command Center UI + a naive keyword-based agent router +
      direct Anthropic API call (or deterministic stub) — see ADR-007 for
      exactly how far this is from the Bible's full orchestration
      lifecycle (no evaluation of the live model call's actual output,
      no cost governance beyond what AI Supervisor now tracks).
- [x] Cedar Brain per-agent output breakdown (Section 4/6.1) — the
      Command Center's response always carried a `plan[]` array (one
      entry per routed agent), but live mode set every entry's output
      to `null` and the UI never rendered `plan[]` at all. Fixed with
      one Anthropic call per request (unchanged — see below for why not
      one call per agent) whose system prompt now asks for labeled
      per-agent sections, parsed into real `plan[]` entries; the
      Command Center UI now renders that breakdown. A real
      per-agent-specialization design (separate API calls per agent,
      each with a specialist prompt) was considered and explicitly
      rejected for now: Section 33's budget/cost-governance mechanism
      doesn't exist yet, so multiplying real API spend per request with
      no safety net would be introducing financial risk the Bible says
      needs governance first, not silently accepted. See
      `docs/specs/cedar-brain-per-agent-output.md`.
- [x] Governed context retrieval (Section 6.1) — Command Center's client
      picker (scoped to what the actor can read) triggers a real
      structured-query retrieval (`buildGovernedContext`) of that
      client's Brand DNA, Client Health Score, and recent timeline
      events, authorized *before* any data is touched and injected into
      the model's system prompt with an explicit "don't invent facts
      beyond this" instruction. The real sources retrieved are shown
      back to the user, not hidden inside the model call. Explicit scope
      boundary in `docs/specs/governed-context-retrieval.md`: structured
      queries only, no semantic/vector retrieval (ADR-008 defers that —
      no unstructured content exists yet to index), no cross-client or
      knowledge-layer retrieval.
- [x] AI Supervisor telemetry (Section 6.3) — every Cedar Brain request
      (success or failure — previously only successes were logged, a
      real gap this slice fixed) now records real mode, model name, a
      manually-bumped prompt version constant, measured latency,
      success/error outcome, and actual input/output token counts from
      the Anthropic response. `/command/supervisor` (new `ai:supervise`
      permission) surfaces real aggregates — success rate, average
      latency, live/stub split, token totals, recent failures, and
      user-flagged-incorrect responses (a real "Flag as incorrect"
      button on the Command Center, satisfying Section 6.3's "user
      corrections" signal). Explicit scope boundary in
      `docs/specs/ai-supervisor.md`: no retry/tool-failure counts (no
      retry logic or tool-calling exists to count), no cost-threshold
      alerting yet — token counts stand in for "cost" rather than a
      computed dollar figure that would need a hardcoded,
      staleness-prone price.
- [x] AI Evaluation Harness (Section 6.3/33) — a real, deterministic
      regression suite for Cedar Brain's routing logic
      (`routeToAgents`), the one fully-deterministic, non-flaky part of
      Cedar Brain's orchestration (evaluating the live model call's
      actual output would need a rubric-based LLM-judge harness — a
      materially bigger, separately-scoped undertaking, explicitly
      deferred, not silently skipped). A 10-case golden set, run on
      demand from `/command/supervisor` ("Run eval now"), persisted as
      `AiEvalRun`/`AiEvalResult` rows. Building the golden set —
      verifying every case against real output before trusting it,
      rather than hand-deriving expectations from the same code being
      tested — found and fixed a real bug: `routeToAgents` used plain
      substring matching, so `"script"` matched inside
      `"de-SCRIPT-ion"` and `"ad"` matched inside `"already"`/
      `"administrator"`, both common words in real agency request text.
      Fixed with word-boundary regex matching. See
      `docs/specs/ai-eval-harness.md` for the full "why routing, not
      live-response quality" reasoning and what's explicitly deferred
      (a live-response LLM-judge harness). A follow-up slice closed this
      module's own other explicitly-named gap: "No CI/scheduled
      automatic runs — the harness runs on demand via the 'Run eval
      now' button." `apps/worker/src/jobs/ai-eval.ts` now runs the same
      `runRoutingEval()` daily (`immediately: true` on restart, mirroring
      the existing `escalations`/`health-scores` jobs), writing the same
      `AiEvalRun`/`AiEvalResult` rows a manual click does. Scheduling
      this required a real extraction first: `apps/worker` has never
      imported anything from `apps/web` (it only ever depends on
      `packages/*`), so `CedarAgent`/`routeToAgents` and the harness
      itself (`ROUTING_EVAL_SUITE`/`ROUTING_GOLDEN_SET`/`runRoutingEval`/
      `getRecentEvalRuns`) moved verbatim to `packages/ai/src/routing.ts`
      and `packages/ai/src/eval.ts` — the first real code `packages/ai`
      has ever held, closing a placeholder open since Phase 0.
      `apps/web/src/lib/cedar-brain.ts` and `apps/web/src/lib/services/
      eval-service.ts` became thin re-export shims
      (`export { routeToAgents, type CedarAgent } from "@cedar/ai"` and
      `export * from "@cedar/ai"`, the same pattern the MFA-enforcement
      slice used for `MFA_PRIVILEGED_ROLES`), so every existing call
      site kept importing from `@/lib/cedar-brain`/`@/lib/services/
      eval-service` unchanged. This deliberately does not reopen the
      "no full Cedar Brain migration into packages/ai" decision the
      model-catalog slice (and every Cedar Brain slice before it) made
      on purpose — `callCedarBrain`, the prompt/model-selection/budget
      machinery all stay in `apps/web` exactly where they were; only
      the fully-deterministic, non-Anthropic-dependent piece a second
      real consumer needed moved. See `docs/adr/0007-ai-provider-gateway.md`'s
      dated log and `docs/specs/ai-eval-harness.md`'s scope-boundary
      section for the full rationale. Test coverage moved rather than
      being lost: `packages/ai/src/routing.test.ts` (8 tests, moved from
      `cedar-brain.test.ts`) and `packages/ai/src/eval.integration.test.ts`
      (3 tests, moved from `eval-service.integration.test.ts`, backed by
      a new `packages/ai/vitest.config.ts` pinned to `cedarpoint_test`,
      copied from `packages/auth/vitest.config.ts`'s established
      pattern) — `apps/web`'s suite went from 571 to 560 tests (-11
      moved out), `packages/ai`'s went from 0 to 11 (+11 moved in), full
      monorepo total unchanged at 637. Verified live: flushed Redis,
      started the real `apps/worker` process, confirmed a real
      `"ai eval job complete"` log line with `totalCases: 10,
      passedCases: 10` within seconds of startup, cross-checked via
      `psql` that a matching `AiEvalRun` row (with exactly 10
      `AiEvalResult` children) existed in the real dev database, then
      confirmed through a real headless-Chromium pass on
      `/command/supervisor` that the pre-existing "Evaluation harness"
      card rendered that exact automatically-triggered run identically
      to a manually-triggered one — proving the UI needed zero changes.
      Smoke-test rows deleted afterward, both processes confirmed
      stopped.
- [x] AI Budget Governance (Section 33) — the specific mechanism the
      per-agent-output slice cited as missing. A real, enforced monthly
      token budget: `AiBudget` (one row per organization, created only
      when an owner/admin explicitly sets one — no default is ever
      fabricated), `getAiBudgetStatus` computing real usage from
      `CedarBrainRequest` for the current calendar month, and
      enforcement in `/api/cedar-brain/route.ts` that rejects a live
      call with 402 *before* any real API spend once the organization
      is over budget (stub mode is never blocked, since it costs
      nothing either way). `alertIfOverBudget` closes the actual
      "cost-threshold alerting" gap `ai-supervisor.md` had flagged as
      missing — a deduplicated notification (once per 24h) to every
      `ai:supervise` holder. A new "AI budget" card on
      `/command/supervisor` shows usage vs. limit and lets an
      `organization:manage` holder set or clear it. Verified live
      against the seeded dev database: set a real 5,000-token budget,
      inserted a real 5,500-token live-mode request, confirmed the page
      showed the exact over-budget arithmetic. See
      `docs/specs/ai-budget-governance.md`, including why this closes
      the *blocker* the per-agent-fan-out decision cited, without
      itself reopening that decision — true per-agent specialization
      remains its own separate, not-yet-started slice.
- [x] Cedar Prompt Version Registry (Section 33) — the other item
      ADR-007's "what this ADR will need to decide" list had named.
      Rejected the obvious reading (an admin-editable live prompt) as a
      real multi-tenancy bug: any org's admin editing a system-wide
      shared prompt would silently change Cedar Brain's behavior for
      every other organization on the deployment. Built instead: an
      auto-captured, read-only `CedarPromptSnapshot` audit trail. The
      static instructional text was extracted from `callCedarBrain`
      into its own named `SYSTEM_PROMPT_TEMPLATE` export (a real prompt
      content change, so `CEDAR_BRAIN_PROMPT_VERSION` bumped v3 → v4
      per the file's own convention); `ensurePromptSnapshotRecorded`
      captures the real text the first time each version is used
      (idempotent — one DB round-trip per version per server process).
      A new "Prompt version history" card on `/command/supervisor`
      shows every captured version with its real text on expand.
      Verified live against the seeded dev database with a direct-SQL
      cross-check: sent a real request, confirmed a `v4` row existed
      with the real template text, confirmed the page rendered it. See
      `docs/specs/cedar-prompt-registry.md`.
- [x] Model Catalog and Routing Policy (Section 33) — the last item
      ADR-007's "what this ADR will need to decide" list had named: "a
      real model catalog ... the model-catalog half does not [exist]."
      A small, static `MODEL_CATALOG`
      (`apps/web/src/lib/model-catalog.ts`) of 3 real Anthropic model
      ids, one per tier (`claude-haiku-4-5-20251001` fast,
      `claude-sonnet-5` standard, `claude-opus-5` premium), and
      `selectModelForRequest()`, a deterministic function of how many
      agents `routeToAgents()` matched (≤2 → fast, 3 → standard, ≥4 →
      premium) — the only real, already-computed complexity signal
      Cedar Brain has today. `callCedarBrain()`'s live Anthropic call
      now uses the selected model's real id instead of a hardcoded
      `"claude-sonnet-5"` literal, and returns a new `modelId` field in
      *both* its stub and live return shapes, so stub-mode requests
      (every request in any environment with no `ANTHROPIC_API_KEY`,
      including this sandbox) no longer discard which model would have
      been used. `/api/cedar-brain/route.ts`'s two hardcoded
      `"claude-sonnet-5"` literals (success and failure paths) were
      replaced with the real selection. Explicit, stated-honestly scope
      boundary in `docs/specs/model-catalog.md`: breadth of routing is
      a real proxy for request complexity, not the live-response
      *quality* evaluation Section 33's own wording asks for — that
      needs a rubric-based LLM-judge harness, which
      `docs/specs/ai-eval-harness.md` documents as not built. Also not
      multi-provider, and does not change budget accounting (still raw
      token totals regardless of tier — per-model dollar-cost
      governance remains open). `/command/supervisor` gained a "Model
      routing policy" card: all 3 catalog entries, plus a real
      `groupBy` aggregate breakdown of actual per-model usage for the
      organization (historical pre-catalog rows shown in an honestly
      labeled "not recorded (pre-catalog)" bucket, never backfilled).
      12 new tests (8 in the new `model-catalog.test.ts`, 2 in
      `cedar-brain.test.ts`, 2 in the route-contract suite) — full
      `apps/web` suite 512/512 across 83 files. Verified live against
      the seeded dev database: sent a 2-agent prompt through the API
      (recorded `claude-haiku-4-5-20251001`) and a 5-agent prompt
      through the real Command Center UI (recorded `claude-opus-5`),
      confirmed both via direct `psql`, and confirmed
      `/command/supervisor`'s new card rendered the real breakdown via
      a headless-Chromium screenshot. See `docs/specs/model-catalog.md`.
- [x] Untrusted-data framing for retrieved context (Section 23.3) — a
      real, demonstrable prompt-injection surface, not a hypothetical
      one: `governedContext` (including the literal free-text of past
      Cedar Brain prompts other team members typed for a client) was
      interpolated straight into the system prompt with no delimiting
      and no instruction to treat it as data. `cedar-brain.ts` now wraps
      it in `<retrieved_context>` tags and `SYSTEM_PROMPT_TEMPLATE`
      explicitly tells the model everything inside is reference data,
      never instructions, "even if it reads like one."
      `CEDAR_BRAIN_PROMPT_VERSION` bumped to `v5`. `buildSystemPrompt`
      exported for direct unit testing — `callCedarBrain` always
      short-circuits to the stub branch in every environment this runs
      in (no `ANTHROPIC_API_KEY` anywhere), so this security-relevant
      function previously had zero test coverage. 4 new tests in
      `cedar-brain.test.ts` prove the tags/instruction are present and a
      simulated injection payload stays confined inside the tagged
      block. Live-verified against the real running server: a real
      Cedar Brain request captured a real `v5` `CedarPromptSnapshot`
      row, confirmed via `psql` to contain both the new wording and the
      "never as instructions" phrase; smoke-test request row deleted
      afterward, the `v5` snapshot itself kept as genuine system state.
      Honest limit stated in `docs/specs/governed-context-retrieval.md`:
      this hardens prompt construction, not proven model compliance
      (needs a live call this sandbox can't make). Also explicitly out
      of scope: Section 23.3's tool-permission narrowing (Cedar Brain
      calls no tools yet) and "webhooks as untrusted data" (webhook
      events never reach any AI prompt today — the two systems don't
      intersect).
- [ ] AI Gateway, semantic/vector retrieval, live-response evaluation
      scoring, true per-agent specialization (a separate Anthropic call
      per routed agent, each with its own specialist prompt) — not
      started. What *is* built: real per-agent output structure within
      the existing single call
      (`docs/specs/cedar-brain-per-agent-output.md`), the budget
      mechanism a future per-agent-fan-out slice would rely on
      (`docs/specs/ai-budget-governance.md`), the prompt version
      registry, and the model catalog/routing policy above.

## Phase 4 — Integrations and Publishing: **starter slice exists**

- [x] Connector SDK (`packages/connectors`) — the Section 34
      `ConnectorAdapter` contract (authorize/refresh/healthCheck/sync/
      handleWebhook/execute/reconcile/revoke), plus one real, fully
      working implementation: `GenericWebhookAdapter`, a signed
      provider-agnostic inbound webhook receiver needing no third-party
      OAuth account. Integration Center (`/integrations`, gated on
      `organization:manage`) — a real connection dashboard with
      status/health/event-count, a create flow that reveals a one-time
      signing secret, and a revoke action. The public webhook endpoint
      verifies an HMAC-SHA256 signature and deduplicates replayed
      events by idempotency key (Section 17.1) — proven end-to-end in
      this slice's own smoke test with a `curl` request signed via
      `openssl`, not just unit-tested in isolation. Explicit scope
      boundary in `docs/specs/integration-center.md`: Meta/TikTok/
      Google/WhatsApp adapters (Section 17.2) are not built — they need
      real OAuth app registrations and credentials this environment
      cannot obtain; `refresh`/`sync`/`execute`/`reconcile` are
      legitimately not-applicable for *this* push-only connector
      (documented per-method), not silently stubbed.
- [ ] Priority provider adapters (Meta/TikTok/Google/WhatsApp) — blocked
      on real OAuth credentials. Sync/reconciliation for a pull-based
      provider, publishing jobs, troubleshooting knowledge base — not
      started.

## Phase 5 — Finance and Executive Intelligence: **complete except one deferred item**

`Invoice`/`Expense`/`ClientHealthScore` models exist and the CEO Dashboard
(`/dashboard`, gated on `finance:read`) computes real aggregates from
them.

- [x] Client Health Score (Section 4.2) — a real daily worker job now
      computes an explainable score from real signals (overdue tasks/
      projects, overdue unpaid invoices, approval latency, Quality
      Control failure rate), replacing the seeded/manual number; the
      client profile page shows the full factor breakdown, not just the
      score. A follow-up slice added a sixth signal, `meeting_cadence`
      — days since the client's last recorded (client-scoped,
      already-occurred) meeting, now that the Meetings module (Section
      13) exists to source it from: 10-point penalty beyond 90 days, 5
      beyond 45, else 0, with a client that has no meeting on record at
      all also scoring 0 — absence of tracked data is never treated as
      evidence of a gap, matching how `approval_latency`/
      `unresolved_issues_qc` already handle "no recent decisions"/"no
      recent checks." New `meetingCadencePenalty` in `packages/metrics`
      (4 new tests), wired into `apps/worker/src/jobs/health-scores.ts`
      and `METRICS_CATALOG`. Explicit scope boundary in
      `docs/specs/client-health.md`, stated honestly: this is a partial
      cut of Section 4.2's "communication gaps" — a real meeting-cadence
      signal, not full communication tracking, since no messaging/
      call-log model exists; campaign trends, satisfaction signals, and
      renewal proximity still need modules that don't exist yet and are
      never faked. `health-scores.integration.test.ts` grew from 8 to 10
      tests. Verified live: created a real client-scoped meeting dated
      100 days in the past through the running server's API, re-ran the
      real health-scores job, confirmed via `psql` the resulting
      `ClientHealthScore` row's `factors` JSON carried a real
      `meeting_cadence` penalty of 10 with the score reduced
      accordingly, and confirmed the client profile page's factor
      breakdown rendered it; test rows cleaned up afterward.
- [x] Client-level profitability attribution (Section 4.2/16) — new
      `Expense.clientId` (optional) plus a first real write path
      (`createExpense`, gated on `finance:write`) makes cost
      attribution real, paired with `Invoice.clientId` (already
      existed) for revenue. CEO Dashboard gained a per-client
      revenue/cost/profit/margin table; client profile page gained an
      Expenses card.
- [x] Project-level profitability attribution (Section 4.2/16 Phase 5)
      — new `Invoice.projectId`/`Expense.projectId` (both optional FKs
      to `Project`), validated by both write paths against the given
      `clientId` (not just the organization) so a project can't be
      mis-tagged to another client's project. New
      `getProjectProfitability(clientId)` breaks down revenue/cost/
      profit/margin by project within a client, with an "unassigned"
      bucket for untagged invoices/expenses — mirrors the client-level
      unattributed-overhead pattern one level down. UI: the invoice/
      expense forms gained an optional project picker (4 call sites);
      the project detail page gained a real Profitability card. Also
      fixed a real unbounded `expense.findMany` found while touching
      `profitability-service.ts`, converted to `groupBy`/`aggregate`
      matching the invoice side's existing pattern. Explicit scope
      boundary in `docs/specs/profitability.md`: campaign/service-level
      attribution (Phase 5's own wording) still needs a billable
      line-item model and reconciled campaign spend, neither of which
      exist — deferred with reasons given, not faked.
- [x] Opportunity Engine (Section 4.2) — `getOpportunitiesForClient`
      surfaces evidence-backed service and creative-format gaps: a
      service or creative format used by 2+ other distinct clients in
      the organization but absent from this one, each with a literal
      evidence count, never a prediction. Rendered on the client
      profile page as an "Opportunities" card, gap-free clients show no
      card. Explicit scope boundary in
      `docs/specs/opportunity-engine.md`: intent signals, market/
      industry benchmarking, and trend-based or AI-generated
      opportunities need modules or data sources that don't exist yet
      and are never faked.
- [x] Governed metrics catalog (Section 29) — new `packages/metrics`
      package: shared pure functions for every metric formula complex
      enough to risk drift (client margin, all five Client Health Score
      penalty formulas), now the single real definition imported by
      both `apps/web`'s profitability service and `apps/worker`'s
      health-score job (previously duplicated inline in each). A new
      `/metrics` page documents every catalogued metric's formula,
      unit, and source. Explicit scope boundary in
      `docs/specs/metrics-catalog.md`: revenue/expense sums are
      catalogued but not function-governed (a one-line aggregation
      query isn't worth the `@cedar/db` coupling a shared function
      would need); ROAS, CPA, and utilization have no entry at all —
      no connector or time-tracking data exists yet to compute them
      from, and a definition for a number that doesn't exist would be
      fabrication.
- [x] AI Business Advisor (Section 16.2) — `getBusinessAdvisorBriefing`
      combines six real signals into one CEO Dashboard briefing:
      unprofitable engagements, cost leakage by expense category, strong
      services (correlated with actually-profitable clients), team
      capacity risks (open/overdue task load per member), collection
      risks (overdue unpaid invoices), and an org-wide rollup of
      Opportunity Engine gaps. An optional AI narrative
      (`generateBusinessAdvisorNarrative`, same live/stub pattern as
      Cedar Command Center) restates the data in prose when
      `ANTHROPIC_API_KEY` is set, under an explicit instruction never to
      add a number or claim beyond what was computed; the underlying
      lists always render regardless, so nothing is unverifiable.
      Explicit scope boundary in `docs/specs/business-advisor.md`:
      capacity risk is a coarse task-count proxy (no time-tracking/
      effort model exists), cost leakage identifies the largest category
      but not root cause, and no signal here uses trend data.
- [x] Campaign-level profitability attribution (Section 4.2/16 Phase 5)
      — new `Expense.campaignId` (optional FK to `Campaign`), validated
      by `createExpense` against the given `projectId` (not just the
      organization), mirroring the project-belongs-to-client check one
      level deeper. Deliberately cost-only, no `Invoice.campaignId`:
      this agency invoices at the project/retainer level, not per
      campaign, so there is no campaign-level revenue to attribute —
      confirmed by checking how `Campaign.budgetCents` is used before
      building anything. New `getCampaignProfitability(projectId)`
      compares each campaign's real actual spend against
      `Campaign.budgetCents`'s pre-existing manual estimate (the
      "reconciled actual spend" this bullet used to name as missing),
      reporting the difference as a variance, `null` when no budget was
      ever set — with an "unassigned" bucket for project-level expenses
      not tagged to any specific campaign. UI: `AddExpenseForm` gained
      an optional campaign picker, shown only once a project is chosen
      and scoped to that project's own campaigns; the campaign detail
      page gained a real Profitability card (budget/actual spend/
      variance). Verified live: created a real expense against the
      seeded "FastCharge 65W Launch" campaign via the running server's
      API, cross-checked in Postgres, and drove a real headless browser
      to confirm the campaign detail page's Profitability card and the
      expense form's campaign picker both render correctly with no
      layout issues; all inserted rows cleaned up afterward. Explicit
      scope boundary in `docs/specs/profitability.md`: service-level
      attribution still needs a billable line-item model on invoices,
      `Client.services` today is just a tag list — deferred with
      reasons given, not faked.

Phase 5's concretely buildable scope is now complete.

## Phase 6 — Advanced Intelligence: **starter slice exists**

- [x] Client Memory (Section 6.6) — `getRecentCedarBrainActivityForClient`
      is the first thing that reads `CedarBrainRequest` history back
      (previously "nothing reads it back yet," per this file's own
      prior wording and ADR-007). A client's past successful Cedar
      Brain answers now feed into governed context retrieval for that
      client's next request, and a "Cedar Brain Activity" card on
      the client profile page shows the real history (including
      failures, for human visibility). A follow-up slice closed this
      module's own explicitly-named next increment: a prior answer a
      human reviewer already flagged incorrect (Section 6.3's AI
      Supervisor) is now excluded from the model-facing context too,
      not just failed requests — respecting a human's explicit signal
      without the system forming any judgment of its own. The client
      profile card gained a matching "flagged incorrect" badge.
      Verified live: flagged a real Cedar Brain request through the
      running server, confirmed a subsequent request's `contextSources`
      correctly omitted it even though it had succeeded and had real
      content. See `docs/specs/client-memory.md` for exactly why this
      is real Client Memory and explicitly not yet Agency Memory: no
      curation, no cross-client pattern extraction, no outcome
      measurement — one client's own history, read back verbatim,
      filtered only by what a human already said about it.
- [ ] Success Library, Living/Market Intelligence, Digital Twin — still
      not started. Success Library (Section 6.6: "High-performing
      campaigns/creatives plus context, metrics, and why they may have
      worked. Only after measurable outcome and review") needs real
      campaign performance data this system doesn't have — no
      `PerformanceSnapshot` model exists, and no live ad-platform
      connector (Phase 4, OAuth-blocked) feeds one; building it now would
      mean fabricating the "measurable outcome" the Bible itself requires.
      Living/Market Intelligence (Section 6.5: "Ingest legitimate public,
      licensed, or authorized market knowledge... Never treat unverified
      market content as canonical client truth") needs a real, licensed
      external ingestion source this environment has no legitimate access
      to; a schema with nothing real to populate it would be exactly the
      unused scaffolding this project's discipline forbids. Digital Twin
      is never elaborated anywhere else in the Bible beyond being named in
      this same list — there's no concrete requirement to build against.
      **Agency Memory, Cedar Decision Engine, Cedar Intelligence,
      Innovation Lab, Experience Engine, and the Knowledge Graph query
      layer all now have real bounded first cuts** — see Phase 1's
      "Cedar Decision Engine v1," "Cedar Innovation Lab v1," "Cedar
      Experience Engine v1," "Cedar Knowledge Promotion v1," and
      "Knowledge Graph v1" entries. None of these are their full Bible
      scope (no cross-client pattern extraction beyond one meeting-
      decision source, no graph database, no semantic/vector retrieval,
      no promoted-knowledge wiring into Cedar Brain's own context yet) —
      each entry names exactly what's still missing and why.

## Phase 7 — Scale Hardening: started

Load/performance testing toward 100 employees/500 clients, data
lifecycle, advanced recovery, connector scaling, media pipeline
optimization, security review, disaster recovery exercises, operational
SLOs.

- [x] **CEO Dashboard aggregate queries.** The dashboard's four
      organization-wide numbers (revenue, outstanding, expenses, active
      vs. total clients) were computed by fetching *every* client,
      invoice, and expense row the organization has ever created into
      Node and reducing over them in JavaScript — a full-table scan on
      every single dashboard load, growing without bound as the
      organization accumulates history. Replaced with `prisma.count()`
      and `prisma.aggregate({ _sum })` calls, which push the same
      computation into Postgres and return only the four numbers
      needed. Verified byte-identical output against the pre-existing
      seed data via direct SQL cross-check (see
      `docs/specs/dashboard-aggregates.md`). Also found and fixed a
      real pre-existing cross-tenant bug while touching this code: the
      "Pending approvals" stat's `prisma.creative.count()` had no
      organization scoping at all, so it counted `PENDING_APPROVAL`
      creatives across *every organization in the database*, not just
      the current one — confirmed as a real leak (not just theoretical)
      because the dev database has two organizations. Now scoped
      through `campaign.project.client.organizationId`. See
      `docs/specs/dashboard-aggregates.md` for full detail, including
      what this slice explicitly did *not* fix (deferred, not
      forgotten): the client-detail page's six unbounded nested lists,
      the Opportunity Engine's full-organization creative scan, the
      clients list page, the content calendar, the Client Portal, the
      shoots page, and several asset-picker dropdowns — each a real,
      separately-scoped follow-up, ranked in that doc by the audit that
      found them.
- [x] **Client detail page pagination.** The highest-ranked item from
      that same audit: the client detail page's single query nested six
      unbounded relations (`projects`, `invoices`, `expenses`, `notes`,
      `timelineEvents`, `assets`), plus fetched full `campaigns`/`tasks`
      rows per project just to display their counts. Added a real
      pagination service (`client-relations-service.ts`, offset
      pagination, page size 20) backing six new "View all" pages
      (`/clients/[id]/{invoices,expenses,notes,timeline,files,projects}`);
      the overview page now bounds each relation to 10 most-recent rows
      via `take` + `_count` and only shows a "View all" link when
      there's actually more. Campaign/task counts switched to
      `_count.select` instead of fetching full arrays. Verified against
      real Postgres with 9 new integration tests plus a live smoke test
      that inserted 27 real invoice rows for the seeded demo client and
      confirmed page 1/page 2 split exactly 20/7 with zero overlap and
      correctly-disabled boundary links — see
      `docs/specs/client-relations-pagination.md`, including what's
      still open (Opportunity Engine, clients list, content calendar,
      Client Portal, shoots page, asset pickers — unchanged by this
      slice).
- [x] **Opportunity Engine full-organization creative scan.** The
      creative-format-gap signal fetched every creative row for every
      other client in the organization on every client detail page
      load, just to count distinct peer clients per format in
      JavaScript. Own-format history had the same shape. Rewrote the
      peer-format count as a single Postgres `GROUP BY` via
      `prisma.$queryRaw` (parameterized, no injection surface) and the
      own-format query to `distinct: ["type"]` — same output, but data
      transfer now scales with the number of distinct format values in
      use (a handful) instead of the organization's entire creative
      history. All 5 existing tests (including the one proving distinct
      peer *clients*, not distinct creatives, are counted) passed
      unchanged against the rewrite; added 1 new test exercising
      multiple peers across multiple formats in one call. Verified live
      against the seeded dev database with a direct-SQL cross-check —
      see `docs/specs/opportunity-engine-scaling.md`, including why the
      service-gap signal (a JSON-string `services` column, not `jsonb`)
      was deliberately left as-is rather than force-fit into SQL.
- [x] **Clients list page pagination.** The org-wide clients list
      fetched every readable client on every load — unbounded against
      the Bible's own 500-client scale target — plus fully included
      `projects` and `brandProfile` just to display a count and a
      truthiness check. Added the same `PAGE_SIZE=24` offset pagination
      shape used by the client detail page slice (same shared
      `Pagination` component), switched to `_count.select` for the
      project count and a `select`-scoped `brandProfile: { id: true }`
      instead of the full record. Section 38's scoped-collaborator
      filter is unchanged and still applied inside the same `where`.
      Verified live against the seeded dev database: inserted 30
      temporary clients (31 total), confirmed page 1/page 2 split
      exactly 24/7 with correct boundary links, cross-checked against
      `select count(*)` — see `docs/specs/clients-list-pagination.md`.
- [x] **Content Calendar pagination.** The per-client content calendar
      table fetched every scheduling item a client has ever had,
      unbounded across months and years of ongoing content production.
      Same `PAGE_SIZE=20` offset pagination shape as the two prior
      list-pagination slices. The New Content Item form's
      campaign/creative/member dropdowns are deliberately left
      unbounded — they're the audit's separate "asset-picker dropdowns"
      item, needing a real search-as-you-type redesign rather than a
      one-line pagination change, so folding them in here would have
      been scope creep. Verified live against the seeded dev database:
      inserted 25 temporary items, confirmed page 1/page 2 split
      exactly 20/5 — see `docs/specs/content-calendar-pagination.md`.
- [x] **Client Portal pagination.** The audit's own highest-flagged
      customer-visible-latency item: the external-facing Client Portal
      fetched every pending-or-approved creative, every invoice, and
      every available asset for a client on every load. Approved
      history, invoices, and files each got the bounded-preview +
      "View all" page pattern (three new pages, `PAGE_SIZE=20`);
      "Pending your review" got a defensive `take` cap instead of a
      "view all" page, since it's a work queue meant to reach zero, not
      a growing archive — building pagination UI for a backlog that
      shouldn't exist would have been solving the wrong problem. Every
      new page independently re-checks `clients:read` rather than
      trusting the parent page. Verified live against the seeded dev
      database: inserted 15 approved creatives / 15 invoices / 15
      assets, confirmed correct "View all" counts, then pushed invoices
      to 22 total and confirmed the new invoices page split exactly
      20/2 — see `docs/specs/client-portal-pagination.md`.
- [x] **Shoots page pagination.** The per-client production shoots list
      fetched every shoot ever scheduled, unbounded — same shape as the
      content calendar fix. Same `PAGE_SIZE=20` pattern. Verified live
      against the seeded dev database: inserted 24 temporary shoots,
      confirmed page 1/page 2 split exactly 20/4 — see
      `docs/specs/shoots-pagination.md`.
- [x] **Search-as-you-type asset picker.** The last remaining ranked
      item from the Phase 7 audit — the one item that explicitly needed
      a real UX redesign, not a pagination change. The "Add new
      version" form's asset dropdown loaded every one of a client's
      files into a plain `<select>`; replaced with a real
      search-as-you-type picker (`searchClientAssets()`, a bounded
      10-result `filename contains` search; `GET
      /api/clients/[id]/assets/search`; a new `AssetPicker.tsx`
      component with debounced fetch and click-to-select). The page's
      unbounded `findMany` was removed entirely rather than merely
      bounded — a picker fetches on demand, so there's no preview list
      to maintain at all. Verified with 5 new route-contract tests plus
      a live smoke test at both the HTTP and real-browser level
      (Playwright): typed "hero" into the actual picker on a real
      creative's page, confirmed the dropdown showed exactly the
      matching file, clicked it, confirmed the UI updated — see
      `docs/specs/asset-picker-search.md`, including why this is
      representative (the one asset picker in the app) rather than an
      exhaustive sweep for every possible unbounded dropdown. **This
      closes every ranked item from the Phase 7 scale-hardening audit.**

## Cross-cutting gaps worth tracking regardless of phase

- **Integration tests exist for Identity & Access** (`apps/web/src/lib/services/identity.integration.test.ts`,
  8 tests against a real dedicated Postgres database — bootstrap, login,
  full invite→accept→scope-grant flow, last-owner protection).
- **A real browser-driven E2E layer now exists** (Bible Section 32's
  "End-to-end" row) — `tests/e2e/` (Playwright/Chromium): login →
  protected page → logout; the fuller invite → accept → real
  RBAC-scoped session flow; Section 15.1's approval workflow (create a
  creative → request approval → record a real decision, asserting the
  status badge itself transitions DRAFT → PENDING_APPROVAL → APPROVED);
  Section 15.2's Client Portal (an invited external contact's session
  is redirected away from the internal app on *every* direct navigation
  attempt, not just at first login); and Section 23.1's MFA (enrolls a
  real TOTP secret via `/security`, computes a valid code with `otplib`
  against the secret the page displays, then proves via a real logout/
  login that the account is actually challenged on its next login, not
  just that enrollment succeeded); and Section 9's Content Calendar
  (creates a content item and moves it through two real, server-
  validated transitions, BRIEF → DRAFT → INTERNAL_REVIEW). All navigate
  by real link text so they survive a fresh `db:reset` generating new
  ids every run. Run via `npm run test:e2e` against a production build
  with the dev database reset to a known seeded state first. See
  `tests/e2e/README.md` for a real dev-server-only flakiness finding
  this work surfaced (fixed by building/starting, not `next dev`) —
  every flow originally named as a gap here now has coverage; what's
  left is depth (more permutations), not breadth.
- **API-contract tests now exist for every route handler in the app**
  (`apps/web/src/app/api/**/*.route.contract.test.ts`, 165 tests
  across all 40 routes, up from an initial 6) — the HTTP layer
  itself (auth gate, status codes, JSON envelope), not just the
  service functions underneath, which were already integration-tested.
  See `docs/specs/api-route-contracts.md` for exactly which routes and
  why. The first batch found and fixed two real bugs: `/api/expenses`
  and `/api/invoices` both misreported `amountCents: 0` as "missing"
  instead of reaching the real "must be a positive number" validation,
  because their pre-checks used a truthy check instead of a type
  check. A second slice added `/api/auth/login` (the one route that
  creates the session itself, so it mocks `next/headers` rather than
  `getCurrentActor`), the three notification routes (ownership gated
  per-membership rather than by role permission), and the
  content-calendar/shoot status-transition routes. A third slice
  added the four MFA routes (real `otplib`-generated TOTP codes
  against a real encrypted secret, not a stub), `/api/invite/[token]/accept`
  (the other no-session route, verified with a live end-to-end
  invite→accept smoke test), and `/api/search` (proving
  `getReadableClientIds` actually filters results for a scoped
  collaborator, not just gates access). A fourth slice added the nine
  `clients:write`-gated CRUD create routes (campaign, creative,
  creative version, video brief, project, task, shoot, content item,
  brand version) — surfacing a real pattern worth documenting: every
  one of these services checks `requirePermission` *before* verifying
  the parent id belongs to the caller's org, so a cross-org id from an
  `OWNER` (whose role check never touches the database) is caught by
  the second check and returns 400, not 403 — plus the three routes
  that write to real file storage (`/api/clients/[id]/assets`,
  `/api/assets/[id]` delete, `/api/assets/[id]/download`, reusing the
  `process.cwd()`-monkeypatch trick from
  `asset-service.integration.test.ts` to stay hermetic) and the one
  `organization:manage`-gated pair
  (`/api/integrations/connections`/`/revoke`, distinct from
  `clients:write` everywhere else). Verified live end-to-end: created a
  real project→campaign→creative→version chain, uploaded and confirmed
  a real file on disk, created and revoked a real connection, all
  cross-checked via SQL and fully cleaned up afterward. A fifth and
  final slice closed the last four routes: `/api/auth/bootstrap` (the
  third no-session route, gated on an entirely-empty `organizations`
  table rather than a token — its own test wipes to a genuinely empty
  database rather than seeding one), `/api/cedar-brain/[id]/flag` (the
  one write route gated by nothing more than active membership — no
  `clients:write`, no `organization:manage`), and
  `/api/invoices/[id]/send`/`/mark-paid` (the last two state-machine
  transitions, `DRAFT → SENT → PAID`). Verified live: rejected a real
  bootstrap attempt against the non-empty dev database with the
  correct message, sent and marked a real invoice paid, triggered and
  flagged a real (stub-mode) Cedar Brain request — cross-checked via
  SQL and cleaned up. **API route-contract coverage is now complete:
  40 of 40 routes.**
- **Known residual dependency vulnerability:** Next.js's own bundled
  PostCSS carries a moderate/high-severity advisory range that only
  resolves by upgrading to Next 16, which currently fails to build in
  this npm-workspaces layout for reasons unrelated to our code (see
  ADR-001). Accepted as low real-world risk (build-time only, no
  untrusted CSS input) — revisit when a Next 16 patch fixes the build
  issue upstream.

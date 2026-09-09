# Module: Multi-Factor Authentication

Status: **Implemented (Phase 0 slice, plus two follow-up enforcement
slices)**. Bible reference: Section 23.1 ("MFA for privileged users").
Closes the gap tracked in ADR-006 since this system's first
authentication design.

## Purpose

TOTP-based two-factor authentication a user enrolls into from their own
account settings — an authenticator app code (or a one-time recovery
code) is required to complete login once enabled, on top of the
password. A follow-up slice added the enforcement half: an organization
can require OWNER/ADMIN members to actually enroll, not merely offer it.

## Scope boundary — stated explicitly

The original slice was **per-user opt-in only**, with an explicitly named
gap: "does not yet force OWNER/ADMIN accounts to enroll (no 'your role
requires MFA, please enroll' gate exists)." That gate is now built — see
"Enforcement policy" below. A second follow-up slice closed the gap that
first enforcement slice explicitly named as still open: a hard API-level
block, not just a page-navigation redirect — see "What the gate does and
doesn't cover" below for what's enforced now and "Real security boundary
(second enforcement slice)" for how. What's still explicitly not built:
WebAuthn/security-key support (Section 23.1 also allows for it, but
nothing here needed it to make either enforcement gate real); a per-role
configurable policy (today it's a single organization-wide boolean
covering exactly OWNER and ADMIN — see the rationale in
`packages/domain/src/roles.ts`'s doc comment on `MFA_PRIVILEGED_ROLES`
for why a data-driven per-role policy table wasn't built for a two-role
list); and server actions (`apps/web/src/lib/actions/*.ts`) still don't
catch `AuthorizationError`/`MfaRequiredError` themselves — a pre-existing
gap this slice did not fix, named explicitly below rather than left
silent. A later, separately-scoped slice (`docs/specs/error-boundaries.md`)
added a real app-wide `error.tsx` boundary, so an uncaught
`MfaRequiredError` from a server action now shows a friendly fallback
instead of crashing the whole page — a real improvement, but not the
same thing as the action catching it and returning an inline message;
that retrofit remains unbuilt.

## Enforcement policy

- **`Organization.mfaRequiredForPrivilegedRoles`** (boolean, default
  `false` — no existing organization is silently locked out by a
  migration). An owner or admin (`organization:manage`, the same
  permission tier as the AI Budget and Integration Center org-wide
  toggles) turns it on from a new "Security policy" card on `/team`,
  via `mfa-policy-service.ts`'s `setMfaRequiredForPrivilegedRoles` /
  `POST /api/mfa-policy`. Recorded as `mfa_policy.updated` in the audit
  log.
- **`isMfaEnrollmentRequired(actor)`** is the actual gate check: true
  only when all three hold — the actor's *role* is OWNER or ADMIN
  (`MFA_PRIVILEGED_ROLES`, checked by role identity, not by whether the
  actor happens to hold `organization:manage` via a `ScopedGrant` — kept
  intentionally simple for a two-role list), the organization has the
  policy on, and this specific user hasn't enrolled
  (`User.mfaEnabled === false`). A user who already enrolled is never
  re-gated even if the org turns the policy on later.
- **Where it's enforced**: `(app)/layout.tsx` — the shared shell every
  internal page renders through — calls `isMfaEnrollmentRequired` right
  after resolving the actor and, if true, `redirect()`s to
  `/security?mfaRequired=1` for every page except `/security` itself
  (which is how the gated user actually enrolls). `/security` is
  recognized by the real request pathname, not a route-group assumption
  — a new `apps/web/src/middleware.ts` forwards `x-pathname` via
  `next/headers` for exactly this purpose; the middleware does no auth
  work itself (no cookies, no database), keeping the real gate decision
  in the same Server Component code path as everything else in
  `AppLayout` rather than splitting auth logic across an Edge boundary.
  `/security`'s own page independently recomputes the same check (rather
  than trusting the `?mfaRequired=1` query hint) so a direct visit or a
  bookmark still shows the correct banner.
- **What the gate does and doesn't cover**: it blocks *page navigation*
  — every internal page redirects a gated user back to `/security`,
  where they can still see the sidebar (including "Log out", so they're
  never trapped) and nothing else. This UX gate never was, and still
  isn't, the real security boundary — see the next section for that.

### Real security boundary (second enforcement slice)

The first enforcement slice above was explicit that it left one gap
open: `requireActor()`'s redirect only stops *page navigation*. A user
with an already-valid session cookie could call any mutating API route
directly (`curl`/`fetch` straight to `POST /api/expenses`, say) and the
policy was never even consulted — API routes authorize independently via
`getCurrentActor()` + `requirePermission()`/`requireAnyPermission()`, and
neither of those touched the MFA policy at all.

This slice closes that gap at the actual choke point instead of adding a
second copy of the page-guard logic to every route: `packages/auth`'s
`requirePermission()` and `requireAnyPermission()` — the functions this
file's own doc comments already say to "use at the top of every mutating
server action / API route handler" (Section 35.1) — now throw a new
`MfaRequiredError` when all three hold: the permission check the caller
asked for already passed, the actor's role is privileged
(`MFA_PRIVILEGED_ROLES`, now canonically defined in
`packages/domain/src/roles.ts` rather than duplicated in
`mfa-policy-service.ts` — both `@cedar/auth` and `apps/web` need the same
list, so domain is the correct shared home), the organization's
`mfaRequiredForPrivilegedRoles` policy is on, and this specific user
hasn't enrolled. Because `loadActorAndGrants` already does one
`prisma.membership.findUnique` per authorization call, the gate costs
nothing extra beyond two more `select`-scoped fields
(`organization.mfaRequiredForPrivilegedRoles`, `user.mfaEnabled`) on a
query that was already happening — no second round trip.

**Why the permission check still runs first.** `checkMfaGate` is only
called *after* `can()` already returned true. An actor who isn't
authorized for the action at all still gets a plain `AuthorizationError`
— never `MfaRequiredError` — even when that actor's role would otherwise
be MFA-gated. Checking permission first means an unauthorized caller
never learns anything about the organization's MFA policy or their own
enrollment state from the shape of the error; ordering the checks the
other way would leak that signal to someone who was never going to be
allowed to perform the action regardless. Proven directly:
`authorize.integration.test.ts`'s "still throws plain AuthorizationError
... when the actor isn't authorized at all" case.

**Why `requirePermission`/`requireAnyPermission` and not
`isAuthorized`/`isAuthorizedAny`.** The latter two are documented,
pre-existing read-branching helpers — they return a boolean for a UI
conditional to check ("should this button render"), never throw, and
have call sites across the app that already expect a plain boolean.
Making them throw would break every one of those call sites for a
concern (must-enroll-to-mutate) that a read-only UI branch was never
responsible for enforcing in the first place — the security boundary
belongs at the point that actually authorizes a *write*, which is
exactly what `requirePermission`/`requireAnyPermission` are for. Both
functions' own doc comments already establish this distinction; this
slice's `checkMfaGate` doc comment restates it at the point the gate is
added, and deliberately isn't wired into either read-branching helper.

Every one of the 38 API route files that already catches
`AuthorizationError` now also catches `MfaRequiredError` and maps it to
the same HTTP 403, with the message "MFA enrollment is required for this
account before this action can be performed." (mechanical, per-file
branch — matching this codebase's established convention of not
introducing a shared error-mapping abstraction across routes, the same
convention `AuthorizationError` handling itself followed when it was
added). **Not covered**: `apps/web/src/lib/actions/*.ts` server actions
don't catch `AuthorizationError` at all today, so an uncaught
`MfaRequiredError` from one propagates the same (uncaught) way an
uncaught `AuthorizationError` already did — a pre-existing gap, not one
this slice introduced or was scoped to fix.

**A real, correct consequence worth naming explicitly**: because the
gate applies to *every* `requirePermission`/`requireAnyPermission` call
including `setMfaRequiredForPrivilegedRoles` itself (which is gated on
`organization:manage`), an unenrolled OWNER/ADMIN who turns the policy
on can no longer turn it back off themselves via the API until they
enroll — they must either complete enrollment (the intended, and only,
path back), or have a different already-enrolled OWNER/ADMIN do it. This
surfaced immediately as a real behavior change in this slice's own live
smoke test (see below) and in two pre-existing test files
(`mfa-policy-service.integration.test.ts`,
`app/api/mfa-policy/route.contract.test.ts`) whose fixtures previously
used unenrolled OWNER/ADMIN actors to toggle the policy back off — both
fixed by enrolling those specific fixtures, since those files test
`mfa-policy-service.ts`'s own logic, not the gate itself. This is not a
lockout of the organization (any other enrolled privileged member, or
the same member after enrolling, can always turn it off) — it's the
gate correctly refusing to treat "manage the org's own MFA requirement"
as an exception to the org's own MFA requirement.

## Entities

| Model | Notes |
|---|---|
| `User.mfaSecretEncrypted` | AES-256-GCM ciphertext (`iv:authTag:ciphertext`, hex). Set the moment enrollment *starts*; `User.mfaEnabled` only flips to `true` once the user proves possession of it with a real code — an abandoned enrollment attempt can never silently lock an account into a broken MFA state. |
| `MfaRecoveryCode` | One-time codes, hashed (`codeHash`, same sha256 hash-then-compare pattern as `Session`/`Invitation` tokens) — plaintext is only ever returned once, from `confirmMfaEnrollment`. Regenerating (re-enrolling after a disable) replaces the whole batch. |
| `PendingMfaLogin` | The gap between "password verified" and "session issued." 5-minute TTL, single-use, deleted the moment its challenge succeeds. Holds nothing more sensitive than which user's login is pending — the password has already been checked by the time this row exists. |

## Cryptography

- **TOTP**: `otplib`'s `authenticator` (RFC 6238, SHA1/30s/6-digit,
  ±1 step window for clock drift) — `packages/auth/src/mfa.ts`.
- **Secret encryption at rest** (Section 23.1: "sensitive secrets stored
  outside application source/database plaintext"): AES-256-GCM with a
  key derived from the existing `SESSION_SECRET` via `scrypt` with a
  fixed, distinct salt (`"cedar-mfa-encryption-v1"`) — key separation
  from that secret's session-token-signing use, without requiring a
  second secret to generate, rotate, and deploy. Encrypting with a
  random IV per secret and an authenticated cipher (GCM) means two
  users' identical TOTP secrets (astronomically unlikely, but still)
  never produce identical ciphertext.
- **Recovery codes**: 10 codes per batch, format `XXXXX-XXXXX` (10 hex
  characters from `crypto.randomBytes(5)`, uppercased, hyphenated for
  readability), stored only as a sha256 hash.

## The login flow

1. `login()` (`auth-service.ts`) verifies the password as always. If
   `user.mfaEnabled` is `false`, nothing changes from before this slice —
   a session is created immediately.
2. If `true`, **no session is created**. A `PendingMfaLogin` row is
   created and its raw token returned as `pendingToken`. This is the
   one property that makes the whole feature meaningful: password
   verification alone must never be enough once MFA is on.
3. The client submits `{ pendingToken, code }` to
   `POST /api/auth/mfa/challenge`. `completeMfaLogin` tries the code as a
   TOTP first, then as an unused recovery code. On success: the
   recovery code (if used) is marked used, the `PendingMfaLogin` row is
   deleted, and a real session is created exactly as `login()` would
   have done directly.
4. A wrong code leaves the `PendingMfaLogin` row intact — a mistyped
   code doesn't burn the attempt, only its own 5-minute window does.

## Enrollment flow

1. `POST /api/auth/mfa/setup` (caller's own account only — this endpoint
   never takes a target user ID) generates a secret, encrypts and stores
   it, and returns the plaintext secret, its `otpauth://` URI, and a QR
   code as a data URL (rendered server-side with `qrcode`).
2. `POST /api/auth/mfa/confirm` with a real code from the app: verifies
   it against the stored (decrypted) secret, flips `mfaEnabled` to
   `true`, and issues 10 recovery codes — the only time they're ever
   returned in plaintext.
3. `POST /api/auth/mfa/disable` requires the current password (never
   just a click while already signed in) — clears the secret and every
   recovery code.

## Permissions

Every MFA endpoint operates on `getCurrentActor()`'s own `user.id` — none
of them accept a target user ID, so there is no cross-account MFA
management surface to authorize in the first place (Section 23.1's
"least-privilege" principle applied by construction, not by a permission
check).

## Events

`mfa.enabled`, `mfa.disabled` (audit). `session.created`'s existing audit
event now carries `changeSet.mfaMethod` (`"totp"` or `"recovery_code"`)
when a login completed via the MFA challenge.

## UI

- `/login`'s form gains a second step: once the server reports
  `mfaRequired`, it swaps to a single code field wired to
  `/api/auth/mfa/challenge`.
- `/security` — a new personal settings page linked from the app
  sidebar. Shows an "Enable two-factor authentication" flow (QR code +
  manual-entry secret + confirmation code, then a one-time recovery-code
  reveal) when MFA is off, or a password-gated "Disable" control when
  it's on. Now also shows an amber banner ("Your organization requires
  two-factor authentication for your role...") when the enforcement gate
  applies to this user.
- `/team` — a new "Security policy" card (visible to everyone who can
  see the page, editable only by `organization:manage` holders) states
  the current policy in plain language and, for an owner/admin, a toggle
  button to turn it on or off.

## Failure modes

- **Wrong code during enrollment confirmation**: rejected, secret stays
  pending (unconfirmed) — the user can retry with a fresh code.
- **Wrong code during login challenge**: rejected, `PendingMfaLogin` row
  untouched — retriable until its own TTL expires.
- **Expired pending login**: rejected with a clear "log in again"
  message rather than a generic error.
- **Reused recovery code**: rejected — `usedAt` is checked, and marking
  it used happens in the same transaction as deleting the consumed
  `PendingMfaLogin` row.
- **Re-enrolling while already enabled**: rejected — must disable first,
  which requires the password.
- **Wrong password on disable**: rejected — MFA cannot be turned off by
  someone who merely has an active session (e.g. an unattended machine).

## Acceptance tests

- `apps/web/src/lib/services/mfa.integration.test.ts` — 11 tests against
  real Postgres: enrollment starts without enabling MFA, wrong
  confirmation codes are rejected, a correct code enables MFA and issues
  10 unique recovery codes, re-enrollment while enabled is refused,
  `login()` returns a pending challenge (no session) once MFA is
  enabled, a wrong challenge code is rejected without consuming the
  pending login, an expired pending login is rejected, a valid recovery
  code completes login and cannot be reused while a fresh one still
  works, a valid TOTP code completes login and consumes its pending
  login row, and `disableMfa` requires the correct password and fully
  clears state (subsequent login needs no challenge).
- Manual smoke test performed for this slice against the real running
  server: logged in, started enrollment, computed a valid TOTP code for
  the returned secret independently, confirmed enrollment and received
  10 recovery codes, logged in again and confirmed the internal
  `/dashboard` route was inaccessible before completing the challenge
  (redirected to `/login`), confirmed a wrong code was rejected, a valid
  recovery code completed the login and granted dashboard access,
  confirmed the same recovery code was rejected on reuse, confirmed the
  `/security` page correctly showed the "enabled" state, and confirmed
  disabling with an incorrect password was rejected while the correct
  password disabled it and removed the login challenge entirely.

### Enforcement slice (`mfa-policy-service.ts`)

- `apps/web/src/lib/services/mfa-policy-service.integration.test.ts` —
  11 tests against real Postgres: `getMfaPolicy` defaults to `false` for
  a brand-new organization; `setMfaRequiredForPrivilegedRoles` rejects a
  member without `organization:manage` (`AuthorizationError`) and a
  non-boolean `required` (`AuthError`); a real owner turns the policy on
  and it persists (cross-checked with a second `getMfaPolicy` read) with
  a real `mfa_policy.updated` audit event recorded against the
  organization; a second, unrelated organization's policy is untouched;
  an ADMIN (who also holds `organization:manage`) can turn it back off;
  `isMfaEnrollmentRequired` is false for everyone while the policy is
  off, true for an unenrolled OWNER and an unenrolled ADMIN once it's
  on, false again the moment `mfaEnabled` is true even with the policy
  on, and false for a non-privileged role (`DESIGNER`) regardless of the
  policy.
- `apps/web/src/app/api/mfa-policy/route.contract.test.ts` — 5 tests:
  401 with no session, 400 for a non-boolean `required`, 403 for a
  member without `organization:manage`, 200 that persists the policy to
  a real `Organization` row (checked both ways: turning it on, then back
  off).
- Live smoke test against the real running server (dev database, both
  HTTP and a real headless-Chromium browser): logged in as the seeded
  owner (who starts with MFA off and the org policy off, confirmed via
  `psql`), turned the org policy on via `POST /api/mfa-policy`,
  navigated to `/clients` in a real browser and confirmed a real 307
  redirect to `/security?mfaRequired=1` with the warning banner
  rendered and the sidebar (including "Team & Permissions" and "Log
  out") still fully intact — screenshotted to confirm no layout
  regression, unlike the two real bugs live testing caught in the
  Section 12 slices. Completed a real enrollment through the UI (secret
  displayed by the page, a real TOTP code computed with `otplib` against
  it, confirmed), then confirmed the gate actually lifted: navigating to
  `/clients` immediately afterward rendered the page instead of
  redirecting. Cleanup was done entirely through real flows, not direct
  database writes: logged back in through the real MFA challenge
  (decrypting the stored secret with the same `SESSION_SECRET`-derived
  key `mfa-service.ts` uses, to compute the login code), disabled MFA
  through the real password-gated `/security` control, and turned the
  org policy back off via the API — final state cross-checked with
  `psql`: both organizations' `mfaRequiredForPrivilegedRoles` back to
  `false`, the owner's `mfaEnabled` back to `false` with no stored
  secret and zero recovery-code rows, and a real four-event audit trail
  (`mfa_policy.updated` → `mfa.enabled` → `mfa.disabled` →
  `mfa_policy.updated`) documenting the whole cycle. This same pass also
  found and cleaned up unrelated pre-existing debris from earlier
  slices' smoke tests: 20 `ClientTimelineEvent` rows referencing
  already-deleted "SMOKE TEST"-named projects/tasks/templates that a
  prior slice's cleanup had missed (the projects/tasks/templates
  themselves were already gone — only their derived timeline-event text
  survived).

### Real security boundary slice (`packages/auth/src/authorize.ts`)

- `packages/auth/src/authorize.integration.test.ts` — new, 9 tests
  against real Postgres (this package had no integration test file
  before this slice — added `packages/auth/vitest.config.ts`, same
  dedicated-`cedarpoint_test`-database pin as `apps/web/vitest.config.ts`):
  an unenrolled OWNER in an MFA-gated organization gets `MfaRequiredError`
  from `requirePermission` even though the permission itself is allowed;
  the same for an unenrolled ADMIN; an enrolled OWNER passes; the same
  OWNER passes in a second organization where the policy is off (proving
  the policy is read per-organization, not cached on the user); a
  non-privileged role (`FINANCE`) is never gated regardless of the
  policy; a `REVOKED` OWNER membership — a real case where the actor
  would otherwise be MFA-gated but the permission check itself fails
  first — gets plain `AuthorizationError`, never `MfaRequiredError`
  (OWNER/ADMIN hold every permission in this catalog by role identity
  alone, so a revoked/invalid membership is the only real way to make a
  privileged role fail the permission check, per `can()`'s own rules);
  and the same four gate/pass/non-privileged/permission-wins-first
  shapes repeated against `requireAnyPermission`.
- Extended 3 existing route-contract test files with real HTTP-level MFA
  gate coverage (seeding a second, MFA-gated organization alongside each
  file's existing fixtures, per file — not a shared helper, matching this
  suite's per-file convention): `apps/web/src/app/api/expenses/route.contract.test.ts`
  (+2 tests: an unenrolled OWNER gets a real 403 with the MFA-required
  message, an enrolled OWNER in the same gated org still gets 200),
  `apps/web/src/app/api/team/invite/route.contract.test.ts` (+2 tests,
  same shape for an ADMIN calling `members:invite`), and
  `apps/web/src/app/api/milestones/[id]/toggle/route.contract.test.ts`
  (+1 test, the 403 case for an unenrolled OWNER — chosen as a third,
  differently-shaped route to prove the gate isn't specific to
  `POST`-with-a-body handlers).
- Fixed two pre-existing test files whose fixtures broke under the new
  gate — a real, correctly-surfaced consequence of closing the API
  bypass, not a bug in the gate (see "A real, correct consequence worth
  naming explicitly" above): `apps/web/src/lib/services/mfa-policy-service.integration.test.ts`
  and `apps/web/src/app/api/mfa-policy/route.contract.test.ts` both used
  unenrolled OWNER/ADMIN fixtures to turn the policy back off after
  turning it on; both fixed by creating those specific fixtures with
  `mfaEnabled: true`, since both files test `mfa-policy-service.ts`'s /
  the route's own logic, not the `requirePermission` gate itself (that
  has its own dedicated coverage above). All 469 apps/web tests, all 9
  new `packages/auth` tests, and the rest of the monorepo's suite (526
  tests total across 6 workspaces) pass together.
- Live smoke test against the real running server (dev database,
  production build + `npm run start`, real HTTP only — this slice's gap
  was specifically about API calls bypassing the UI, so the smoke test
  proves exactly that path): logged in as the seeded owner via
  `POST /api/auth/login` and kept the resulting session cookie for every
  subsequent call. Confirmed baseline: `POST /api/expenses` with that
  cookie returned 200 while the org's policy was still off. Turned the
  policy on via `POST /api/mfa-policy {"required":true}`, cross-checked
  `mfaRequiredForPrivilegedRoles = true` via `psql`. With the *same*
  still-valid session cookie (no new login, no page ever visited —
  proving this is not the page-navigation redirect), issued
  `curl -b cookies.txt -X POST /api/expenses -d '{"category":"...","amountCents":100}'`
  directly and got a real 403 with
  `{"error":"MFA enrollment is required for this account before this action can be performed."}`
  — the actual gap named in this file's prior scope boundary, now
  closed. Completed real MFA enrollment through the running app
  (`POST /api/auth/mfa/setup`, a real TOTP code computed with `otplib`
  against the returned secret, `POST /api/auth/mfa/confirm`), then
  repeated the identical direct `curl` mutation with the same cookie and
  got a real 200 with a persisted expense id — the gate lifting
  correctly once enrolled, no other regression. Cleanup surfaced the
  "correct consequence" named above in practice: disabling MFA before
  turning the policy back off left the account genuinely unable to turn
  its own policy off (a real 403 on `POST /api/mfa-policy`), so cleanup
  re-enrolled, turned the policy off first, then disabled MFA — the
  correct order, now documented here for anyone reproducing this test.
  Final state cross-checked with `psql`: `mfaRequiredForPrivilegedRoles`
  back to `false`, `mfaEnabled` back to `false` with no stored secret and
  zero recovery-code rows, `expenses` row count back to its pre-test
  value of 2 (the two smoke-test rows and their `expense.created` audit
  events deleted directly, since they were pure test data, not real
  history), and 7 legitimate new audit events left in place
  (`session.created` for the real login, `mfa_policy.updated` x2,
  `mfa.enabled` x2, `mfa.disabled` x2) documenting the real actions this
  test performed — following the precedent the first enforcement slice's
  own smoke test set of keeping the real MFA lifecycle audit trail rather
  than deleting it. Confirmed via `pgrep -fa "next-server|next start"`
  that no server process was left running afterward.

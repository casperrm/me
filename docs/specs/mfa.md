# Module: Multi-Factor Authentication

Status: **Implemented (Phase 0 slice, plus a follow-up enforcement
slice)**. Bible reference: Section 23.1 ("MFA for privileged users").
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
"Enforcement policy" below. What's still explicitly not built:
WebAuthn/security-key support (Section 23.1 also allows for it, but
nothing here needed it to make the enforcement gate real); a per-role
configurable policy (today it's a single organization-wide boolean
covering exactly OWNER and ADMIN — see the rationale in
`mfa-policy-service.ts`'s own doc comment for why a data-driven
per-role policy table wasn't built for a two-role list); and a hard API
block (the gate stops page navigation, not a direct API call made with
a still-valid session — see "What the gate does and doesn't cover"
below).

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
  never trapped) and nothing else. It does **not** block direct API
  calls made with an already-valid session cookie — `requireActor()` (the
  page-guard function the gate lives in) is, by this codebase's own
  existing convention, a page-only tool; API routes authorize
  independently via `getCurrentActor()` + `requirePermission()` and were
  deliberately left unchanged, because gating them too would have broken
  the MFA setup/confirm endpoints a gated user needs to actually enroll.
  This mirrors how the rest of the app already treats "page guard" and
  "API authorization" as two separate layers, not a gap specific to this
  slice.

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

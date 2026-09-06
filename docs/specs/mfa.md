# Module: Multi-Factor Authentication

Status: **Implemented (Phase 0 slice)**. Bible reference: Section 23.1
("MFA for privileged users"). Closes the gap tracked in ADR-006 since
this system's first authentication design.

## Purpose

TOTP-based two-factor authentication a user enrolls into from their own
account settings — an authenticator app code (or a one-time recovery
code) is required to complete login once enabled, on top of the
password.

## Scope boundary — stated explicitly

This is **per-user opt-in**, not mandatory enforcement. Section 23.1 says
"MFA for privileged users"; this slice builds the mechanism any user can
turn on for themselves, but does not yet force OWNER/ADMIN accounts to
enroll (no "your role requires MFA, please enroll" gate exists). That
policy layer — plus WebAuthn/security-key support, which Section 23.1
also allows for — is a reasonable next increment once this mechanism is
in real use, not built here.

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
  it's on.

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

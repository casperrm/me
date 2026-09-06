# ADR-006: Authentication and authorization implementation

- **Status:** Accepted
- **Date:** 2026-09-06

## Context

Bible Section 2.2 requires RBAC plus contextual constraints (role, org,
client, resource, action, sensitivity, approval rule), enforced
server-side. Section 23.1 requires MFA for privileged users, secure
session lifecycle, and device/session revocation. Section 23.2 specifies
the minimum audit event schema.

## Decision

**Authentication:**
- Email + password, hashed with bcrypt (`packages/auth/src/password.ts`,
  cost factor 10). No OAuth/SSO yet — not required by any Phase 0
  acceptance scenario.
- Sessions are server-side rows (`Session` model) referenced by an opaque
  random token; only a SHA-256 hash of the token is stored
  (`packages/auth/src/tokens.ts`), so a database read alone can't produce
  a usable session token. The token lives in an `httpOnly`, `sameSite=lax`
  cookie set by `apps/web`.
- **MFA is not implemented yet.** This is a known gap against Section
  23.1's "MFA for privileged users" — tracked here rather than silently
  skipped. Add TOTP (or WebAuthn) enrollment on `User` before this system
  holds real client data or a second real human user beyond development.

**Authorization:**
- `packages/domain`'s `can()` is the single, pure, framework-free decision
  function (Section 35.1: authorization as first-class application
  policy). It takes an actor's role + status, their explicit
  `ScopedGrant`s, and the requested permission/client, and returns a
  boolean. No I/O, fully unit-testable (see `policy.test.ts`, which
  directly encodes the Section 38 acceptance scenarios).
- `packages/auth`'s `requirePermission`/`isAuthorized` load the actor's
  `Membership` + `ScopedGrant`s from Postgres and call `can()` — this is
  the only place database state and the pure policy function meet.
- **Role → permission defaults are code, not data** (`ROLE_GLOBAL_PERMISSIONS`
  in `packages/domain/src/roles.ts`), with `ScopedGrant` rows layered on
  top for per-client exceptions and for building up a `CUSTOM` role's
  entire permission set. Section 27.2 lists `role_permissions` as a
  representative table for a fully data-driven model; that's deliberately
  not built yet (Section 37 MVP table lists "advanced custom policy
  builder" under Later/Progressive) — today's roles are fixed enough that
  hardcoding defaults is simpler and equally correct, and `ScopedGrant`
  already covers the cases that need to be dynamic.
- Every organization- or client-scoped query filters at the query layer
  using the authenticated actor's `organizationId`/allowed client IDs —
  never "fetch everything, then hide rows in the UI." See
  `apps/web/src/app/(app)/clients/page.tsx` and `[id]/page.tsx` for the
  pattern: the client lookup itself is `WHERE id = ? AND organizationId =
  ?`, so a cross-organization ID guess 404s before any permission check
  even runs.

**Audit:**
- `packages/events`' `emitAuditEvent` implements the Section 23.2 schema
  fields directly, plus a SHA-256 hash chain (`integrityHash`) per
  organization as a lightweight tamper-evidence measure — not a
  cryptographically rigorous audit log with independent witnesses, which
  would be over-engineering for Phase 0's actual threat model. See the
  concurrency caveat documented in `packages/events/src/audit.ts`.

## Alternatives considered

- **NextAuth.js / Auth.js** — a reasonable off-the-shelf choice; a custom
  implementation was chosen instead because the session model needs to be
  shared cleanly across `apps/web`, a future `apps/api`, and eventually
  the Client Portal's separate auth surface (Section 15.2), and because
  Section 2.2's contextual/scoped authorization model doesn't map cleanly
  onto a provider-centric auth library's built-in role handling — we'd be
  fighting the library for the part that actually matters here.
- **JWT-based stateless sessions** — rejected: Section 23.1 requires
  device/session revocation, which is far simpler with a server-side
  session row (`DELETE`/mark-revoked) than with JWTs (requiring a
  revocation list anyway, which erases the "stateless" benefit).

## Consequences

Every new protected page/action must call `requireActor`/`checkPermission`
(`apps/web/src/lib/guards.ts`) or `requirePermission`
(`packages/auth`) — there is no middleware-level enforcement net catching
a page that forgets to check. This is a real risk to manage via code
review and, longer-term, tests that assert every route under `(app)/`
requires authentication.

## Migration/rollback

Adding MFA, SSO, or a data-driven permission model are additive changes —
`Membership`/`ScopedGrant`/`can()`'s shapes don't need to change, only new
fields/tables alongside them.

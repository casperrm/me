# Module: Identity & Access

Status: **Implemented (Phase 0)**. Bible references: Sections 2, 23, 27.2, 29-30, 38.

## Purpose

Invite-only, role-based access to one Cedar Point OS organization, with
every sensitive action attributable and every client-scoped read/write
enforced server-side.

## Entities

| Model | Package | Notes |
|---|---|---|
| `Organization` | `@cedar/db` | Root tenant. |
| `User` | `@cedar/db` | Global identity (email + password hash). Not org-scoped. |
| `Membership` | `@cedar/db` | A user's role within one org. `status`: ACTIVE / INVITED / REVOKED. |
| `Invitation` | `@cedar/db` | Invite-only join flow; token hash, 7-day expiry. |
| `Session` | `@cedar/db` | Server-side session; token hash only, 30-day expiry. |
| `ScopedGrant` | `@cedar/db` | Per-client permission exception/addition beyond role defaults. |
| `AuditEvent` | `@cedar/db` | Append-only; see Section 23.2 schema, implemented field-for-field. |

## Permissions

Catalog and role defaults: `packages/domain/src/roles.ts`. Decision
function: `packages/domain/src/policy.ts`'s `can()`. See ADR-006 for why
role→permission defaults are code, not a data-driven table.

Current catalog: `organization:manage`, `members:invite`,
`members:manage`, `audit:read`, `clients:read`, `clients:write`,
`finance:read`, `finance:write`.

## Events (audit actions currently emitted)

`organization.created`, `session.created`, `invitation.created`,
`invitation.accepted`, `membership.role_changed`, `membership.revoked`,
`scoped_grant.created`.

## APIs / entry points

- `POST /api/auth/bootstrap` — one-time first-organization creation.
- `POST /api/auth/login`
- `POST /api/invite/[token]/accept`
- `POST /api/team/invite` — requires `members:invite`.
- Server actions (`apps/web/src/lib/actions/membership.ts`):
  `changeRoleAction`, `revokeMembershipAction`, `grantClientScopeAction` —
  all require `members:manage`.
- `logoutAction` — server action, no permission required (always allowed
  for the authenticated user's own session).

## Jobs

None. All identity/access operations are synchronous.

## UI

- `/setup` — one-time owner bootstrap (only reachable while zero
  organizations exist).
- `/login`
- `/invite/[token]` — invitation acceptance.
- `/team` — member list, invite form (`members:invite`), role
  change/revoke/scope-grant controls (`members:manage`). Read-only or
  hidden entirely (`PermissionDenied`) for anyone without either
  permission.

## Metrics

None instrumented yet. Candidates once `packages/observability` grows:
login failure rate, invitation acceptance rate, session count.

## Failure modes

- **Invalid/expired invitation:** `/invite/[token]` renders "invalid or
  expired" rather than a broken form; `getInvitationPreview` returns
  `null` for revoked/accepted/expired tokens.
- **Wrong password / unknown email:** generic "Invalid email or password"
  — does not distinguish the two, to avoid user enumeration.
- **Cross-organization membership/client manipulation:** every mutating
  action re-checks `target.organizationId === actor.organizationId` even
  after the permission check passes, and throws rather than silently
  no-op'ing.
- **Demoting/revoking the last OWNER:** blocked by
  `canManageMembership`'s `targetIsLastOwner` check regardless of actor
  role.

## Acceptance tests

- `packages/domain/src/policy.test.ts` — 13 unit tests covering role
  defaults, the Section 38 "scoped collaborator" scenario, the "cross-client
  access via guessed IDs" scenario, and the last-owner protection gate.
- Manual smoke test performed for this slice (see `docs/adr/0006-*.md`
  for context): login → session cookie → `/dashboard`, `/team`, `/clients`
  all return 200 with a valid session and redirect (307) without one;
  audit event row confirmed written on login.
- **Gap:** no automated integration/E2E test yet exercises the full
  HTTP flow (login → protected page → logout) or the invite-accept flow.
  Tracked as a Phase 1 follow-up — Section 32's "API" and "End-to-end"
  test layers are not yet represented in this repo's test suite beyond
  the domain-layer unit tests.

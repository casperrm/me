# Module: Client Portal

Status: **Implemented (Phase 2 slice)**. Bible reference: Section 15.2.

## Purpose

Lets an actual external client contact review and decide on their own
creative work, and see their own invoices and files — without ever
touching, or even being aware of, anything else in the organization.
Quoting the Bible directly: "Client sees only explicitly shared resources
within their client scope. Review designs/videos/content, comment,
approve/request changes, view reports/invoices/files where enabled."

## Entities

No new tables. The portal is entirely an authorization + routing
composition of existing entities:

| Model | Portal-relevant addition |
|---|---|
| `Membership` (`role: CLIENT_PORTAL`) | Has **zero** entries in `ROLE_GLOBAL_PERMISSIONS` (see `packages/domain/src/roles.ts`) — every permission a portal contact has comes from a `ScopedGrant`, never a role default. |
| `Invitation.clientId` | Pre-scopes an invite to one client. Required at invite-creation time when `role === CLIENT_PORTAL` (an invite that would leave a portal contact with zero client access is rejected before a token is even issued). |
| `ScopedGrant` | Two rows — `clients:read` and `approvals:decide`, both scoped to the invite's `clientId` — are auto-created the moment the invitation is accepted. Nothing else creates or removes these automatically; an admin can add/revoke scope later from `/team` like any other member's grants. |

## Permissions

- `clients:read` (scoped) — lets `isAuthorized(..., "clients:read",
  clientId)` pass, which is what `/portal/[clientId]` checks before
  rendering anything.
- `approvals:decide` (scoped) — the permission `recordApprovalDecision`
  accepts as an alternative to `clients:write` (see `approvals.md`).
- A `CLIENT_PORTAL` membership has no organization-wide permission at all
  — confirmed by `packages/domain/src/policy.test.ts`'s Section 15.2
  describe block and by the integration test below.

### Security invariant: decision attribution can't be spoofed

`recordApprovalDecision` (in `creative-service.ts`) takes both an
`actorName` (the caller's own authenticated name, supplied by the route
handler from the session) and an optional free-text `decidedBy` (used by
internal staff to record a decision made by a client contact who isn't
logged in). When `membership.role === "CLIENT_PORTAL"`, `decidedBy` is
**always** overwritten with `actorName` server-side — a portal contact's
submitted `decidedBy` value, if any, is silently discarded. This is the
one thing this whole feature exists to guarantee: a client contact cannot
record a decision under someone else's name.

## Events

No new audit actions — decisions from the portal emit the same
`approval.decided` event as internal decisions (with `changeSet.decidedBy`
reflecting the forced attribution), and `invitation.created` /
`invitation.accepted` now carry `clientId` when set.

## Routing

- `(app)/layout.tsx` redirects any `CLIENT_PORTAL` membership to
  `/portal` — the internal app shell has nothing for them (Section 15.2:
  zero org-wide permissions means every internal page would just render
  "permission denied").
- `/portal` (landing) — lists every client the caller's `ScopedGrant`s
  point at (via `clients:read`); redirects straight to
  `/portal/[clientId]` when there's exactly one, which is the expected
  case for a single-client portal contact.
- `/portal/[clientId]` — the curated view. Re-checks `clients:read` for
  this specific `clientId` itself (never trusts routing alone) and 404s
  if the client isn't even in the caller's organization.

## UI (curated view)

Deliberately narrower than the internal `/clients/[id]` profile page.
Included: pending-approval creatives (with a decide form, gated on
`approvals:decide`), approved history, invoices, and files. **Excluded**
by construction (the queries simply never select or join them): internal
notes, Client Health Score, Brand DNA internals, campaign budgets/KPIs,
the client timeline, and — because every query is filtered by this one
`clientId` — every other client.

`PortalDecideForm.tsx` intentionally has no "decided by" input (unlike the
internal `CreativeActions.tsx`): a portal contact's name is never
user-editable, it's always their own session identity.

## Jobs

None. Synchronous, same as the rest of the approvals module.

## Failure modes

- **CLIENT_PORTAL invite with no `clientId`:** rejected at
  `createInvitation` with `AuthError` before a token is issued.
- **Portal contact requests a client outside their scope:** `/portal/[id]`
  renders `PermissionDenied`; `recordApprovalDecision` throws
  `AuthorizationError` (verified end-to-end in the integration test).
- **Portal contact submits a spoofed `decidedBy`:** silently overwritten
  server-side, never persisted — see the Security invariant above.
- **Cross-organization client ID in the portal URL:** 404s the same way
  the internal client page does (`prisma.client.findFirst` scoped to
  `organizationId` before the permission check even runs).

## Acceptance tests

- `packages/domain/src/policy.test.ts` — pure `can()` unit tests: a
  `CLIENT_PORTAL` actor can decide approvals for their own client, cannot
  for a different client, has no `clients:write` even on their own
  client, and has no organization-wide permissions.
- `apps/web/src/lib/services/client-portal.integration.test.ts` — 5 tests
  against real Postgres: a `clientId`-less `CLIENT_PORTAL` invite is
  rejected; invite → accept → the exact two `ScopedGrant` rows are
  auto-created, scoped to the one client; the resulting membership is
  confirmed to have `clients:read`/`approvals:decide` on its own client
  and nothing else (not `clients:write`, not `finance:read`, not
  `members:invite`); the portal contact successfully decides an approval
  on their own client's creative with a spoofed `decidedBy` that gets
  overwritten to their real name; and the same portal contact is rejected
  when attempting to decide on a different client's creative.
- Manual smoke test performed for this slice against the real running
  server (`npm run start`, real HTTP, real cookies): logged in as the
  seeded OWNER, invited a `CLIENT_PORTAL` contact for the demo client
  ("Volt Mobile") via `/api/team/invite`, confirmed the invite preview
  page renders the client name, accepted the invite via
  `/api/invite/[token]/accept`, confirmed the internal `/dashboard` route
  redirects the new session straight to `/portal/[clientId]`, confirmed
  the curated page rendered the pending creative/invoices/files sections,
  submitted a decision with a spoofed `decidedBy`, and confirmed in the
  database that the persisted `Approval.decidedBy` was the portal
  contact's real name and `Creative.status` moved to `APPROVED`.

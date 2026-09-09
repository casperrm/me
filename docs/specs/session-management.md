# Session and device management

Bible reference: Section 23.1 — "secure session lifecycle, and
device/session revocation."

## What existed before this slice

The `Session` model (`packages/db`) already had `revokedAt`, `ipAddress`,
and `userAgent` columns, and `packages/auth/src/session.ts` already had
`revokeSession(sessionId)` and `revokeAllSessionsForUser(userId)`. None of
it was reachable by a user, though: `revokeSession` was only ever called
from `logout()` (revoking your own current session on sign-out), and
`revokeAllSessionsForUser` had zero callers anywhere in the app. A user
had no way to see what's signed in as them, or to kick out a device that
isn't theirs anymore (a lost phone, a shared computer, a suspicious
login). This slice makes those primitives real, user-facing features on
`/security`.

## What's built

- `listMySessions(userId, currentSessionId)` (`apps/web/src/lib/services/auth-service.ts`)
  — every non-revoked, non-expired session for the user, newest first,
  each flagged `isCurrent` against the session making the request.
- `revokeMySession({ userId, membershipId, organizationId, sessionId })`
  — revokes one session, but only after confirming it belongs to the
  calling user (`session.userId !== userId` throws `AuthError`, mapped to
  404). Without this check, a user could revoke *any* session in the
  database by guessing/enumerating a session id — this is the one part of
  the slice that's a real security boundary, not just a nicety. Emits a
  `session.revoked` audit event.
- `revokeAllOtherSessions({ userId, membershipId, organizationId, currentSessionId })`
  — revokes every other active session for the user, deliberately
  excluding the current one so the action can't sign the user out of the
  device they're using to perform it. This is a different function from
  packages/auth's own `revokeAllSessionsForUser` (which has no exclusion
  and is left as-is for a possible future incident-response/forced-
  logout-everywhere use — not wired to anything yet). Emits a
  `session.revoked_all_others` audit event with the count, only when at
  least one session was actually revoked.
- Three API routes: `GET /api/security/sessions` (list), `DELETE
  /api/security/sessions/[id]` (revoke one), `POST
  /api/security/sessions/revoke-all` (revoke the rest). All three are
  self-scoped account-security actions — like the existing MFA
  setup/disable routes, they only check `getCurrentActor()` for 401, no
  `requirePermission`/RBAC check, since a user always manages their own
  sessions regardless of role.
- `/security` gained an "Active sessions" card (`ActiveSessions.tsx`):
  each row shows user-agent, IP, and sign-in time, with a "Sign out"
  button on every session except the current one, plus a "Sign out all N
  other device(s)" action when there's more than one.

## Failure modes

- **Revoking a session that belongs to someone else:** refused with 404
  (`AuthError`) at the service layer, not merely hidden in the UI —
  tested directly against the route, not just the happy path.
- **Revoking an already-revoked session:** a no-op (`revokeMySession`
  returns early rather than emitting a second audit event for the same
  transition).
- **Revoking the current session via the bulk action:** impossible by
  construction — `revokeAllOtherSessions` excludes `currentSessionId` in
  its `WHERE` clause, not via a UI-level filter that could be bypassed by
  calling the API directly.

## What's deliberately not built here

- **Pagination on the session list.** This dev database's seeded demo
  account has accumulated roughly 90 active sessions from this project's
  own extensive live-smoke-testing history — every login this whole
  build-out performed created a new 30-day session row that nothing ever
  revoked. The live smoke test for this slice surfaced that list
  rendering all ~90 rows with no cap. A real user's session count stays
  naturally small (a handful of real devices), so adding pagination here
  now would be solving a problem this dev sandbox's own test history
  created, not one a real user would hit — revisit if real usage ever
  shows otherwise.
- **Automatic revocation on password change or suspicious-location
  detection.** Section 23.1 doesn't name either as a Phase 0 requirement;
  both would need policy decisions (what counts as "suspicious"?) this
  slice doesn't invent.
- **A location/geo label per session.** `ipAddress` is stored and shown
  raw; resolving it to a city/country would need a real IP-geolocation
  provider or database this environment doesn't have configured.

## Testing

- `apps/web/src/lib/services/identity.integration.test.ts` — a new
  "session management" block (4 tests, real Postgres): listing flags the
  current session correctly, revoking another user's session is refused,
  revoking your own session works and is audited, and revoking "all
  others" leaves exactly the current session active and is audited.
- `apps/web/src/app/api/security/sessions/sessions.route.contract.test.ts`
  — the HTTP layer for all three routes (7 tests): 401 when signed out,
  a real list response with the current session correctly flagged, 404
  for another user's session, and a real 200 that actually revokes state
  in the database for both the single-session and revoke-all routes.
- Live-verified against a real running production build with three real
  browser contexts (Playwright/Chromium), each with its own real login:
  confirmed the "this device" label and "Sign out" buttons render;
  clicking one "Sign out" button logged out exactly one of the two other
  real sessions (confirmed by that context's next navigation redirecting
  to `/login`); "Sign out all other devices" then logged out the
  remaining one; the device performing the actions stayed signed in
  throughout. Screenshots inspected to confirm layout.

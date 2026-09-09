# Module: Error Boundaries

Status: **Implemented**. Bible reference: Section 28.2 ("meaningful
empty/error states").

## Purpose

Give every page a real, friendly fallback when something throws instead
of Next.js's generic "Application error: a server-side exception has
occurred" screen — which, before this slice, was the *only* thing this
app ever showed for an uncaught error, anywhere.

## The gap this closes

This app had no `error.tsx` boundary anywhere. Two separate slices this
session hit the real consequence of that directly:

- The task-dependencies slice (see `docs/specs/projects-and-calendar.md`)
  found that selecting "Done" on a blocked task threw an uncaught
  `AuthError` from `setTaskStatusAction`, crashing the *entire* project
  detail page for any writer who clicked the obvious dropdown option.
  Fixed at the time by disabling that specific `<option>` client-side —
  a real, correct fix for that specific predictable rejection, but it
  didn't address the underlying gap: nothing caught an uncaught error
  from *any other* server action, known or not-yet-discovered.
- `docs/specs/mfa.md` names the same underlying gap again from the MFA
  API-enforcement slice: `apps/web/src/lib/actions/*.ts` server actions
  still don't catch `AuthorizationError`/`MfaRequiredError` at all, so
  either one thrown from inside a server action propagates uncaught.

Both write-ups were explicit that this was a real, not-yet-fixed gap.
This slice closes it — not by retrofitting every server action with its
own try/catch (a much larger, more invasive change nothing asked for,
and the two gaps above were deliberately left open rather than papered
over with a rushed version of that), but by adding the actual missing
piece Section 28.2 names: a real error boundary, the *last* line of
defense for whatever gets through, complementing (not replacing) the
*first* line of defense already established at individual call sites
(disabling a UI option that would predictably trigger a known
rejection, the pattern used for the blocked-task bug above).

## Design

- `apps/web/src/components/ErrorBoundaryContent.tsx` — the shared
  Client Component every `error.tsx` renders: a friendly "Something
  went wrong" card, `error.digest` shown when present (so a user can
  reference it), a "Try again" button (`reset()`), and a link back to a
  safe page. `error.message` is deliberately never rendered — Next.js
  already strips it for a server-thrown error before this component
  ever sees it (replaced with a generic message plus `digest`, the
  framework's own default so arbitrary internal error text is never
  shown to whoever's looking at the screen), so there was nothing to
  gain by trying to thread it through, and doing so would have meant
  fighting a security default that's already correct.
- Three `error.tsx` files, one per route segment that needs its own
  fallback destination:
  - `apps/web/src/app/(app)/error.tsx` — links back to `/dashboard`.
    Covers every authenticated internal page.
  - `apps/web/src/app/portal/error.tsx` — links back to `/portal`.
    Covers the Client Portal.
  - `apps/web/src/app/error.tsx` — links back to `/login`. Covers
    `/login`, `/invite/[token]`, `/setup` (no boundary of their own),
    **and** any error thrown inside `(app)/layout.tsx` or
    `portal/layout.tsx` themselves — Next.js's error-boundary nesting
    rule is that a segment's own `layout.tsx` sits *outside* that
    segment's `error.tsx`, so `(app)/error.tsx` can't catch a failure
    in `(app)/layout.tsx`'s own actor resolution / MFA gate / nav
    permission checks. The root boundary is what catches that instead.

## Explicit scope boundary

- **No `global-error.tsx`.** That boundary only catches errors thrown
  inside the true root layout (`apps/web/src/app/layout.tsx`), which
  renders nothing but static shell markup with no data fetching —
  there's nothing in it that can throw, so adding a `global-error.tsx`
  (which must define its own `<html>`/`<body>`, since it replaces the
  root layout when active) would be defensive code protecting against a
  scenario that doesn't exist here.
- **Server actions still don't do their own try/catch.** This slice
  does not change `apps/web/src/lib/actions/*.ts` — an uncaught
  `AuthorizationError`/`AuthError`/`MfaRequiredError` from one still
  propagates the same way it always did. What changes is what happens
  *after* it propagates: a friendly boundary instead of a blank crash
  screen. Retrofitting every action to return a structured `{ error }`
  result (so a form could show an inline message instead of losing the
  whole page) is a real, separately-scoped follow-up — not built here,
  named explicitly rather than left silent.
- **No error reporting/telemetry pipeline.** `ErrorBoundaryContent`
  calls `console.error(error)` on mount (Next.js's own documented
  pattern) so a real error is visible in server/container logs with its
  `digest`, correlating to a specific occurrence — nothing fabricated
  beyond that. A real error-tracking service (Sentry or similar) isn't
  wired up; nothing in this codebase currently is.

## Verification

Live-verified against the real running server: reproduced a genuine
uncaught server-action error the same way the original blocked-task bug
was found (this time deliberately, since that specific path is now
prevented client-side) — tampered with `TaskPriorityForm`'s hidden
`taskId` input via the browser's own DOM (a real-world equivalent: a
task deleted in another tab while this tab still holds a stale form)
and submitted, driving `setTaskPriority` to throw a real, uncaught
`AuthError("Task not found.")` from inside `setTaskPriorityAction`.
Confirmed the real running app showed the new friendly "Something went
wrong" boundary — not Next's generic crash page — with a working "Try
again" button that reloaded the segment successfully once the tampering
was gone. See `ROADMAP.md` for the exact commands and observed output.

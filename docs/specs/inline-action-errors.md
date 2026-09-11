# Inline errors for server actions, instead of a full-page crash

Bible reference: Section 28.2 ("meaningful error states"). Named as an
explicit, not-yet-built follow-up in `docs/specs/error-boundaries.md`:
"Retrofitting every action to return a structured `{ error }` result...
is a real, separately-scoped follow-up — not built here."

## The gap

`error.tsx` boundaries (built in an earlier slice) mean an uncaught error
from a server action no longer crashes to a blank screen — but it still
replaces the *entire page* with a "Something went wrong" screen. For an
ordinary, recoverable business-rule rejection (not a bug, not an
unauthorized access attempt — just "that specific thing you tried isn't
allowed right now"), losing the whole page is a worse experience than
showing the error next to the control that produced it.

This repo has exactly three `"use server"` action files
(`apps/web/src/lib/actions/{task,auth,membership}.ts`). Auditing each
action's real failure paths against what the UI already prevents (rather
than converting all of them speculatively) found two genuinely reachable
cases — not hypothetical:

- **`setTaskStatusAction`** (`task.ts`) → `setTaskStatus`'s blocked-
  completion rule (a task can't be marked "done" while a `TaskDependency`
  points at an incomplete task). `TaskStatusForm.tsx` disables the "done"
  `<option>` client-side, but only using blocker data as of the page's
  last render — a blocker added (or completed) after that, before the
  user submits, is a real race, not a contrived one (two tabs, or two
  people working the same project).
- **`changeRoleAction` / `revokeMembershipAction`** (`membership.ts`) →
  `canManageMembership`'s rule that only an OWNER may change or revoke
  another OWNER. The Team page (`team/page.tsx`) only hides these forms
  for the *last remaining* OWNER (`isLastOwner`) — it does **not** hide
  them when the target is a non-last OWNER and the viewing actor is an
  ADMIN. An org with two OWNERs and an ADMIN acting on the second one is
  an ordinary, reachable state, not an edge case.

The other three actions in these files (`setTaskPriorityAction`,
`setTaskEstimateAction`, `grantClientScopeAction`) were checked and, at
the time, had no comparable reachable *business-rule* failure —
priority/estimate have no rule beyond what the UI already enforces, and
`ScopedGrant` has no unique constraint to violate. They were left
unconverted for that reason. **Update — see "Follow-up: the
AuthorizationError/MfaRequiredError gap" below: this reasoning covered
each action's own service-level business rule, but missed a failure
mode every one of the six actions shares underneath — `requirePermission`/
`requireAnyPermission` itself.** That gap is now closed for all six.

## What's built

- `setTaskStatusAction`, `changeRoleAction`, and `revokeMembershipAction`
  now wrap only their service call (not the actor/redirect check above
  it) in a `try/catch`, returning `{ error: string }` for an `AuthError`
  instead of letting it propagate, and rethrowing anything else
  unchanged. `revalidatePath` only runs on the success path, same as
  before.
- No `useFormState`/`useActionState` — this repo's `react-dom` is pinned
  to `18.3.1`, which doesn't export either (both are React 19 APIs, one
  of them under a different name). Instead, the three affected form
  components (`TaskStatusForm.tsx`, and the Team page's role-change and
  revoke forms, extracted into a new `MemberRowActions.tsx` client
  component) call the action directly from an `onSubmit` handler
  (`e.preventDefault()`, build a `FormData` from the form, call the
  imported action, inspect the return value) instead of passing it as
  the `<form action={...}>` prop. A `"use server"` function works
  identically either way — Next.js instruments the reference, not the
  call site — so this is not a departure from how the rest of the app
  already handles most mutations (client components calling fetch/
  actions and setting local state), just applied to these three forms
  for the first time.
- `TaskStatusForm.tsx`'s select is now controlled (`value`, not
  `defaultValue`) so a rejected change visibly reverts to the real
  server-confirmed status instead of leaving the dropdown showing a
  change that didn't happen.
- `grantClientScopeAction` in `MemberRowActions.tsx` was, at the time,
  left as a plain `<form action={...}>` (no onSubmit/error state) since
  no real error path existed for it yet. **See the follow-up below — this
  is no longer accurate.**

## Scope — explicitly not built

- **No blanket conversion.** `logoutAction` (`auth.ts`) and the three
  actions named above with no reachable failure were left alone.
- **No client-side prediction of the failure** (e.g., passing the
  actor's own role down to the Team page so it could also hide the form
  for "ADMIN targeting any OWNER," not just the last one). That would
  close the gap from the UI-affordance side instead of the crash-
  handling side, and is a legitimate but different fix — this slice is
  about what happens when the rejection *does* reach the server, not
  about tightening what the UI offers in the first place.
- **No progressive-enhancement (no-JS) fallback for the new inline-error
  path.** The `<form action={...}>` prop that gave no-JS resilience is
  gone from the two converted `MemberRowActions.tsx` forms and
  `TaskStatusForm.tsx`'s select; with JavaScript disabled, a rejected
  submission on these three specific controls would again hit the
  page-level `error.tsx` boundary. Given this app has no no-JS usage
  path anywhere else (every other mutation already goes through
  client-side `fetch`), this is a knowingly accepted, not a silent, gap.

## Testing

- `apps/web/src/lib/actions/task.test.ts` (new): 2 tests against real
  Postgres — a blocked-completion attempt returns `{ error }` (message
  contains "Cannot complete this task while blocked") without mutating
  the task's status, and an ordinary unblocked status change succeeds
  and returns `undefined`.
- `apps/web/src/lib/actions/membership.test.ts` (new): 2 tests against
  real Postgres — an ADMIN targeting a non-last OWNER via
  `changeRoleAction` or `revokeMembershipAction` returns `{ error }`
  without mutating the target membership's role/status. Mirrors the
  existing service-level coverage in `identity.integration.test.ts`'s
  "last-owner protection" suite, but at the thinner action-wrapping
  layer that's new here.
- Live-verified against a real running production build
  (`npm run build && npm run start`) with a real headless-browser
  session (Playwright/Chromium): created a second real OWNER + an ADMIN
  membership and a task with a `TaskDependency` (added *after* the page
  had already rendered, to reproduce the exact race — the pre-existing
  disabled `<option>` correctly blocks the case where the blocker
  existed at render time, so the race has to be reproduced this way to
  exercise the server-side check at all). For both scenarios: confirmed
  the real inline error text rendered, confirmed
  `ErrorBoundaryContent`'s "Something went wrong" heading did **not**
  render, confirmed the rest of the page (project heading / Team
  heading) stayed intact, and confirmed via direct `psql`-equivalent
  query that the rejected mutation left no partial write (task stayed
  `todo`, membership stayed `OWNER`). All fixture rows (2 users, 2
  memberships, 2 tasks, 1 dependency, their sessions/audit events)
  cleaned up afterward; confirmed the dev DB was back to exactly the
  seeded 1 user / 1 membership.

## Follow-up: the AuthorizationError/MfaRequiredError gap

`docs/specs/mfa.md` and `docs/specs/error-boundaries.md` both explicitly
named a gap this slice's own scan didn't cover: every write path in
`task.ts`/`membership.ts` calls a service function that itself calls
`requirePermission`/`requireAnyPermission` (`@cedar/auth`) — which can
throw `AuthorizationError` (denied outright) or `MfaRequiredError` (the
org's MFA-required policy is on and this actor hasn't enrolled), neither
of which any action caught. `AuthError` is each *service's own* business
rule; `AuthorizationError`/`MfaRequiredError` are the shared
authorization/MFA layer underneath every one of them — a different
failure source this slice's original per-action business-rule audit
didn't consider.

A real, reachable race for the MFA case: an owner turns the org's
MFA-required policy on while another privileged user still has a page
open from before that change. `(app)/layout.tsx`'s redirect-to-`/security`
gate only runs on page *navigation* — a server action on an
already-rendered page skips it entirely, so that user's next submit would
have crashed into the page's `error.tsx` boundary.

### What changed

- Both action files gained a shared `actionErrorMessage(err)` helper:
  `AuthError`/`MfaRequiredError` return their own message verbatim (both
  are already written as real user-facing text);
  `AuthorizationError` returns a generic "You don't have permission to do
  that." (its own message embeds the raw `Permission` string, e.g.
  `"Not authorized: clients:write"`, which isn't real user-facing copy).
- All six actions (`setTaskStatusAction`, `setTaskPriorityAction`,
  `setTaskEstimateAction`, `changeRoleAction`, `revokeMembershipAction`,
  `grantClientScopeAction`) now return `{ error: string } | undefined`
  and use this helper — the three that previously had "no comparable
  reachable failure" needed it for this shared layer even though their
  own business rule truly has none.
- `TaskPriorityForm.tsx` and `TaskEstimateForm.tsx` converted from plain
  `<form action={...}>` to the same controlled `useTransition` + inline
  error pattern `TaskStatusForm.tsx` already established (both now
  needed it for the first time, since their actions can return an error
  now). `MemberRowActions.tsx`'s grant-scope form converted the same way,
  joining its two sibling forms in that file that already used the
  pattern.

### Testing

- `task.test.ts` gained a new `describe("MFA enforcement gate")` test:
  a real org with `mfaRequiredForPrivilegedRoles: true`, a real
  unenrolled OWNER, confirms `setTaskPriorityAction` returns `{ error:
  "MFA enrollment is required for this account before this action can be
  performed." }` instead of throwing.
- `membership.test.ts` gained the equivalent test for `changeRoleAction`
  with an unenrolled ADMIN.
- Live-verified against a real running production build: loaded a real
  task page while the seeded org's MFA policy was still off (an
  already-open tab), then flipped `mfaRequiredForPrivilegedRoles` to
  `true` directly in Postgres *without reloading the page* — reproducing
  the exact race, since a reload would have hit the layout-level redirect
  instead. Submitted the already-rendered priority selector: confirmed
  the real inline "MFA enrollment is required..." message rendered (no
  `error.tsx` crash), the selector visibly reverted to its prior value,
  and the task's `priority` column in Postgres was genuinely unchanged —
  not merely a UI-level revert. The org's MFA policy was reset to `false`
  afterward, confirmed back to the seeded baseline.

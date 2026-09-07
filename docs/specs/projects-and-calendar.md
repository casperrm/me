# Module: Projects, Tasks & Calendar

Status: **Partially implemented (Phase 1 slice, extended seven times)**.
Bible reference: Section 12.

## Purpose

Operational work tracking per client (projects, tasks, assignment, due
dates) and a unified calendar view of everything with a date attached
across modules, so nothing is tracked in a separate spreadsheet.

## What's not built yet

Section 12 also calls for **reusable project templates** — that still
doesn't exist. `Task` checklist, priority, estimate, comments, and
attachments are now real; `Project` has `Milestone`s with an overdue
signal; and a `Task` can now declare it's `TaskDependency`-blocked by
another task in the same project (see below). This is the smallest real
cut of "dependencies," not the full thing: there is no dependency graph
between milestones, no multi-hop cycle detection (only a direct
self-reference or direct reverse pair is rejected — see Failure modes),
and no critical-path/project-risk computation beyond the one hard rule
(a task can't complete while blocked) plus the existing per-milestone
overdue flag. This is a deliberate scope cut, not an oversight — build a
real graph-traversal layer (and a project-level risk score) when a real
need shows up, rather than modeling it speculatively now.

## Entities

| Model | Package | Notes |
|---|---|---|
| `Project` | `@cedar/db` | Belongs to a `Client`. `status` is a free string today (PLANNING/IN_PROGRESS/IN_REVIEW/DELIVERED/ARCHIVED by convention, not an enum — see schema comment). |
| `Task` | `@cedar/db` | Belongs to a `Project`; `assigneeId` references a `Membership`, not a `User` — assignment is org-scoped. |
| `TaskChecklistItem` | `@cedar/db` | Belongs to a `Task`. Flat, ordered (`position`, append-only — no reordering support), independently checkable (`done`). No nesting, no per-item assignee/due date. |
| `TaskComment` | `@cedar/db` | Belongs to a `Task`, attributed to the `Membership` that wrote it. Flat, append-only — no edit, no delete, no threading. |
| `Milestone` | `@cedar/db` | Belongs to a `Project`. A required `dueDate`, independently markable `done`. No dependency graph between milestones or tasks. |
| `TaskDependency` | `@cedar/db` | A directed edge: `taskId` is blocked by `blockedByTaskId`, both `Task`s in the same project. `@@unique([taskId, blockedByTaskId])` prevents a duplicate edge; the direct reverse pair is rejected in the service layer (see Failure modes), not the schema. |

A milestone's "overdue" state is **computed**, not stored:
`!done && dueDate < now`. A stored status would drift the instant "now"
moves past `dueDate` without a write happening, so both `calendar-service.ts`
and the project detail page compute it fresh on every read instead.

Task attachments reuse `Asset` (Section 14's Files model) rather than a
separate table — `Asset` gained a nullable `taskId` alongside its
existing `clientId`/`projectId`, so a task attachment is one row with
all three set, findable from the client's/project's file history too,
not a second copy of upload/storage/delete plumbing.

`Task.priority` is a plain `String @default("medium")` (like `status`),
not an enum — validated against a fixed set (`low`/`medium`/`high`) in
`project-service.ts`, the same convention used for `status`.
`Task.estimateHours` is a nullable `Float` — hours, not minutes, so a
writer can type "2.5" directly; `null` means "no estimate", not zero.

No new tables for calendar — `getUpcomingEvents` is a read-only query
across existing tables, per Section 12's "Calendar unifies deadlines..."
rather than a calendar being its own data store.

## Permissions

- Read: `clients:read` on the project's/task's owning client.
- Write (create project, create task, change task status/priority/
  estimate, add/toggle/delete a checklist item, add a comment, upload/
  delete an attachment, create/toggle/delete a milestone, add/remove a
  task dependency): `clients:write` on the owning client. There is no
  separate "task-level" or "project-level" permission — anyone who can
  write to the client can manage all of its projects/tasks/checklist
  items/comments/attachments/milestones/dependencies. Revisit if a role
  ever needs write access to tasks but not, say, Brand DNA.

## Events

`project.created`, `task.created`, `task.status_changed`,
`task.priority_changed`, `task.estimate_changed`,
`task_checklist_item.created`, `task_checklist_item.toggled`,
`task_checklist_item.deleted`, `task_comment.created`,
`task_attachment.uploaded`, plus the existing `asset.deleted` for a
removed attachment, `milestone.created`, `milestone.toggled`,
`milestone.deleted`, `task_dependency.created`,
`task_dependency.deleted` (audit), plus a `project_created`
`ClientTimelineEvent` (checklist items, priority/estimate changes,
comments, attachments, milestone changes, and dependency changes are
routine project bookkeeping, not client-facing activity, so they don't
get a timeline event the way task completion does).

## APIs / entry points

- `POST /api/clients/[id]/projects` — create a project.
- `POST /api/projects/[projectId]/tasks` — create a task, optional
  `assigneeId` (a Membership id), `dueDate`, `priority`
  (`low`/`medium`/`high`, defaults to `medium` when omitted), and
  `estimateHours` (a non-negative number; omitted means no estimate).
- `setTaskStatusAction` (server action) — change a task's status; bound
  directly to a `<select>` in the UI, no client-side fetch needed.
- `setTaskPriorityAction` (server action) — change a task's priority;
  same pattern, a second `<select>` next to the status one.
- `setTaskEstimateAction` (server action) — change (or clear, by
  submitting an empty value) a task's estimate; bound to a number input
  with an explicit "Set" button rather than auto-submit-on-change, since
  a partially-typed number shouldn't submit on every keystroke the way
  a `<select>` safely can.
- `POST /api/tasks/[taskId]/checklist` — add a checklist item (`text`),
  appended at the end (`position` = current item count).
- `POST /api/checklist-items/[id]/toggle` — flip `done`; no request
  body, the current value is read and inverted server-side.
- `DELETE /api/checklist-items/[id]` — remove a checklist item.
- `POST /api/tasks/[taskId]/comments` — add a comment (`text`),
  attributed to the calling actor's `Membership`. No edit/delete
  endpoint — a comment is permanent once posted.
- `POST /api/tasks/[taskId]/attachments` — upload a file (multipart
  `file` field), reusing the same content-type allowlist and 15MB limit
  as `POST /api/clients/[id]/assets`. Download and delete reuse the
  existing generic `GET /api/assets/[id]/download` (signed-token) and
  `DELETE /api/assets/[id]` routes — an attachment is just an `Asset`
  row with `taskId` set, so nothing task-specific needed to exist there.
- `POST /api/projects/[projectId]/milestones` — create a milestone
  (`name`, required `dueDate`).
- `POST /api/milestones/[id]/toggle` — flip `done`; no request body,
  the current value is read and inverted server-side (same pattern as
  the checklist-item toggle route).
- `DELETE /api/milestones/[id]` — remove a milestone.
- `POST /api/tasks/[taskId]/dependencies` — declare that this task is
  blocked by another task (`blockedByTaskId`), both required to be in
  the same project.
- `DELETE /api/task-dependencies/[id]` — remove a dependency edge,
  unblocking the dependent task immediately.
- `setTaskStatus` (the same function backing `setTaskStatusAction`) now
  enforces one hard rule: a task cannot transition to `"done"` while
  any of its `TaskDependency` blockers is not itself `"done"` — this is
  not a separate endpoint, it's a new check inside the existing status
  change path, so every status-change caller (UI dropdown, any future
  API caller) gets it automatically.

## UI

- `/clients/[id]` — "Projects" card lists projects (linking to their
  detail page) with an inline "+ New project" quick-add
  (`clients:write` only).
- `/clients/[id]/projects/[projectId]` — a "Milestones" card above
  Tasks: a checkbox-toggle list (name, due date, a red "Overdue" badge
  when `!done && dueDate < now`, and for writers a delete button), plus
  a compact "new milestone" form (name + date input). Then the task
  list with inline estimate,
  status, and priority changes (an hours input with a "Set" button, then
  color-coded `<select>`s — grey/amber/red for low/medium/high — side by
  side for a writer, plain text badges/`"Nh"` for a read-only viewer), a
  "new task" form (assignee dropdown populated from active org
  memberships, a priority selector defaulting to "Medium", and an
  optional estimate field), campaign list (read-only), and a per-task
  checklist: a
  `done/total` count, each item with a checkbox and (for writers) a
  delete button, and an "+ Checklist item" quick-add. The checklist
  section is hidden entirely for a read-only viewer when a task has no
  items, so it never clutters the list with an empty affordance no one
  can use. Below that, comments: collapsed behind a "Show comments (N)"
  toggle so a task with a long history doesn't dominate the list by
  default, each line showing the author's name and text, plus a "+
  Comment" quick-add for writers. Same empty-state rule as the
  checklist — nothing renders for a read-only viewer on a task with no
  comments. Below that, attachments: same "Show attachments (N)"
  collapsed pattern, each line a download link (a signed, time-limited
  URL, same mechanism as the client Files page) plus size, uploader
  name, and (for writers) a "Remove" button, with a compact file-picker
  and "Attach" button beneath. Below the header row, dependencies:
  "Blocked by: X" pills (amber while the blocker is incomplete, grey
  once it's done) with a "✕" to remove one for writers, plus a compact
  "+ Blocked by…" `<select>` of the project's other tasks (already
  excluding itself and tasks it's already blocked by) to add one. The
  status `<select>` itself disables its "Done" option (labeled "Done
  (blocked)", with a title tooltip listing the incomplete blocker
  names) whenever the task has an open blocker — a client-side guard on
  top of the server-side enforcement, added specifically so selecting
  "Done" on a blocked task can't reach the unhandled-exception path a
  thrown `AuthError` would otherwise hit inside a plain `<form action>`
  server action (there's no `error.tsx` boundary in this app to catch
  it gracefully). The server-side check in `setTaskStatus` remains the
  actual authority; the disabled option is UX, not the enforcement.
- `/calendar` — org-wide (or client-scoped, for a collaborator without
  org-wide `clients:read`) view of everything due in the next 60 days:
  task due dates, project due dates, invoice due dates, and now
  milestone due dates (a green "Milestone" badge, plus the same red
  "Overdue" badge used on the project page when applicable — the same
  `!done && dueDate < now` formula, computed independently in
  `calendar-service.ts` and on the project page rather than shared,
  since each already has the row in hand). Reuses `getReadableClientIds` —
  the same client-visibility rule as `/clients`. Checklist items,
  comments, and attachments have no due date of their own, so they don't
  appear here — they're sub-steps of a task, not independently
  schedulable.

## Jobs

None. Synchronous.

## Metrics

None instrumented yet. Candidate: overdue task/project count per client,
feeding the future Client Health Score (Section 4.2).

## Failure modes

- **Cross-organization project/client IDs:** rejected the same way as
  Brand DNA and Client Management — the service layer re-verifies
  `organizationId` after the permission check, not just before. The
  same pattern holds one level down for checklist items: a
  cross-organization `taskId`/`itemId` is rejected by walking
  item → task → project → client → `organizationId`, never trusted at
  face value.
- **Assigning a task to a non-member:** rejected explicitly
  (`createTask` checks the `assigneeId` resolves to a `Membership` in the
  same organization) rather than silently creating a dangling reference.
- **Invalid task status value:** rejected before any database write.
- **Invalid task priority value:** rejected before any database write,
  both at creation (`createTask`) and on change (`setTaskPriority`) —
  same fixed-set validation used for status.
- **Negative or non-finite task estimate:** rejected before any database
  write, both at creation and on change (`setTaskEstimate`) — `NaN` and
  negative numbers are both caught the same way.
- **Empty checklist item text:** rejected before any database write,
  same as an empty task title.
- **Empty comment text:** rejected before any database write, same
  pattern as an empty checklist item.
- **Disallowed attachment content type, empty file, or file over 15MB:**
  rejected before storage or the database is touched — the same
  validation `uploadAsset` already applies to client-level files, shared
  via one `validateUpload` helper rather than duplicated.
- **Empty milestone name:** rejected before any database write, same
  pattern as an empty task title.
- **Cross-organization milestone `id`:** rejected by walking
  milestone → project → client → `organizationId`, same pattern as
  checklist items/comments.
- **A task blocked by itself:** rejected before any database write —
  `taskId === blockedByTaskId` is checked directly, no query needed.
- **A blocker task in a different project:** rejected — a dependency
  only makes sense within one project's own task list, so
  `blocker.projectId !== task.projectId` is rejected even when both
  tasks are in the same organization/client (a client can have several
  projects).
- **A duplicate dependency edge, or the direct reverse pair:** rejected
  in the service layer. The schema's `@@unique([taskId,
  blockedByTaskId])` alone would let A be blocked by B *and* B be
  blocked by A at the same time (two distinct rows, no constraint
  violation) — a two-task deadlock where neither can ever complete — so
  `addTaskDependency` explicitly checks for and rejects that reverse
  pair too. Longer cycles (A→B→C→A) are not detected; see the scope
  note above.
- **Completing a task with an incomplete blocker:** rejected inside
  `setTaskStatus` itself (not a separate check callers must remember to
  run) with a message naming the incomplete blocker(s) by title.
  Removing the dependency (or completing the blocker) unblocks it
  immediately — the block is re-evaluated fresh on every status-change
  attempt, never cached.
- **Cross-organization dependency `id`:** rejected by walking
  dependency → task → project → client → `organizationId`, same pattern
  as checklist items/comments/milestones.

## Acceptance tests

- `apps/web/src/lib/services/project-and-calendar.integration.test.ts` —
  29 tests against real Postgres: project creation + timeline event,
  cross-organization project rejection, task creation/assignment/status
  transition (asserting the `medium` default priority), invalid-assignee
  rejection, permission rejection for a role without `clients:write`,
  `getUpcomingEvents` unifying task/project/invoice/milestone due dates
  within a window with correct client-scoping and chronological
  ordering (now asserting `milestone_due` is among the returned types),
  a checklist block (items append in order with the correct `position`,
  a real toggle flips `done` and flips back, delete actually removes the
  row and leaves the others intact, an empty-text add is rejected, a
  `clients:write`-less write is rejected, and a cross-organization task
  or item is rejected for both add and toggle), a priority block:
  `setTaskPriority` actually persists a new value and rejects both an
  invalid priority and a cross-organization task, an estimate block:
  `setTaskEstimate` persists a new value, clears it back to `null`, and
  rejects both a negative/`NaN` estimate on create and on change, a
  comments block: `addTaskComment` persists in order with the real
  author's `Membership` id, rejects an empty comment, rejects a
  `clients:write`-less write, and rejects a cross-organization task, a
  milestones block: `createMilestone`/`toggleMilestone`/
  `deleteMilestone` round-trip a real row, an empty name is rejected, a
  `clients:write`-less write is rejected, and a cross-organization
  project or milestone is rejected for both create and toggle, and a
  dedicated overdue-signal test: three real milestones (one past-due and
  not done, one past-due and done, one future) confirm `getUpcomingEvents`
  flags `overdue: true` on exactly the first, and a dependencies block:
  the full round trip (add a dependency, confirm completing the blocked
  task is rejected while the blocker is open, complete the blocker,
  confirm completion now succeeds; separately confirm removing the
  dependency unblocks completion even while the blocker is still open),
  self-blocking rejection, duplicate-and-reverse-pair rejection, a
  blocker from a different project rejected, a `clients:write`-less
  write rejected, and a cross-organization task or dependency rejected
  for both add and remove.
- `apps/web/src/app/api/tasks/[taskId]/checklist/route.contract.test.ts`
  — 5 tests (401/400 missing text/403/200 with a real persisted row at
  `position: 0`/400 cross-organization).
- `apps/web/src/app/api/checklist-items/[id]/toggle/route.contract.test.ts`
  — 4 tests (401/403/200 flips then flips back, cross-checked against
  the real row/400 cross-organization).
- `apps/web/src/app/api/checklist-items/[id]/route.contract.test.ts`
  (`DELETE`) — 4 tests (401/403/200 with the row actually gone/400
  cross-organization).
- `apps/web/src/app/api/projects/[projectId]/tasks/route.contract.test.ts`
  — 7 tests (up from 6): the existing 401/400-missing-title/403/200
  cases (the 200 case now also asserts the real row's `priority`
  defaults to `medium`), the priority test (persists `priority: "high"`,
  rejects an invalid value), a new test that persists an explicit
  `estimateHours: 3.5` and rejects a negative one, and the existing
  cross-organization-project rejection.
- `apps/web/src/app/api/tasks/[taskId]/comments/route.contract.test.ts`
  — 5 tests (401/400 missing text/403/200 with a real persisted comment
  attributed to the actor's `Membership` id/400 cross-organization).
- `apps/web/src/lib/services/asset-service.integration.test.ts` — a new
  `uploadTaskAttachment` block (4 tests, alongside the existing
  `uploadAsset`/`deleteAsset` tests): a real upload persists with
  `taskId`/`clientId`/`projectId` all set and a real file written to
  disk, a disallowed content type is rejected before storage is
  touched, a `clients:write`-less upload is rejected, and a
  cross-organization task is rejected.
- `apps/web/src/app/api/tasks/[taskId]/attachments/route.contract.test.ts`
  — 6 tests, same multipart-FormData + temp-storage-directory pattern as
  `clients/[id]/assets/route.contract.test.ts` (401/400 no file/403/400
  disallowed content type/200 with a real persisted row and a real file
  on disk/400 cross-organization).
- `apps/web/src/app/api/projects/[projectId]/milestones/route.contract.test.ts`
  — 6 tests (401/400 missing name/400 missing dueDate/403/200 with a
  real persisted row/400 cross-organization).
- `apps/web/src/app/api/milestones/[id]/toggle/route.contract.test.ts`
  — 4 tests (401/403/200 flips then flips back, cross-checked against
  the real row/400 cross-organization).
- `apps/web/src/app/api/milestones/[id]/route.contract.test.ts`
  (`DELETE`) — 4 tests (401/403/200 with the row actually gone/400
  cross-organization).
- `apps/web/src/app/api/tasks/[taskId]/dependencies/route.contract.test.ts`
  — 5 tests (401/400 missing `blockedByTaskId`/403/200 with a real
  persisted edge/400 cross-organization).
- `apps/web/src/app/api/task-dependencies/[id]/route.contract.test.ts`
  (`DELETE`) — 4 tests (401/403/200 with the row actually gone/400
  cross-organization).
- Manual smoke test performed for the Phase 1 slice: created a project
  and task via the real HTTP routes while logged in, confirmed both
  appeared on `/calendar` and the project detail page rendered
  correctly.
- Manual smoke test performed for the checklist slice against a real
  running production server, driven entirely through a headless
  browser (not just the API): on a real seeded task, typed a new
  checklist item into the real "+ Checklist item" input and submitted
  it, confirmed the item and a "0/1" count appeared in the real DOM;
  clicked its checkbox and confirmed the count updated to "1/1" in the
  DOM; clicked its delete button and confirmed the item disappeared
  from the DOM. Cross-checked via `psql` afterward that the dev
  database had zero leftover `task_checklist_items` rows — the UI's own
  delete step already cleaned up after itself.
- Manual smoke test performed for the priority slice against a real
  running production server: logged in as the seeded owner via
  `POST /api/auth/login`, created a real task with `priority: "high"`
  through the real `POST /api/projects/[projectId]/tasks` route,
  confirmed the persisted value via `psql`. Then, through a real
  headless browser on the actual project detail page, changed the same
  task's priority to "Low" via the real `TaskPriorityForm` dropdown
  (the real `setTaskPriorityAction` server action), reloaded the page,
  and confirmed the dropdown still showed "Low" — cross-checked against
  `psql` showing `priority = 'low'` in the database. Deleted the
  smoke-test task afterward to leave the dev database clean.
- Manual smoke test performed for the estimate slice against a real
  running production server: created a real task with
  `estimateHours: 3.5` through the real `POST /api/projects/[projectId]/tasks`
  route, confirmed the persisted value via `psql`. Then, through a real
  headless browser on the actual project detail page, changed the same
  task's estimate to `7` via the real `TaskEstimateForm` input and "Set"
  button (the real `setTaskEstimateAction` server action), reloaded the
  page, and confirmed the input still showed `7` — cross-checked against
  `psql` showing `estimateHours = 7` in the database. Deleted the
  smoke-test task afterward to leave the dev database clean.
- Manual smoke test performed for the comments slice against a real
  running production server: posted a real comment through the real
  `POST /api/tasks/[taskId]/comments` route, confirmed via `psql` that
  it was attributed to the correct `Membership` id. Then, through a real
  headless browser on the actual project detail page, expanded the
  "Show comments" toggle and confirmed the API-created comment rendered
  with the right author name; typed a second comment into the real "+
  Comment" input and submitted it through the real `TaskComments` form,
  reloaded the page, re-expanded the toggle, and confirmed both comments
  were present with a "(2)" count. Deleted both comments and the
  smoke-test task afterward to leave the dev database clean.
- Manual smoke test performed for the attachments slice against a real
  running production server (the real local storage adapter, not the
  test suite's temp directory): uploaded a real file through the real
  `POST /api/tasks/[taskId]/attachments` route, confirmed via `psql`
  that the resulting `Asset` row had `taskId`/`clientId`/`projectId` all
  set correctly and that the file existed on disk at its `storageKey`.
  Then, through a real headless browser on the actual project detail
  page, expanded the "Show attachments" toggle and confirmed the file
  rendered as a download link; clicked "Remove" and confirmed the
  attachments section disappeared from the DOM after a reload.
  Cross-checked via `psql` and the filesystem afterward that both the
  `Asset` row and the on-disk file were gone — the UI's own delete step
  already cleaned up after itself, same as the checklist slice. Deleted
  the smoke-test task afterward to leave the dev database clean.
- Manual smoke test performed for the milestones slice against a real
  running production server: created a real past-due milestone through
  the real `POST /api/projects/[projectId]/milestones` route, confirmed
  it persisted via `psql`. Through a real headless browser on the
  project detail page, confirmed the real "Overdue" badge rendered;
  clicked its checkbox to mark it done and confirmed (after a reload)
  the badge disappeared and the checkbox stayed checked; toggled it back
  to not-done and clicked delete, then confirmed it was gone from the
  DOM after a reload. Separately created a real milestone due within the
  next 60 days and confirmed it appeared on the real `/calendar` page
  with the correct "Milestone" badge — validating the calendar
  integration on a date the 60-day window actually covers (the earlier
  past-due milestone deliberately falls outside that forward-looking
  window, which is correct behavior, not a bug). Deleted both
  smoke-test milestones afterward via `psql` to leave the dev database
  clean.
- Manual smoke test performed for the task-dependencies slice against a
  real running production server: created two real tasks and a real
  dependency between them through the real API, confirmed the edge via
  `psql`. Through a real headless browser on the project detail page:
  confirmed the "Blocked by:" pill rendered and the blocked task's
  status `<select>` showed its "Done" option disabled and labeled "Done
  (blocked)"; selected "Done" on the *blocker* task instead, reloaded,
  and confirmed the "Done" option on the blocked task was now enabled;
  selected "Done" on the blocked task and confirmed it succeeded with no
  error (this caught a real bug during development — see note below);
  clicked the dependency's "✕" button and confirmed the "Blocked by"
  pill disappeared after a reload. Deleted both smoke-test tasks
  afterward via `psql` to leave the dev database clean.

  **Bug caught by this smoke test, fixed before commit:** the first
  version wired `setTaskStatus`'s new blocking rule straight into the
  existing `TaskStatusForm` `<select>` with no client-side guard.
  Selecting "Done" on a blocked task threw an uncaught `AuthError` from
  inside the server action; this app has no `error.tsx` boundary
  anywhere, so production showed a generic "Application error: a
  server-side exception has occurred" page in place of the whole
  project detail page — reachable by any writer clicking the obvious
  dropdown option. Fixed by disabling the "Done" `<option>` client-side
  whenever the task has an open blocker (see UI section above) so the
  crashing path is simply not reachable from the UI; the server-side
  check in `setTaskStatus` is unchanged and remains the real
  enforcement. Integration/route-contract tests alone did not catch
  this — they call the service/route functions directly and correctly
  observed the rejection as a thrown error, which is exactly what a
  service layer should do. Only driving the actual `<select>` in a real
  browser surfaced that the *form* had no handler for that error.

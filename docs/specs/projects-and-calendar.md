# Module: Projects, Tasks & Calendar

Status: **Partially implemented (Phase 1 slice, extended once)**. Bible
reference: Section 12.

## Purpose

Operational work tracking per client (projects, tasks, assignment, due
dates) and a unified calendar view of everything with a date attached
across modules, so nothing is tracked in a separate spreadsheet.

## What's not built yet

Section 12 also calls for **milestones and dependencies with
overdue/risk signals**, task **priority/estimate/comments/attachments**,
and **reusable project templates** — none of that exists. `Task`
checklist is now real (see below); priority, estimate, comments, and
attachments are still just title + status + assignee + due date +
checklist. `Project` has no milestone concept separate from its own
single `dueDate`. This is a deliberate scope cut, not an oversight —
extend `Task`/`Project` further (or add a `Milestone` model) when a real
need for dependency tracking or templates shows up, rather than
modeling it speculatively now.

## Entities

| Model | Package | Notes |
|---|---|---|
| `Project` | `@cedar/db` | Belongs to a `Client`. `status` is a free string today (PLANNING/IN_PROGRESS/IN_REVIEW/DELIVERED/ARCHIVED by convention, not an enum — see schema comment). |
| `Task` | `@cedar/db` | Belongs to a `Project`; `assigneeId` references a `Membership`, not a `User` — assignment is org-scoped. |
| `TaskChecklistItem` | `@cedar/db` | Belongs to a `Task`. Flat, ordered (`position`, append-only — no reordering support), independently checkable (`done`). No nesting, no per-item assignee/due date. |

No new tables for calendar — `getUpcomingEvents` is a read-only query
across existing tables, per Section 12's "Calendar unifies deadlines..."
rather than a calendar being its own data store.

## Permissions

- Read: `clients:read` on the project's/task's owning client.
- Write (create project, create task, change task status, add/toggle/
  delete a checklist item): `clients:write` on the owning client. There
  is no separate "task-level" permission — anyone who can write to the
  client can manage all of its projects/tasks/checklist items. Revisit
  if a role ever needs write access to tasks but not, say, Brand DNA.

## Events

`project.created`, `task.created`, `task.status_changed`,
`task_checklist_item.created`, `task_checklist_item.toggled`,
`task_checklist_item.deleted` (audit), plus a `project_created`
`ClientTimelineEvent` (checklist items are routine sub-task bookkeeping,
not client-facing activity, so they don't get a timeline event the way
task completion does).

## APIs / entry points

- `POST /api/clients/[id]/projects` — create a project.
- `POST /api/projects/[projectId]/tasks` — create a task, optional
  `assigneeId` (a Membership id) and `dueDate`.
- `setTaskStatusAction` (server action) — change a task's status; bound
  directly to a `<select>` in the UI, no client-side fetch needed.
- `POST /api/tasks/[taskId]/checklist` — add a checklist item (`text`),
  appended at the end (`position` = current item count).
- `POST /api/checklist-items/[id]/toggle` — flip `done`; no request
  body, the current value is read and inverted server-side.
- `DELETE /api/checklist-items/[id]` — remove a checklist item.

## UI

- `/clients/[id]` — "Projects" card lists projects (linking to their
  detail page) with an inline "+ New project" quick-add
  (`clients:write` only).
- `/clients/[id]/projects/[projectId]` — task list with inline status
  changes, a "new task" form (assignee dropdown populated from active
  org memberships), campaign list (read-only), and now a per-task
  checklist: a `done/total` count, each item with a checkbox and (for
  writers) a delete button, and an "+ Checklist item" quick-add. The
  checklist section is hidden entirely for a read-only viewer when a
  task has no items, so it never clutters the list with an empty
  affordance no one can use.
- `/calendar` — org-wide (or client-scoped, for a collaborator without
  org-wide `clients:read`) view of everything due in the next 60 days:
  task due dates, project due dates, invoice due dates. Reuses
  `getReadableClientIds` — the same client-visibility rule as `/clients`.
  Checklist items have no due date of their own, so they don't appear
  here — they're sub-steps of a task, not independently schedulable.

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
- **Empty checklist item text:** rejected before any database write,
  same as an empty task title.

## Acceptance tests

- `apps/web/src/lib/services/project-and-calendar.integration.test.ts` —
  14 tests against real Postgres (up from 6): project creation +
  timeline event, cross-organization project rejection, task
  creation/assignment/status transition, invalid-assignee rejection,
  permission rejection for a role without `clients:write`, and
  `getUpcomingEvents` unifying task/project/invoice due dates within a
  window with correct client-scoping and chronological ordering — plus
  a new block covering checklist items: items append in order with the
  correct `position`, a real toggle flips `done` and flips back, delete
  actually removes the row and leaves the others intact, an empty-text
  add is rejected, a `clients:write`-less write is rejected, and a
  cross-organization task or item is rejected for both add and toggle.
- `apps/web/src/app/api/tasks/[taskId]/checklist/route.contract.test.ts`
  — 5 tests (401/400 missing text/403/200 with a real persisted row at
  `position: 0`/400 cross-organization).
- `apps/web/src/app/api/checklist-items/[id]/toggle/route.contract.test.ts`
  — 4 tests (401/403/200 flips then flips back, cross-checked against
  the real row/400 cross-organization).
- `apps/web/src/app/api/checklist-items/[id]/route.contract.test.ts`
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

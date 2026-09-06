# Module: Projects, Tasks & Calendar

Status: **Partially implemented (Phase 1 slice)**. Bible reference:
Section 12.

## Purpose

Operational work tracking per client (projects, tasks, assignment, due
dates) and a unified calendar view of everything with a date attached
across modules, so nothing is tracked in a separate spreadsheet.

## What's not built yet

Section 12 also calls for **milestones and dependencies with
overdue/risk signals**, task **priority/estimate/checklist/comments/
attachments**, and **reusable project templates** — none of that exists.
`Task` today is title + status + assignee + due date only, and `Project`
has no milestone concept separate from its own single `dueDate`. This is
a deliberate scope cut for this slice, not an oversight — extend `Task`/
`Project` (or add a `Milestone` model) when a real need for dependency
tracking or templates shows up, rather than modeling it speculatively now.

## Entities

| Model | Package | Notes |
|---|---|---|
| `Project` | `@cedar/db` | Belongs to a `Client`. `status` is a free string today (PLANNING/IN_PROGRESS/IN_REVIEW/DELIVERED/ARCHIVED by convention, not an enum — see schema comment). |
| `Task` | `@cedar/db` | Belongs to a `Project`; `assigneeId` references a `Membership`, not a `User` — assignment is org-scoped. |

No new tables for calendar — `getUpcomingEvents` is a read-only query
across existing tables, per Section 12's "Calendar unifies deadlines..."
rather than a calendar being its own data store.

## Permissions

- Read: `clients:read` on the project's/task's owning client.
- Write (create project, create task, change task status): `clients:write`
  on the owning client. There is no separate "task-level" permission —
  anyone who can write to the client can manage all of its projects/tasks.
  Revisit if a role ever needs write access to tasks but not, say, Brand
  DNA.

## Events

`project.created`, `task.created`, `task.status_changed` (audit), plus a
`project_created` `ClientTimelineEvent`.

## APIs / entry points

- `POST /api/clients/[id]/projects` — create a project.
- `POST /api/projects/[projectId]/tasks` — create a task, optional
  `assigneeId` (a Membership id) and `dueDate`.
- `setTaskStatusAction` (server action) — change a task's status; bound
  directly to a `<select>` in the UI, no client-side fetch needed.

## UI

- `/clients/[id]` — "Projects" card lists projects (linking to their
  detail page) with an inline "+ New project" quick-add
  (`clients:write` only).
- `/clients/[id]/projects/[projectId]` — task list with inline status
  changes and a "new task" form (assignee dropdown populated from active
  org memberships), campaign list (read-only).
- `/calendar` — org-wide (or client-scoped, for a collaborator without
  org-wide `clients:read`) view of everything due in the next 60 days:
  task due dates, project due dates, invoice due dates. Reuses
  `getReadableClientIds` — the same client-visibility rule as `/clients`.

## Jobs

None. Synchronous.

## Metrics

None instrumented yet. Candidate: overdue task/project count per client,
feeding the future Client Health Score (Section 4.2).

## Failure modes

- **Cross-organization project/client IDs:** rejected the same way as
  Brand DNA and Client Management — the service layer re-verifies
  `organizationId` after the permission check, not just before.
- **Assigning a task to a non-member:** rejected explicitly
  (`createTask` checks the `assigneeId` resolves to a `Membership` in the
  same organization) rather than silently creating a dangling reference.
- **Invalid task status value:** rejected before any database write.

## Acceptance tests

- `apps/web/src/lib/services/project-and-calendar.integration.test.ts` —
  6 tests against real Postgres: project creation + timeline event,
  cross-organization project rejection, task creation/assignment/status
  transition, invalid-assignee rejection, permission rejection for a role
  without `clients:write`, and `getUpcomingEvents` unifying task/project/
  invoice due dates within a window with correct client-scoping and
  chronological ordering.
- Manual smoke test performed for this slice: created a project and task
  via the real HTTP routes while logged in, confirmed both appeared on
  `/calendar` and the project detail page rendered correctly.

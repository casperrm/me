# Cedar Experience Engine v1: Frequently Selected Templates

- **Status:** Implemented (first cut)
- **Bible section:** 22 (Cedar Experience Engine)
- **Date:** 2026-09-10

## What Section 22 asks for

> Learn non-sensitive workflow preferences such as commonly used views,
> recurring command patterns, preferred approval routes, and frequently
> selected templates. Adapt recommendations and shortcuts without hiding
> functionality or weakening controls. Users can reset or override learned
> preferences.

Of the four named examples, only "frequently selected templates" already
had a real, existing data source in this codebase: `createProjectFromTemplate`
(`project-template-service.ts`) has recorded the real `templateId` on a
`project.created_from_template` `AuditEvent` for every instantiation since
project templates were built (Section 23.2's audit schema). This slice is
the first thing that reads that already-recorded history back out as a
usage signal — no new instrumentation, no new schema.

The other three examples ("commonly used views," "recurring command
patterns," "preferred approval routes") have no comparable real signal
anywhere in this system — there is no page-view log, no Command Palette
invocation log, and `Approval.decidedBy` only covers creative approvals,
not a general "route." Building any of those now would mean inventing
data this system doesn't actually have, which this project's own rules
rule out. They remain unbuilt; only the one example with a genuine data
source shipped.

## What was built

`apps/web/src/lib/services/project-template-service.ts` gained
`getTemplateUsageCounts(organizationId): Promise<Map<string, number>>`,
which reads every `project.created_from_template` `AuditEvent` for the
organization, parses each one's `changeSet.templateId`, and counts real
instantiations per template.

Two real touchpoints use it to "adapt recommendations and shortcuts
without hiding functionality":

1. **`/templates` (template management page):** templates are sorted
   most-used-first (a stable sort, so equally-used or never-used templates
   keep their original newest-first order), and each card shows "used N
   time(s)" or "not used yet."
2. **The Client 360 page's "+ From template" picker
   (`NewProjectFromTemplateForm`):** the dropdown options are sorted the
   same way, and each option's label includes `, used Nx` when it has any
   real usage — the actual "shortcut" moment Section 22 describes, since
   this is where someone picks a template while creating a project.

Nothing is hidden in either case — every template still appears, in both
places, regardless of usage count. Only the order and an informational
label changed.

## Explicit scope boundary

- **Not a per-user preference.** Nothing in this system tracks which
  individual user selected which template — only how often the
  organization as a whole has used each one. Section 22 says "workflow
  preferences," which could mean a per-user profile, but there's no
  per-user selection log to build a real one from. Building a per-user
  model on top of an org-wide signal would misrepresent what's actually
  known, so this stays an org-wide statistic, stated as such in the code
  comment.
- **Nothing to "reset or override."** Section 22's other requirement
  ("Users can reset or override learned preferences") applies to stored,
  potentially-stale learned state. This has none: `getTemplateUsageCounts`
  recomputes directly from real audit history on every read. There is no
  cache, no profile row, nothing that could drift from the underlying
  facts or need resetting.

## Tests

`apps/web/src/lib/services/project-template-service.integration.test.ts`
gained a new `describe("getTemplateUsageCounts")` block (3 new tests, 27
total in the file) against real Postgres:

- Counts real usage correctly across multiple templates and multiple
  instantiations of the same template.
- A template that has never been instantiated is absent from the map
  entirely (never a fabricated zero-with-no-basis entry — though the UI
  layer still treats an absent key as zero for display).
- Usage recorded under a different organization is never counted — proven
  by creating a second org, its own template, and its own instantiation,
  then confirming the first org's usage map has no entry for it.

## Verification performed

- `npx tsc --noEmit` on `apps/web` and every workspace: clean.
- `npx eslint` on the new/changed files: clean.
- Full `apps/web` vitest suite: 606/606 passed (93 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15 packages.
- Production build (`next build`): succeeded.
- Live smoke test against a real running production build, driven entirely
  through the real UI (not direct DB writes): logged in, used the real
  "Save as template" form on a real project to create two real templates,
  then used the real "+ From template" picker to instantiate one template
  3 times and the other once. Reloaded `/templates` and confirmed the
  more-used template sorted first with "used 3 times" / "used 1 time"
  shown correctly, screenshot-verified. Reopened the Client 360 picker and
  confirmed its option labels showed the same real counts (`, used 3x` /
  `, used 1x`). All fixture projects, templates, template tasks, audit
  events, and timeline events created during the smoke test were deleted
  afterward, and template/audit-event counts were confirmed back to the
  pre-test baseline.

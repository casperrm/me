# Client Editing

- **Status:** Implemented (first cut)
- **Bible section:** 4 (Client Management)
- **Date:** 2026-09-11

## The gap

`docs/specs/client-creation.md`'s own explicit scope boundary named this
as the deferred next step: *"No client editing UI. This slice closes
'creation didn't exist'; updating an existing client's name/industry/
contact info after creation is a distinct, smaller gap, not addressed
here."* A follow-up investigation confirmed it directly: `client-service.ts`
exported exactly one function (`createClient`); `prisma.client.update` and
`tx.client.update` had zero non-test call sites anywhere; `apps/web/src/app/
api/clients/` had no `[id]/route.ts` with a write handler for the `Client`
record itself (only subresource routes — `projects`, `brand`, `assets`,
`notes`, `content`, `shoots`); and the only "edit" page under `/clients/[id]/`
was `brand/edit`, which edits `BrandProfile`, not `Client`. Once created, a
client's `name`, `companyName`, `industry`, `lifecycleStage`,
`primaryContactName`, and `primaryContactEmail` were permanently fixed — a
typo at creation time, or a real PROSPECT → ACTIVE transition, was
unfixable through the app.

## What was built

`apps/web/src/lib/services/client-service.ts` gained `updateClient(params)`,
the missing write half of `createClient`:

- Gated on `clients:write`, **scoped to the client being edited** (not
  org-wide like `createClient`) — editing an existing client is a write on
  that specific client, the same tier `createProject`/`createShoot`/
  `createNote` already use for writes on an already-existing client.
- Every field is optional — only fields actually passed are validated and
  changed. `name`/`companyName` reject an empty string; `lifecycleStage` is
  validated against the same four real values; `industry`/
  `primaryContactName`/`primaryContactEmail` are cleared to `null` when
  given an empty string (a deliberate "clear this field" affordance, not a
  no-op).
- Rejects a call with zero fields provided (`AuthError`).
- Emits a real `AuditEvent` (`action: "client.updated"`) whose `changeSet`
  is a genuine `{ before, after }` diff of only the fields that actually
  changed value — not the whole row, and not emitted at all when nothing
  changed (e.g. re-submitting the same name).

New `PATCH /api/clients/[id]` route, mirroring the sibling `POST
/api/clients` route's shape (401/403/400/200).

New `/clients/[id]/edit` page + `EditClientForm.tsx`, structurally the
same form as `/clients/new`'s `NewClientForm.tsx` but pre-filled from the
real client row and submitting via `PATCH`. A new "Edit details" link on
the client detail page header, visible only when the viewer's own
`clients:write` for that client (`canWrite`, already computed on that
page) allows it.

## Explicit scope boundary — what this deliberately does NOT do

- **No `services`/`connectedAccounts` editing.** Same reasoning as
  `client-creation.md`: nothing in the app writes to either field yet at
  all (services stays `[]`, connectedAccounts is populated later via the
  Integration Center's own connection flow) — this slice doesn't invent a
  UI for fields nothing else touches.
- **No bulk edit / CSV re-import.**
- **No "convert prospect to active" workflow automation** (an approval
  step, a triggered kickoff-project creation, etc.) — `lifecycleStage` is
  a plain field on this form, changeable directly, matching
  `client-creation.md`'s own explicit deferral of that exact follow-up.
- **No client deletion/archival.** A separate, larger question (what
  happens to a deleted client's projects/invoices/history) this slice
  doesn't answer.

## Testing

- `apps/web/src/lib/services/client-service.integration.test.ts` (extended
  with a new `describe("updateClient")` block, 7 tests against real
  Postgres): updates only the fields provided and records a correct
  before/after diff; clears an optional field to `null` on an empty
  string; emits no audit event when nothing actually changed; rejects a
  call with no fields; rejects an invalid `lifecycleStage`; rejects a
  member with no `clients:write` for that client; rejects a client from a
  different organization.
- `apps/web/src/app/api/clients/[id]/route.contract.test.ts` (new): 401
  signed out, 403 for a DESIGNER without `clients:write`, 200 persisting
  the real change, 400 for an invalid `lifecycleStage`, 400 for a client
  in a different organization.
- Full `apps/web` vitest suite: 662/662 passed (101 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15
  packages.
- Production build (`next build`): succeeded; `/clients/[id]/edit` built
  as a real route.

## Live smoke test

Against a real running production build (fresh `next start`, no stale
process), via real Playwright/Chromium against the real seeded owner
account, on the real seeded "Volt Mobile" client (not a fixture insert,
since this is a mutation on existing data):

1. Logged in as the seeded OWNER, opened the real client's detail page,
   confirmed the new "Edit details" link renders.
2. Clicked through to `/clients/[id]/edit`, confirmed the form was
   genuinely pre-filled with the real `name` ("Volt Mobile") from
   Postgres — not a blank form.
3. Changed the lifecycle stage to `PAUSED` and the industry field, and
   submitted. Confirmed the real `PATCH /api/clients/[id]` request
   returned `200`, and the detail page (after redirect) showed the new
   `PAUSED` badge.
4. Queried Postgres directly and confirmed both the row and the real
   `client.updated` `AuditEvent`'s `changeSet` matched exactly — a genuine
   `{ before: { industry: "...", lifecycleStage: "ACTIVE" }, after: {
   industry: "...", lifecycleStage: "PAUSED" } }` diff, proving the
   before/after tracking is real, not just logged as the new state.
5. Reverted the seeded client's `industry`/`lifecycleStage` directly in
   Postgres and deleted the fixture `client.updated` audit event
   afterward, confirmed the dev database's one seeded client matched its
   exact original baseline field-for-field (including
   `primaryContactName`/`primaryContactEmail`, untouched by this test).

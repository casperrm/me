# Client Creation

- **Status:** Implemented (first cut)
- **Bible section:** 4 (Client Management)
- **Date:** 2026-09-11

## The gap

Client is this system's primary entity — every other module (projects,
campaigns, creatives, invoices, meetings, health scores, the opportunity
engine, the whole Client Portal) hangs off it. Despite that, and despite
`ROADMAP.md` marking Phase 1 ("Agency Core") complete, a dedicated Explore
agent's exhaustive codebase search confirmed **there was no way to create a
new Client anywhere in the running application**:

- No `apps/web/src/app/api/clients/route.ts` existed — only
  `[id]`, `[id]/projects`, `[id]/brand`, `[id]/assets`, `[id]/content`,
  `[id]/shoots` subroutes, all of which assume a client already exists.
- No service function anywhere called `prisma.client.create` outside of
  `packages/db/prisma/seed.ts` and test fixture setup.
- No server action created a client.
- `/clients/page.tsx`'s empty state literally told the user to run `npm run
  db:seed for demo data` — the only path to a second client was reseeding
  the whole database.

This is the same "declared but never wired" shape this project has caught
repeatedly this session (`audit:read`, `AuditEvent.approvalId`) — but more
severe, since those were secondary read/audit surfaces, and this is core
CRUD on the system's central entity.

## What was built

`apps/web/src/lib/services/client-service.ts` exports `createClient(params)`:

- Gated on `clients:write`, **org-wide** (no `clientId`) — a brand-new
  client doesn't yet belong to any existing client, the same reasoning
  `createProjectTemplateFromProject`'s sibling org-wide functions and
  `renameProjectTemplate`/`deleteProjectTemplate` already use. `can()`
  (`packages/domain/src/policy.ts`) restricts this to OWNER, ADMIN, or an
  explicit org-wide `ScopedGrant`.
- Validates `name`/`companyName` (trimmed, non-empty).
- Defaults `lifecycleStage` to `"ACTIVE"` and validates it against the
  schema's real four values (`PROSPECT | ACTIVE | PAUSED | CHURNED`).
- `services` is initialized to `"[]"` — Section 4's "services" JSON array
  has no dedicated UI yet anywhere in the app (see Scope below), so a new
  client starts with none rather than fabricating a default list.
- Emits a real `AuditEvent` (`action: "client.created"`, `resourceType:
  "Client"`, `resourceId`/`clientId`: the new client's id).

New `POST /api/clients` route, mirroring
`POST /api/clients/[id]/projects`'s exact shape: 401 signed-out, 400
missing/invalid fields, 403 `AuthorizationError`/`MfaRequiredError`, 200
`{ ok: true, clientId }`.

New `/clients/new` page (gated the same `clients:write` org-wide way,
showing `PermissionDenied` otherwise) with a dedicated form
(`NewClientForm.tsx`) for all of `Client`'s real baseline fields: name,
company name, industry, lifecycle stage, primary contact name/email. On
success it redirects straight to the new client's detail page.

`/clients` list page gained a "+ New Client" button, visible only to
actors who pass the same `clients:write` org-wide check (mirroring how
`canSeeTemplates` gates the Project Templates nav item) — and the
empty-state copy now tells a permitted actor they can create their first
client, rather than only pointing at the seed script.

## Explicit scope boundary — what this deliberately does NOT do

- **No bulk import / CSV upload.** A real, separate feature with its own
  validation and dedup questions this slice doesn't invent answers to.
- **No "convert prospect to active" workflow automation.** `lifecycleStage`
  is a plain field on this form and can be set directly; there is no
  transition history, approval step, or triggered side effect (e.g.
  auto-creating a kickoff project) wired to changing it. That's a
  reasonable future increment, not required to close "there's no way to
  create a client at all."
- **No client logo/avatar upload.** Section 4 doesn't require one, and no
  other part of the app (client cards, detail header) renders one yet.
- **No `connectedAccounts` field on the form.** That's populated later via
  the Integration Center's connection flow (`docs/specs/integration-center.md`),
  not at client-creation time — Section 4's "services" JSON array is the
  same story: nothing in the app writes to it yet at all, so this slice
  doesn't invent a UI for it either, only initializes it to `[]`.
- **No client *editing* UI.** This slice closes "creation didn't exist";
  updating an existing client's name/industry/contact info after creation
  is a distinct, smaller gap, not addressed here.

## Testing

- `apps/web/src/lib/services/client-service.integration.test.ts` (new, real
  Postgres): creates a real client with every optional field populated,
  confirms the real `AuditEvent`; confirms `lifecycleStage`/`services`
  defaults when omitted; rejects blank `name`/`companyName` and an invalid
  `lifecycleStage`; rejects a member with no org-wide `clients:write`;
  confirms a member with an explicit org-wide `ScopedGrant` for
  `clients:write` (`clientId: null`) can still create a client — the same
  grant tier already proven for project-template management.
- `apps/web/src/app/api/clients/route.contract.test.ts` (new): 401 signed
  out, 400 missing `name`/`companyName`, 403 for a DESIGNER without
  `clients:write`, 200 persisting a real row with a real audit event, a
  default-lifecycle-stage case, and 400 for an invalid `lifecycleStage`.
- Full `apps/web` vitest suite: 641/641 passed (98 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15 packages.
- Production build (`next build`): succeeded; `/api/clients` and
  `/clients/new` both built as real routes.

## Live smoke test

Against a real running production build (fresh `next start`, no stale
process — checked via `ps`/`lsof` first), via real Playwright/Chromium
against the real seeded owner account:

1. Logged in as the seeded OWNER (`consultingcedarpoint@gmail.com`).
2. Navigated to `/clients`, confirmed the "+ New Client" button renders.
3. Clicked through to `/clients/new`, filled out every field (name,
   company name, industry, lifecycle stage `PROSPECT`, primary contact
   name/email), and submitted.
4. Confirmed the real `POST /api/clients` request returned `200` with a
   real `clientId`, and the browser was redirected to that client's real
   detail page, which rendered the correct name.
5. Navigated back to `/clients` and confirmed the new client's card now
   appears in the real list.
6. Queried Postgres directly and confirmed every field matched what was
   typed, and a real `client.created` `AuditEvent` existed with the
   correct `resourceId`/`clientId`/`result: SUCCESS`.
7. Deleted the fixture client and its audit event directly in Postgres
   afterward and confirmed the dev database returned to its exact seeded
   baseline (`Volt Mobile` — the only client, same id as before this
   slice started).

One real bug was caught and fixed during this smoke test itself, not left
in the product: the first Playwright attempt used a generic
`button[type="submit"]` selector, which matched the **sidebar's own "Log
out" button** (rendered as `<button type="submit">` inside a server-action
`<form>` on every authenticated page, per `apps/web/src/app/(app)/layout.tsx`)
before ever reaching the actual "Create client" button, logging the test
session out and producing a false failure. This was a test-script bug, not
a product bug — fixed by scoping the click to the button's own text
("Create client"), after which the real flow above passed cleanly. Noted
here since it's a reusable trap: any future smoke test clicking a generic
submit selector on an authenticated `(app)` page risks silently triggering
logout instead of the intended form.

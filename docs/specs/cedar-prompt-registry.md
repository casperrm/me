# Module: Cedar Prompt Version Registry (Section 33)

Status: **Implemented (auto-captured, read-only)**. Closes an item
ADR-007's "what this ADR will need to decide" list had named: a
"[p]rompt/model version registry so `AIRequest`/`AgentRun` records
(Section 3's domain model) can cite exactly what produced a given
output."

## Why not a mutable prompt editor

The obvious reading of "prompt registry" is an admin UI where someone
edits the live system prompt without a code deploy. That was
considered and **rejected**: Cedar Brain's system prompt is shared
code, identical for every organization using this deployment — there
is currently no per-organization prompt customization anywhere in the
system. A mutable editor reachable by *any* organization's admin would
mean one organization's admin could silently change Cedar Brain's
behavior for every other organization on the same deployment — a real
multi-tenancy bug, not the feature Section 33 is asking for.

## What this actually builds: real, auto-captured history

- **`SYSTEM_PROMPT_TEMPLATE`** (`apps/web/src/lib/cedar-brain.ts`) — the
  static instructional portion of the system prompt, extracted from
  `callCedarBrain`'s inline template into its own named, exported
  constant. `buildSystemPrompt()` still interpolates the per-request
  bits (the routed agent list, governed context) around it, but the
  *template* — the part that actually defines Cedar Brain's behavior —
  is now a single source of truth that can be captured verbatim.
  Extracting it changed the literal prompt text (structure, not
  intent), so per `cedar-brain.ts`'s own documented convention
  ("bumped manually whenever the system prompt changes"),
  `CEDAR_BRAIN_PROMPT_VERSION` was bumped `"v3"` → `"v4"`.
- **`CedarPromptSnapshot`** (schema) — `promptVersion` (unique),
  `template` (the real text), `recordedAt`. System-wide, no
  `organizationId` — this is a build-artifact-style audit log, not
  tenant data, matching the precedent set by `AiEvalRun`.
- **`ensurePromptSnapshotRecorded(version, template)`** — called from
  `/api/cedar-brain/route.ts` on every request, but genuinely cheap:
  an in-process `Set` guard means only the *first* request in a given
  server process actually round-trips to Postgres for a given version;
  every later call in that process is a synchronous no-op. If the
  stored text for an already-recorded version ever differs from what's
  passed in — someone changed the prompt without bumping the version,
  violating the file's own convention — the stored row is updated to
  the real current text rather than silently keeping stale content
  under a live label. The call is wrapped in try/catch in the route:
  a failure to record an audit snapshot never breaks an actual Cedar
  Brain request.
- **No route or UI in this app ever writes a `CedarPromptSnapshot` row
  directly** — the only writer is `ensurePromptSnapshotRecorded`,
  called from exactly one place. There is deliberately no
  `POST /api/prompt-registry` or equivalent.

## UI

`/command/supervisor` gained a "Prompt version history" card: every
captured version, newest first, each as a collapsed `<details>` — the
version label and capture timestamp always visible, the real template
text revealed on click (`<pre>`, monospace, real text). Read-only, no
form, no `organization:manage` gate — visibility here follows
`ai:supervise` (the same permission that gates the whole page), since
reading historical prompt text is exactly the kind of thing AI
oversight visibility is for.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- `apps/web/src/lib/services/prompt-registry-service.integration.test.ts`
  (5 tests against real Postgres): first capture stores the real text;
  a second call with identical content is a true no-op (timestamp
  unchanged); a call with genuinely different content for the *same*
  version updates the stored row (the drift-detection case); the
  in-process guard actually short-circuits (a second call's content is
  never written, proven by passing different text and confirming the
  first text survives); `getPromptSnapshots` returns real rows
  newest-first.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` gained one
  new test: after a real request through the route, a
  `CedarPromptSnapshot` row exists for the current
  `CEDAR_BRAIN_PROMPT_VERSION` with `template` exactly equal to the
  real, live `SYSTEM_PROMPT_TEMPLATE` export — not a copy or a
  paraphrase, byte-for-byte the same string the running code would
  actually send to Anthropic.
- Full `apps/web` vitest suite: 202/202 passing across 34 files (196
  before this slice + 6 new — 5 from the new service test file, 1 new
  case in the existing cedar-brain route-contract suite).
- `npm run build --workspace=@cedar/web`: succeeds.
- **Live smoke test against the real running server and the seeded dev
  database, with a direct-SQL cross-check**: confirmed
  `cedar_prompt_snapshots` was empty before this slice's first real
  use, logged in as the seeded owner, sent one real prompt through
  `/api/cedar-brain`, and confirmed via direct SQL that a `v4` row
  existed with the real template text (`SELECT promptVersion,
  LEFT(template, 60), recordedAt`). Reloaded `/command/supervisor` and
  confirmed the "Prompt version history" card rendered it. The
  smoke-test `CedarBrainRequest` row was deleted afterward to restore
  the dev database's demo-data state — but the `cedar_prompt_snapshots`
  row was deliberately **left in place**: unlike a budget or an eval
  run (real judgment-call actions a fictional admin took, which would
  misrepresent the demo environment if left behind), this row is a
  deterministic, code-derived artifact with exactly one correct value
  for the deployed code — any future real use of this environment
  would regenerate the identical row on its own. Leaving it doesn't
  introduce anything the system wouldn't produce through ordinary
  legitimate use.

## Scope boundary — stated explicitly

- **Read-only, no admin editing.** See "Why not a mutable prompt
  editor" above. If per-organization prompt customization is ever a
  real product requirement, that's a materially different, separately-
  scoped feature (would need real multi-tenant prompt storage, not
  just this audit trail).
- **Cedar Brain's system prompt only.** Other prompts in the codebase
  (if any are added later — e.g. a future eval-harness judge prompt)
  would need their own registry entries; this doesn't generalize
  automatically.
- **No model-version registry** — `modelName` is already recorded
  per-request on `CedarBrainRequest` (a plain string, `"claude-sonnet-5"`
  today), which was sufficient for what this slice addressed. A model
  *catalog* (available models, pricing, capabilities) is a different,
  larger undertaking tied to Section 33's "route to the least
  expensive model" ask — not attempted here.

## Acceptance

- `apps/web/src/lib/cedar-brain.ts` — `SYSTEM_PROMPT_TEMPLATE` extracted
  and exported; `CEDAR_BRAIN_PROMPT_VERSION` bumped to `"v4"`.
- `packages/db/prisma/schema.prisma` — `CedarPromptSnapshot` model,
  migration `20260907070922_add_cedar_prompt_snapshot`.
- `apps/web/src/lib/services/prompt-registry-service.ts` — the module.
- `apps/web/src/app/api/cedar-brain/route.ts` — wired in.
- `apps/web/src/app/(app)/command/supervisor/page.tsx` — UI card.
- `apps/web/src/lib/services/prompt-registry-service.integration.test.ts`
  and one new case in
  `apps/web/src/app/api/cedar-brain/route.contract.test.ts` — 6 new
  tests total.

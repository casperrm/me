# Module: Cedar Brain Per-Agent Output Breakdown (Section 4/6.1)

Status: **Implemented**. Closes a real, silent gap: the Command Center's
response already carried a `plan[]` array (one entry per routed agent),
but live mode always set every `plan[].output` to `null`, and the UI
never rendered `plan[]` at all — real per-agent structure existed in
the data model and was thrown away at both ends.

## Why not "make one real API call per agent"

The header comment in `cedar-brain.ts` has always said the real version
should "fan work out to dedicated ... agents ... and merge their
output" — the most literal reading of that is one Anthropic API call
per routed agent, each with a specialist system prompt. That was
considered and **rejected** for this slice: Section 33's model-routing/
budget-governance mechanism doesn't exist yet (see ADR-007's "what this
ADR will need to decide" section — no per-user/workflow/provider budget
enforcement is built). Multiplying real API spend by the number of
routed agents (routing already appends `quality_control` to nearly
everything, so this is rarely fewer than 2 calls, often 3+) with zero
cost safety net would introduce exactly the kind of ungoverned spend
risk the Bible itself says needs governance *before* this kind of
fan-out, not alongside it.

## The actual fix: one call, structured output, real parsing

Live mode still makes **exactly one** Anthropic API call per Cedar
Brain request — no change to real-world cost or latency. What changed
is the system prompt: it now asks the model to structure its own
response as one labeled section per routed agent —

```
### marketing
<marketing's concrete contribution>

### quality_control
<quality_control's concrete contribution>
```

— and `parsePerAgentSections()` (`apps/web/src/lib/cedar-brain.ts`)
splits that text into real `{ agent, output }` entries. This gives
genuine per-agent output with **zero additional API cost**.

**The parser only trusts a complete parse.** If the model doesn't
follow the format, or a routed agent is missing its section, `parsePerAgentSections`
returns `null` — the caller then falls back to the original behavior
(`plan[].output: null`, full text only in `summary`), exactly as
before this slice. A partial or malformed parse is never silently
presented as if it were a clean structured breakdown; the UI's fallback
path (below) handles this the same way it always has.

Stub mode is unaffected — it already produced real per-agent
placeholder text in `plan[]`; only the UI making use of it is new.

## Prompt version bump

`CEDAR_BRAIN_PROMPT_VERSION` bumped `"v2"` → `"v3"` per its own
documented convention ("bumped manually whenever the system prompt
changes"), since the system prompt's actual instructions changed. Every
`CedarBrainRequest` row from this point on records `"v3"`; existing
rows keep their real historical `"v2"`, so a quality regression traced
back through AI Supervisor telemetry can still be attributed to the
prompt revision that produced it.

## UI: the breakdown is finally rendered

`CommandCenterForm.tsx` now renders `result.plan` as a per-agent
breakdown (one heading + body per agent with real output) whenever at
least one `plan[]` entry has real output — true in stub mode always,
and in live mode whenever `parsePerAgentSections` succeeded. Falls back
to the raw `result.summary` text otherwise (live mode when parsing
failed) — the exact same content the UI showed before this slice, so
there's no regression case where output that used to be visible
becomes hidden.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- `apps/web/src/lib/cedar-brain.test.ts` gained 5 new tests for
  `parsePerAgentSections` (now exported for direct testing): splits a
  well-formed response correctly, returns `null` for an unstructured
  response, returns `null` when a routed agent's section is missing
  (proving a partial parse is rejected rather than silently trusted),
  ignores a section for an agent that wasn't actually routed, and
  handles sections in any order.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` updated for
  the `promptVersion: "v3"` bump (was asserting `"v2"`).
- Full `apps/web` vitest suite: 177/177 passing across 30 files (172
  before this slice + 5 new).
- `npm run build --workspace=@cedar/web`: succeeds; `/command` and
  `/command/supervisor` both compile with their updated bundles.
- **Live smoke test against the real running server and the seeded dev
  database, at the browser level (Playwright), not just the HTTP API**:
  logged in as the seeded owner, submitted a real prompt through the
  actual Command Center form, and confirmed via the rendered DOM that
  two per-agent headings (`marketing`, `quality control`) appeared with
  their real stub-mode output text — proving the UI change works
  end-to-end through a real browser, not just that the API response
  shape is correct. `ANTHROPIC_API_KEY` is unset in this sandboxed
  environment (confirmed by checking its length in `.env` before
  testing), so `parsePerAgentSections`'s behavior against a *real*
  Anthropic response could not be smoke-tested here — only against
  representative model-output shapes in the unit tests above. This
  matches every other live-mode verification in this session: no real
  Anthropic API calls have been made by any of this session's work.
  The `cedar_brain_requests` row created during the smoke test was
  deleted afterward, restoring the dev database to a clean state.

## Scope boundary — stated explicitly

- **Still one call per request, not one per agent** — see "Why not"
  above. Real per-agent specialization via separate calls remains
  legitimate future work, gated on Section 33's budget/cost-governance
  mechanism actually existing first.
- **No new telemetry granularity** — `CedarBrainRequest` still records
  one aggregate `inputTokens`/`outputTokens` pair per request (unchanged,
  since there's still only one API call). Per-agent token attribution
  isn't meaningful until per-agent calls exist.

## Acceptance

- `apps/web/src/lib/cedar-brain.ts` — `parsePerAgentSections`, updated
  system prompt, `CEDAR_BRAIN_PROMPT_VERSION` bump to `"v3"`.
- `apps/web/src/app/(app)/command/CommandCenterForm.tsx` — renders the
  per-agent breakdown.
- `apps/web/src/lib/cedar-brain.test.ts` — 5 new tests.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` — updated
  for the prompt version bump.

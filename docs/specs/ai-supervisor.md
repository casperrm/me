# Module: AI Supervisor Telemetry

Status: **Implemented (Phase 3 slice)**. Bible reference: Section 6.3
("Track agent/model success rate, evaluation score, latency, cost,
retries, tool failures, hallucination/error reports, and user
corrections. Maintain prompt/model versions and evaluation datasets...
Alert when quality or cost crosses configured thresholds; never
silently self-modify production behavior").

## Purpose

Every Cedar Command Center request already got logged to
`CedarBrainRequest` (per ADR-007), but only as a raw prompt/response
pair — there was no way to answer "is Cedar Brain actually working
well?" without reading raw rows by hand. This slice makes the existing
log a real oversight surface, and fixes a real gap along the way: the
route only ever logged *successful* requests, silently dropping every
failure from the record entirely.

## What's real here

`CedarBrainRequest` gained fields populated from actually-measured
values at request time (`/api/cedar-brain/route.ts`):

- **`mode`** — `"live"` or `"stub"`, exactly what `callCedarBrain`
  returned.
- **`modelName`** — `"claude-sonnet-5"` for a live call, `null` for
  stub (no model was actually invoked).
- **`promptVersion`** — `CEDAR_BRAIN_PROMPT_VERSION`, a constant in
  `cedar-brain.ts` bumped manually whenever the system prompt text
  changes. The closest real thing to Section 33's prompt/model version
  registry until that's built — every request can be traced to exactly
  which prompt revision produced it.
- **`latencyMs`** — wall-clock `Date.now()` delta around the
  `callCedarBrain` call, for both success and failure.
- **`success`** / **`errorMessage`** — the real try/catch outcome. The
  route now writes a `CedarBrainRequest` row in the `catch` block too,
  closing the gap where failures were previously invisible.
- **`inputTokens`** / **`outputTokens`** — read directly from the
  Anthropic API response's `usage` field for a live call. This stands
  in for "cost" (Section 6.3) without computing a dollar figure that
  would need a hardcoded price and go stale the moment pricing changes
  — a token count is the actual number the provider returned, never
  estimated.
- **`flaggedIncorrect`** / **`flaggedAt`** / **`flaggedByMembershipId`**
  — Section 6.3's "user corrections" signal. A human clicking "Flag as
  incorrect" on the Command Center page is a real correction, unlike an
  automated evaluation score this system has no harness to compute.

## Scope boundary — stated explicitly

**Not built, because there's no real data source for it:**

- **Evaluation score** — would need an automated eval harness (a
  reference dataset, a scoring rubric, a judge model) that doesn't
  exist. Nothing here computes or displays a quality score.
- **Retries / tool failures** — `callCedarBrain` makes exactly one
  direct API call with no retry logic and no tool-calling; there is
  nothing to count.
- **Prompt/model version *registry*** — `promptVersion` is a single
  manually-bumped string constant, not a versioned, queryable registry
  of prompt text with diff history (Section 33's fuller ask).
- **Cost as a dollar figure** — see above; token counts are the real
  number, a computed price is not.
- **Alerting on quality/cost thresholds** — the data needed for
  alerting (success rate, token totals) is now real and queryable, but
  no threshold-based alert or notification integration was built this
  slice.

## Entities

| Model | Change |
|---|---|
| `CedarBrainRequest` | New fields: `mode`, `modelName`, `promptVersion`, `latencyMs`, `success`, `errorMessage`, `inputTokens`, `outputTokens`, `flaggedIncorrect`, `flaggedAt`, `flaggedByMembershipId` (→ `Membership`). Indexed on `(organizationId, createdAt)`. |

## Permissions

New `ai:supervise` permission (`ADMIN` gets it globally; `OWNER` implicit
per the existing short-circuit) — org-wide AI usage, failure detail, and
token totals are oversight-level visibility, the same spirit as
`audit:read`, not something every Command Center user needs. Submitting
a Command Center prompt and flagging a response as incorrect both stay
ungated (matching the existing `/api/cedar-brain` route, which has no
permission check today) — a user correcting their own bad result is a
different thing from seeing organization-wide telemetry.

## The service (`ai-supervisor-service.ts`)

- **`getAiSupervisorSummary(organizationId)`**: real aggregates —
  total/success/failure counts, success rate (`null` when there are no
  requests, never `0%`), average latency, live-vs-stub split, summed
  input/output tokens, flagged-incorrect count, the 5 most recent
  failures (with a truncated prompt excerpt and the real error
  message), and the 5 most recently flagged responses (with the
  flagging member's real name).
- **`flagCedarBrainRequest(actorUserId, organizationId, requestId)`**:
  requires the actor to be an active member of the request's own
  organization; rejects a request from a different organization with
  the same cross-tenant check pattern as every other module.

## UI

- **`/command/supervisor`**: gated on `ai:supervise`. Stat cards for
  every real aggregate above, plus "Recent failures" and "Recently
  flagged incorrect" lists. Explicitly notes in its own copy that
  evaluation score, retries, and tool-failure counts aren't shown
  because there's no real data source for them.
- **Command Center (`/command`)**: the result card gained a
  "Flag as incorrect" button, wired to the new
  `POST /api/cedar-brain/[id]/flag` route via the `cedarBrainRequestId`
  now returned in the request's own response payload.
- New nav item "AI Supervisor," shown only to `ai:supervise` holders.

## Failure modes

- **No requests recorded yet**: `successRatePct` and `avgLatencyMs`
  report `null` (not `0%`/`0ms`), and the UI shows "—" rather than a
  misleading zero.
- **Flagging a request from a different organization**: rejected.
- **A live request whose Anthropic call fails**: now recorded with
  `success: false` and the real error message — previously silently
  dropped.

## Acceptance tests

- `apps/web/src/lib/services/ai-supervisor.integration.test.ts` — 4
  tests against real Postgres: computes correct success rate, average
  latency, live/stub split, and summed token counts from a fixed set of
  seeded requests (2 successful live, 1 stub, 1 failed live); reports
  `null` success rate and latency for an organization with zero
  requests; flags a request and confirms both the flag itself and the
  correct flagging-member attribution; rejects flagging a request from
  a different organization.
- Manual smoke test performed for this slice against the real running
  server: submitted a Command Center prompt (stub mode, no
  `ANTHROPIC_API_KEY` in this environment), confirmed the response
  included a real `cedarBrainRequestId`, flagged it as incorrect via
  the new API route, and confirmed `/command/supervisor` rendered the
  correct real totals (1 request, 100% success, 0 live/1 stub, 1
  flagged, attributed to "Owner") — dev database reset to a clean
  seeded state afterward.

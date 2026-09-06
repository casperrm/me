# Module: Quality Control

Status: **Implemented (Phase 2 slice)**. Bible reference: Section 5
("Quality Control checks outputs for brand consistency, spelling/
language, required information, dimensions/specifications, and obvious
inconsistencies before client review"), referenced again in Section 6.1
(orchestrator flow: "Run Cedar AI Supervisor and Quality Control checks
where applicable") and Section 7's agent table ("Quality Control AI:
brand, language, format, completeness, consistency, and policy-rule
checks").

## Purpose

Catch obvious, checkable problems in a creative before it goes to a
client for approval — not by asking a person to remember every rule, but
by running the same checks automatically every time `requestApproval` is
called.

## Scope boundary — stated explicitly

Every check this module runs is a **deterministic rule check**, not an
LLM judgment call. There is no AI Foundation wiring yet capable of a
genuine "does this feel on-brand" assessment (Cedar Command Center is
still the routing stub described in ADR-007). What Section 5 calls
"brand consistency" here means "does the text contain a term the client
told us is prohibited," not an AI opinion about tone. This is the
honest, currently-buildable subset — a real Quality Control AI is Phase
3+ territory once Cedar Brain has governed retrieval and a real model
loop to run checks like this against.

**Advisory, not a hard gate.** A `FAIL` result does not block
`requestApproval` — the creative still moves to `PENDING_APPROVAL`. This
matches Section 5's own phrasing, "before client review," which is a
visibility requirement (make sure a human sees this before a client
does), not an instruction to remove human judgment from the loop. The
result is stored and rendered impossible to miss on the Creative detail
page, but an agency can still choose to proceed.

## Entities

| Model | Notes |
|---|---|
| `QualityCheckResult` | One row per QC run, linked to a `CreativeVersion`. `overallStatus`: `pass \| warning \| fail`. `checks` is a JSON array of `{ name, status, message }` — `status` per check also allows `skipped` (the check didn't apply, e.g. no image asset to measure). |
| `BrandProfileVersion.prohibitedLanguage` / `.requiredDisclaimers` | New JSON array fields (this slice) — Section 5's "prohibited language ... claims, disclaimers" are the actual inputs Quality Control checks against. Versioned along with the rest of Brand DNA, so QC always runs against the rules active when the check ran, same as everything else in Brand DNA. |

## The checks

Run by `runQualityChecks(creativeVersionId)` in `qc-service.ts`:

1. **`prohibited_language`** — case-insensitive substring search for each
   of the client's `prohibitedLanguage` terms across the version's notes
   plus (for a video creative) its `VideoBrief`'s latest concept/hook/
   script/caption/voiceover text. Any match → `fail`.
2. **`required_disclaimers`** — same text, checked for the presence of
   each `requiredDisclaimers` string. Missing ones → `warning` (not every
   disclaimer applies to every piece of creative, so this is advisory,
   never a fail). No disclaimers configured → `skipped`.
3. **`dimensions_spec`** — if the version has a linked image `Asset` and
   the creative's `platform` has a known aspect-ratio spec (a small
   static table in `qc-service.ts` — instagram_feed, instagram_story,
   instagram_reel, tiktok, meta, youtube, linkedin), reads the actual
   image with `sharp` and compares its aspect ratio to the accepted set
   (5% tolerance). Mismatch → `warning`. No asset, unsupported platform,
   a non-image asset, or a file read/decode failure → `skipped` — this
   check is never allowed to throw and break the approval request.

`overallStatus` is `fail` if any check is `fail`, else `warning` if any
is `warning`, else `pass`. `skipped` checks never affect the overall
status.

## Permissions

`runQualityChecks` runs as a side effect of `requestApproval`
(`clients:write` already required there — see `docs/specs/approvals.md`).
It is not independently callable from an API route in this slice.

## Events

No new audit action. `approval.requested`'s existing audit event now
carries `changeSet.qualityControl` (the overall status) when the QC run
completes successfully.

## UI

- The Brand DNA edit form (`/clients/[id]/brand/edit`) gained a "Quality
  Control inputs" card: two newline-separated textareas for prohibited
  language and required disclaimers.
- The Creative detail page shows the latest `QualityCheckResult` for each
  version, right below its approval history: an overall-status badge
  (pass=cedar, warning=amber, fail=red) plus every individual check's
  name, status color, and message.

## Jobs

None. Synchronous, run inline inside `requestApproval`.

## Failure modes

- **QC check throws for any reason** (e.g. a corrupt image file): caught
  in `requestApproval` and logged — the approval request still succeeds.
  Quality Control existing at all must never become a way to block the
  approval workflow through an unrelated bug.
- **Asset read/decode failure inside the dimensions check specifically**:
  caught locally in `qc-service.ts` and recorded as a `skipped` check
  with an explanatory message, rather than failing the whole QC run.

## Acceptance tests

- `apps/web/src/lib/services/qc.integration.test.ts` — 4 tests against
  real Postgres: prohibited language produces an overall `fail`, a
  missing required disclaimer with no prohibited language produces
  `warning`, clean copy with the disclaimer present produces `pass`, and
  calling `requestApproval` on creative containing prohibited language
  runs QC automatically and still lets the request through (`PENDING_APPROVAL`,
  not blocked).
- `apps/web/src/lib/services/brand-service.integration.test.ts` — extended
  fixture now exercises the two new Brand DNA fields end-to-end.
- Manual smoke test performed for this slice against the real running
  server: set prohibited language and a required disclaimer on a
  client's Brand DNA, created a creative whose notes contained the
  prohibited term but not the disclaimer, called request-approval,
  confirmed the stored `QualityCheckResult` showed `fail` (prohibited
  language) and `warning` (missing disclaimer), and confirmed both
  rendered correctly on the Creative detail page.

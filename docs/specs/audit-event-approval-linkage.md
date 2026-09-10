# AuditEvent.approvalId for the approval workflow

Bible reference: Section 23.2 (audit trail minimum schema) and Section
27.1 ("version/concurrency field on collaboratively edited records" —
the same section whose half-built `Membership.version` mechanism was
finished in a companion slice; see
`docs/specs/membership-optimistic-concurrency.md`).

## The gap

`AuditEvent.approvalId` has existed since the original schema with a
comment marking it "reserved for when the Approval model lands (Phase
2)." The `Approval` model landed long ago (Section 15.1's approval
workflow, one of the earliest slices in this project) — but nothing was
ever updated to populate the field. Across all 74 `emitAuditEvent` call
sites in the codebase, none ever passed `approvalId`, so every
`AuditEvent` row ever written has it `null`. Confirmed by grep before
starting this slice, the same discovery method used for
`Membership.version` and `correlationId` earlier this project.

**Why it matters:** `Approval` is itself an append-only log — every
`requestApproval`/`recordApprovalDecision` call creates a brand new row
(`decision`: `requested` | `changes_requested` | `approved` | ...), never
updates one in place. A `CreativeVersion` that goes through multiple
rounds (request → changes requested → request again → approved, all
without a new `CreativeVersion` — nothing prevents re-requesting on the
same version) produces several `Approval` rows and several `AuditEvent`
rows that all share the exact same `resourceId` (the `creativeVersionId`).
Without `approvalId`, there's no way to look at one audit event and know
*which* `Approval` row it documents — only "some approval action on this
version, roughly around this time," reconstructed by timestamp-ordering
guesswork.

## What's built

- `requestApproval` and `recordApprovalDecision`
  (`apps/web/src/lib/services/creative-service.ts`) both already create
  their own `Approval` row and hold a reference to it (`approval.id`) at
  the point they call `emitAuditEvent` — no new query needed. Both calls
  now pass `approvalId: approval.id`.
- This gives a direct, precise pointer: `AuditEvent.approvalId` →
  `Approval.id` is a 1:1 relationship (one event documents one Approval
  row's creation), not a "round" grouping key across the request+decide
  pair — each half of a round is its own separate `Approval` row given
  this append-only design, so each half gets its own event, each
  correctly pointing at its own row.
- `resourceType`/`resourceId` (`CreativeVersion`) are unchanged — this is
  additive, not a replacement. A query for "every approval-related event
  on this creative version" still works exactly as before; a query for
  "the exact Approval row this specific event is about" is now also
  possible without guessing.

## Scope — explicitly not built

- **`AuditEvent.correlationId`** is a separate, unrelated field on the
  same model, also always `null` in every row today. Left alone here —
  populating it needs per-HTTP-request correlation context, which
  `docs/specs/worker-log-correlation.md` already named as a much larger,
  deliberately deferred follow-up (Next.js middleware can't establish
  `AsyncLocalStorage` context on a route handler's behalf). Wiring it
  only for approval-related audit events specifically, while every other
  audit event stays uncorrelated, would be an inconsistent half-measure;
  better to leave it for that larger follow-up to address uniformly.
- **No UI surfaces `approvalId` yet.** Nothing in `/command/supervisor`
  or anywhere else currently renders an audit-event list with an
  "Approval details" link. This slice makes the data correct and
  queryable (proven by direct query, both in the integration test and
  the live HTTP smoke test below); building a UI consumer for it is a
  separate, smaller follow-up with no urgency behind it yet.

## Testing

- `apps/web/src/lib/services/creative-service.integration.test.ts` (new
  test, against real Postgres): drives a `CreativeVersion` through two
  full approval rounds without creating a new version in between (same
  `resourceId` on every event), confirms all four resulting `Approval`
  rows are genuinely distinct, and for each one confirms its
  `AuditEvent` (found via `approvalId`, not `resourceId` + guesswork)
  has the matching `action` and that resolving `approvalId` back to
  `Approval.findUniqueOrThrow` returns the exact row with the matching
  `decision`. A final check confirms the old `resourceId`-based query
  still returns all four events too.
- Live-verified via a real HTTP request against a running production
  build: logged in as the seeded owner, called the real `POST
  /api/creative-versions/[versionId]/decide` route on a real pending
  approval, then queried Postgres directly and confirmed the resulting
  `AuditEvent` had a real `approvalId` that resolved to a real
  `Approval` row with the matching `decision` and `creativeVersionId`.
  The mutation (and the `ClientTimelineEvent` it produced) was reverted
  afterward, confirmed the seeded creative was back to its original
  `PENDING_APPROVAL` status with zero `Approval` rows.

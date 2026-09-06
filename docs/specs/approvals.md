# Module: Campaigns, Creatives & Approvals

Status: **Implemented (Phase 2 slice)**. Bible reference: Section 15.1
(Approval Model), Section 8 (Campaigns, partial).

## Purpose

The brief-to-approval lifecycle for creative work: a campaign holds
creatives, each creative is versioned, and each version carries its own
approval history — so "what did the client actually approve, and when"
is always answerable from the data, not from memory or a Slack thread.

## Entities

Carried forward from the pre-Bible prototype, re-verified against
Section 15.1 and now reachable through real UI/services:

| Model | Notes |
|---|---|
| `Campaign` | Belongs to a `Project`. `status` is a free string (DRAFT/PENDING_APPROVAL/ACTIVE/PAUSED/COMPLETED by convention). |
| `Creative` | Belongs to a `Campaign`. `status` (DRAFT/PENDING_APPROVAL/APPROVED/REJECTED) is a **derived summary** of its current version's approval state, recomputed by the service layer — never set directly by the UI. `currentVersion` points at the live version. |
| `CreativeVersion` | Immutable once created — a save always inserts a new row (same pattern as `BrandProfileVersion`). Now has a real `asset` relation (added this slice; previously an unenforced plain `assetId` string) so a version can point at an uploaded file. |
| `Approval` | One row per decision event on one version — `decision` is `requested \| changes_requested \| approved \| canceled` (Section 15.1's `superseded` is not a stored value; see below). |

## The state machine

- A new `Creative` is created with version 1 already present and
  `status: DRAFT`.
- `requestApproval` — only legal on the creative's **current** version —
  writes `Approval(decision: "requested")` and sets `Creative.status =
  PENDING_APPROVAL`.
- `recordApprovalDecision` — only legal while `status === PENDING_APPROVAL`
  — writes a new `Approval` row and updates `Creative.status`:
  `approved → APPROVED`, `changes_requested → DRAFT`, `canceled → DRAFT`.
- `addCreativeVersion` bumps `currentVersion` and resets `status` to
  `DRAFT` regardless of what the previous version's state was — Section
  15.1's "superseded" is what this represents: an old version's
  unresolved approval is superseded the moment a new version exists.
  It's a **derived** fact (the UI shows `(current)` only on the live
  version) rather than a written `Approval` row, to avoid a
  write cascading onto a version nobody is looking at anymore.

## Permissions

Creating campaigns/creatives, adding versions, and requesting approval all
require `clients:write` on the owning client. Recording a decision
(`recordApprovalDecision`) accepts **either** `clients:write` (an internal
team member approving on a client's behalf) **or** the narrower
`approvals:decide` (a Client Portal contact recording their own decision —
see `client-portal.md`), via `requireAnyPermission`. `Approval.decidedBy`
is free-text for internal staff recording a non-logged-in client contact's
decision, but is always forced server-side to the actor's own name when
the actor's role is `CLIENT_PORTAL` — see `client-portal.md`'s Security
invariant.

## Events

`campaign.created`, `creative.created`, `creative.version_added`,
`approval.requested`, `approval.decided` (audit), plus a
`creative_approved` `ClientTimelineEvent` when a decision is `approved`.

## APIs / entry points

- `POST /api/projects/[projectId]/campaigns`
- `POST /api/campaigns/[campaignId]/creatives` — creates version 1 in the same transaction.
- `POST /api/creatives/[creativeId]/versions` — optional `assetId` to link an uploaded file.
- `POST /api/creative-versions/[versionId]/request-approval`
- `POST /api/creative-versions/[versionId]/decide` — `{ decision, comment?, decidedBy? }`

## UI

- Project page — "Campaigns" card with inline "+ New campaign".
- Campaign page (`.../campaigns/[campaignId]`) — creative list with
  status badges, "New creative" form.
- Creative page (`.../creatives/[creativeId]`) — full version history
  with each version's approval log inline; an actions panel that shows
  exactly one of "Request approval" / "Record decision" / "approved,
  add a new version to continue" depending on current status; "Add new
  version" form with an optional dropdown of the client's uploaded files
  (Files module, Section 14).

## Jobs

None. Synchronous.

## Metrics

None instrumented yet. Candidate: average time-to-decision per client,
feeding Client Health (Section 4.2).

## Failure modes

- **Submitting a non-current version for approval:** rejected — only the
  live version can be in flight.
- **Recording a decision with nothing pending:** rejected — you can't
  approve/reject a version that was never submitted (or whose request was
  already resolved).
- **Cross-organization campaign/creative/version IDs:** rejected the same
  way as every other module — the service layer re-verifies the full
  `Client → Project → Campaign → Creative → CreativeVersion` chain
  resolves inside the caller's organization before anything else runs.

## Acceptance tests

- `apps/web/src/lib/services/creative-service.integration.test.ts` — 6
  tests against real Postgres: campaign+creative creation with version 1
  auto-created, cross-organization campaign rejection, the full
  requested → changes_requested → new version → requested → approved
  lifecycle with the approval log and timeline event asserted, rejection
  of submitting a stale version, rejection of a decision with nothing
  pending, and permission rejection for a role without `clients:write`.
- Manual smoke test performed for this slice: ran the identical lifecycle
  through the real HTTP routes while logged in, confirmed the creative
  page rendered the full version/approval history correctly at each step.

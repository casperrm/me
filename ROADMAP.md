# Roadmap

Canonical phase structure: `docs/CEDAR_POINT_OS_BIBLE.md` Section 36. This
file tracks progress against it and adds the concrete next steps within
each phase. Section numbers below refer to the Bible unless noted.

Per Section 0.1: before adding anything not implied by the current phase,
ask whether it saves time, improves quality, improves decision-making,
preserves Cedar Point's knowledge, or increases profitability — and check
`docs/adr/` for whether a related decision has already been deferred on
purpose.

## Phase 0 — Foundation: **mostly done**

Target deliverable (Section 36): secure owner login, invite-only
membership, role assignment, audit trail, health endpoints, staging
deployment.

- [x] Monorepo, environments config (`packages/config`), PostgreSQL +
      migrations (`packages/db`).
- [x] Authentication (session-based), organizations/memberships/
      invitations, RBAC (`packages/domain`, `packages/auth`).
- [x] Audit framework (`packages/events`, Section 23.2 schema).
- [x] Base UI system, owner dashboard, team/permissions screens
      (`apps/web`).
- [x] Health endpoints (`apps/api` `/health` + `/ready`).
- [x] Queue/worker runtime (`apps/worker`) now carries a real job — the
      Section 30 overdue-escalation scan (hourly, `immediately: true` on
      restart), see `docs/specs/notifications.md`.
- [x] Object storage abstraction — `StorageAdapter` interface with a
      local-filesystem dev implementation, real checksums, signed
      time-limited download URLs, upload validation (type/size).
      Production S3-compatible backend still open — see ADR-005.
- [ ] **Staging deployment — not started.** `infra/` is empty; ADR-010
      needs a decision before this can happen. This is Phase 0's one
      concretely unmet deliverable.
- [x] MFA (Section 23.1) — TOTP enrollment/login-challenge/recovery codes,
      per-user opt-in from `/security`. See `docs/specs/mfa.md` for the
      stated scope boundary: not yet enforced as mandatory for specific
      roles, and no WebAuthn/security-key option yet.

## Phase 1 — Agency Core: **in progress**

Deliverable: Cedar Point can operate client/project work from one
canonical system.

- [x] Clients/contacts, Brand DNA (versioned, with a real edit UI at
      `/clients/[id]/brand/edit` — see `docs/specs/brand-dna.md`),
      projects/tasks (creation, assignment, status transitions — see
      `docs/specs/projects-and-calendar.md`) with client isolation
      enforced server-side, not just in the UI.
- [x] Calendar — `/calendar` unifies task/project/invoice due dates,
      scoped to what the actor can read. Meetings/shoots/campaign
      launches will join the same query once those modules exist
      (Phase 2/4) rather than becoming a parallel calendar.
- [x] Files/assets — upload, download, delete with real validation,
      checksums, and signed URLs on a dev-grade local storage backend
      (see `docs/specs/files-and-assets.md`, ADR-005). Virus/malware
      scanning is the one explicitly unbuilt piece.
- [x] Notifications (Section 30) — in-app notification center
      (severity/category/client/resource/action/read-acknowledged
      state), a real fan-out (`notifyClientWriters`) wired into approval
      requests (QC-aware severity), failed content-calendar publishes,
      and a new hourly worker escalation job for overdue tasks/projects/
      content. Explicit scope boundary in `docs/specs/notifications.md`:
      payment-risk and integration-degradation escalation triggers need
      modules that don't exist yet (real invoicing, Phase 4 connectors);
      email/push channels are adapters for later, not built.
- [x] Global search / command palette (Section 28.2) — `⌘K`/`Ctrl+K`
      overlay finding Clients/Projects/Campaigns/Creatives/Content
      Calendar items/Shoots by name, scoped through the same
      `getReadableClientIds` isolation the Section 12 calendar uses.
      Explicit scope boundary in `docs/specs/search.md`: this is "find
      records," not Section 28.2's paired "initiate permitted actions" —
      that belongs with Cedar Command Center, not a second parallel
      command-execution path.
- [ ] Activity timeline (`ClientTimelineEvent`) now gets real writes from
      Brand DNA saves, project creation, campaign creation, asset
      uploads, and creative approvals, in addition to seed data — still
      missing for task/invoice activity.

## Phase 2 — Creative and Approval Operations: **complete**

Deliverable: brief-to-client-approval lifecycle is operational.

- [x] Campaigns, Creatives, versioning, and the full approval state
      machine (requested → changes_requested/approved/canceled, with a
      new version superseding whatever the previous one's state was) —
      see `docs/specs/approvals.md`. A version can link to an uploaded
      file from the Files module.
- [x] Content Calendar (planning/scheduling, distinct from the Section 12
      due-date calendar) — `ContentCalendarItem` (client/channel/campaign/
      pillar/format/owner/status/dueDate/publishAt, optional link to a
      `Creative` for its own approval history), a 7-state workflow
      enforced server-side (BRIEF → DRAFT → INTERNAL_REVIEW →
      CLIENT_APPROVAL → SCHEDULED → PUBLISHED, plus FAILED with a
      required reason and retry), a per-client planning page at
      `/clients/[id]/content`, and due/publish dates now feed into the
      Section 12 unified `/calendar` as `content_due`/`content_publish`
      events. `PUBLISHED` means "the plan says this went out," not a real
      connector call — see `docs/specs/content-calendar.md` for the exact
      scope boundary (actual publish execution is Phase 4).
- [x] Video/production workflows (Section 11) — `VideoBrief`/
      `VideoBriefVersion` (versioned concept/hook/storyboard/script/
      voiceover/caption/edit-instruction/music-note/platform-variant
      planning, 1:1 with a `Creative`) and `Shoot` (schedule/location/
      crew/equipment/permits/call sheet/shot list/product list/
      references/status for Section 11.2 photography/production). Video
      brief editor lives on the Creative detail page (video-type
      creatives only); `/clients/[id]/shoots` covers scheduling. The
      final video file's approval/publishing still goes through the
      existing Creative/CreativeVersion/Approval pipeline rather than a
      parallel one. Explicit scope boundary (see
      `docs/specs/video-and-production.md`): Section 11's *AI* assistance
      (shot-list generation, angle ideas, schedule suggestions) is not
      built — this is the data model/workflow a human plans against.
- [x] Client Portal (Section 15.2) — `/portal` + `/portal/[clientId]`
      curated view (pending approvals with a decide action, approved
      history, invoices, files); a `CLIENT_PORTAL` membership has zero
      org-wide permissions, all access comes from `ScopedGrant`s
      auto-created on invitation acceptance; a new narrow
      `approvals:decide` permission (OR'd with `clients:write` via
      `requireAnyPermission`) lets a portal contact record their own
      decision, always attributed to their own authenticated identity —
      `Approval.decidedBy` free text from a portal contact is discarded
      server-side, never trusted. See `docs/specs/client-portal.md`.
- [x] Quality Control (Section 5/6.1/7: brand consistency, spelling/
      language, required information, dimensions/specifications before
      client review) — runs automatically inside `requestApproval`:
      prohibited-language scan and required-disclaimer presence check
      against two new Brand DNA fields (`prohibitedLanguage`,
      `requiredDisclaimers`), plus an image aspect-ratio check against a
      static per-platform spec table (via `sharp`). Advisory, not a hard
      gate — a FAIL is stored and rendered prominently on the Creative
      detail page but never blocks the approval request, matching
      Section 5's "before client review" as a visibility requirement.
      Explicit scope boundary (see `docs/specs/quality-control.md`):
      every check is a deterministic rule check, not an LLM judgment
      call — no AI Foundation wiring exists yet for a genuine "does this
      feel on-brand" assessment (Phase 3+).

## Phase 3 — AI Foundation and Command Center: **thin slice exists**

- [x] Cedar Command Center UI + a naive keyword-based agent router +
      direct Anthropic API call (or deterministic stub) — see ADR-007 for
      exactly how far this is from the Bible's full orchestration
      lifecycle (no context retrieval, no evaluation, no cost governance,
      no per-agent specialization).
- [ ] AI Gateway, prompt/model registry, governed retrieval, AI Supervisor
      telemetry/evals — not started.

## Phase 4 — Integrations and Publishing: not started

Connector SDK (`packages/connectors`, contract specified in Section 34),
Integration Center, priority provider adapters (Meta/TikTok/Google/
WhatsApp), sync/webhooks/reconciliation, publishing jobs, troubleshooting
knowledge base.

## Phase 5 — Finance and Executive Intelligence: **complete except one deferred item**

`Invoice`/`Expense`/`ClientHealthScore` models exist and the CEO Dashboard
(`/dashboard`, gated on `finance:read`) computes real aggregates from
them.

- [x] Client Health Score (Section 4.2) — a real daily worker job now
      computes an explainable score from real signals (overdue tasks/
      projects, overdue unpaid invoices, approval latency, Quality
      Control failure rate), replacing the seeded/manual number; the
      client profile page shows the full factor breakdown, not just the
      score. Explicit scope boundary in `docs/specs/client-health.md`:
      campaign trends, communication gaps, satisfaction signals, and
      renewal proximity (also named in Section 4.2) need modules that
      don't exist yet and are never faked.
- [x] Client-level profitability attribution (Section 4.2/16) — new
      `Expense.clientId` (optional) plus a first real write path
      (`createExpense`, gated on `finance:write`) makes cost
      attribution real, paired with `Invoice.clientId` (already
      existed) for revenue. CEO Dashboard gained a per-client
      revenue/cost/profit/margin table; client profile page gained an
      Expenses card. Explicit scope boundary in
      `docs/specs/profitability.md`: project/campaign/service-level
      attribution (Phase 5's own wording) needs schema and UI this
      slice doesn't build (`Invoice.projectId`/`Expense.projectId`, a
      billable line-item model) — deferred with reasons given, not
      faked.
- [x] Opportunity Engine (Section 4.2) — `getOpportunitiesForClient`
      surfaces evidence-backed service and creative-format gaps: a
      service or creative format used by 2+ other distinct clients in
      the organization but absent from this one, each with a literal
      evidence count, never a prediction. Rendered on the client
      profile page as an "Opportunities" card, gap-free clients show no
      card. Explicit scope boundary in
      `docs/specs/opportunity-engine.md`: intent signals, market/
      industry benchmarking, and trend-based or AI-generated
      opportunities need modules or data sources that don't exist yet
      and are never faked.
- [x] Governed metrics catalog (Section 29) — new `packages/metrics`
      package: shared pure functions for every metric formula complex
      enough to risk drift (client margin, all five Client Health Score
      penalty formulas), now the single real definition imported by
      both `apps/web`'s profitability service and `apps/worker`'s
      health-score job (previously duplicated inline in each). A new
      `/metrics` page documents every catalogued metric's formula,
      unit, and source. Explicit scope boundary in
      `docs/specs/metrics-catalog.md`: revenue/expense sums are
      catalogued but not function-governed (a one-line aggregation
      query isn't worth the `@cedar/db` coupling a shared function
      would need); ROAS, CPA, and utilization have no entry at all —
      no connector or time-tracking data exists yet to compute them
      from, and a definition for a number that doesn't exist would be
      fabrication.
- [x] AI Business Advisor (Section 16.2) — `getBusinessAdvisorBriefing`
      combines six real signals into one CEO Dashboard briefing:
      unprofitable engagements, cost leakage by expense category, strong
      services (correlated with actually-profitable clients), team
      capacity risks (open/overdue task load per member), collection
      risks (overdue unpaid invoices), and an org-wide rollup of
      Opportunity Engine gaps. An optional AI narrative
      (`generateBusinessAdvisorNarrative`, same live/stub pattern as
      Cedar Command Center) restates the data in prose when
      `ANTHROPIC_API_KEY` is set, under an explicit instruction never to
      add a number or claim beyond what was computed; the underlying
      lists always render regardless, so nothing is unverifiable.
      Explicit scope boundary in `docs/specs/business-advisor.md`:
      capacity risk is a coarse task-count proxy (no time-tracking/
      effort model exists), cost leakage identifies the largest category
      but not root cause, and no signal here uses trend data.
- [ ] Missing: project/campaign/service-level profitability (needs
      `Invoice.projectId`/`Expense.projectId` and a billable line-item
      model — no UI to populate that granularity exists yet; see
      `docs/specs/profitability.md`).

Phase 5's concretely buildable scope is now complete.

## Phase 6 — Advanced Intelligence: not started

Agency Memory, Success Library, Knowledge Graph query layer, Cedar
Decision Engine, Cedar Intelligence, Living/Market Intelligence, Digital
Twin, Innovation Lab, Experience Engine. `CedarBrainRequest` logs every
Command Center call today, which is the raw material Agency Memory will
eventually read from — nothing reads it back yet.

## Phase 7 — Scale Hardening: not started

Load/performance testing toward 100 employees/500 clients, data
lifecycle, advanced recovery, connector scaling, media pipeline
optimization, security review, disaster recovery exercises, operational
SLOs.

## Cross-cutting gaps worth tracking regardless of phase

- **Integration tests exist for Identity & Access** (`apps/web/src/lib/services/identity.integration.test.ts`,
  8 tests against a real dedicated Postgres database — bootstrap, login,
  full invite→accept→scope-grant flow, last-owner protection). Still
  missing: a true browser-driven E2E layer (Bible Section 32's "End-to-end"
  row) and API-contract tests for the route handlers themselves (auth
  headers, error envelopes, idempotency) — `tests/e2e/README.md` tracks
  this as the next thing to add there.
- **Known residual dependency vulnerability:** Next.js's own bundled
  PostCSS carries a moderate/high-severity advisory range that only
  resolves by upgrading to Next 16, which currently fails to build in
  this npm-workspaces layout for reasons unrelated to our code (see
  ADR-001). Accepted as low real-world risk (build-time only, no
  untrusted CSS input) — revisit when a Next 16 patch fixes the build
  issue upstream.

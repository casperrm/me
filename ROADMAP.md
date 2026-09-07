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

## Phase 1 — Agency Core: **complete**

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
- [x] Activity timeline (`ClientTimelineEvent`) now gets real writes from
      Brand DNA saves, project creation, campaign creation, asset
      uploads, creative approvals, task creation/completion, and invoice
      creation/sending/payment. Invoices also gained their first real
      write path (`invoice-service.ts`'s `createInvoice`/`sendInvoice`/
      `markInvoicePaid`, gated on `finance:write`) — previously
      seed-only, like `Expense` before `createExpense`. See
      `docs/specs/activity-timeline.md` for the exact scope boundary:
      automatic `OVERDUE` status transition isn't built (overdue is
      already computed on the fly everywhere it's needed; storing it too
      would create a second source of truth), and only task *completion*
      (not every status flip) is timeline-worthy.

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
      lifecycle (no evaluation of the live model call's actual output,
      no cost governance beyond what AI Supervisor now tracks).
- [x] Cedar Brain per-agent output breakdown (Section 4/6.1) — the
      Command Center's response always carried a `plan[]` array (one
      entry per routed agent), but live mode set every entry's output
      to `null` and the UI never rendered `plan[]` at all. Fixed with
      one Anthropic call per request (unchanged — see below for why not
      one call per agent) whose system prompt now asks for labeled
      per-agent sections, parsed into real `plan[]` entries; the
      Command Center UI now renders that breakdown. A real
      per-agent-specialization design (separate API calls per agent,
      each with a specialist prompt) was considered and explicitly
      rejected for now: Section 33's budget/cost-governance mechanism
      doesn't exist yet, so multiplying real API spend per request with
      no safety net would be introducing financial risk the Bible says
      needs governance first, not silently accepted. See
      `docs/specs/cedar-brain-per-agent-output.md`.
- [x] Governed context retrieval (Section 6.1) — Command Center's client
      picker (scoped to what the actor can read) triggers a real
      structured-query retrieval (`buildGovernedContext`) of that
      client's Brand DNA, Client Health Score, and recent timeline
      events, authorized *before* any data is touched and injected into
      the model's system prompt with an explicit "don't invent facts
      beyond this" instruction. The real sources retrieved are shown
      back to the user, not hidden inside the model call. Explicit scope
      boundary in `docs/specs/governed-context-retrieval.md`: structured
      queries only, no semantic/vector retrieval (ADR-008 defers that —
      no unstructured content exists yet to index), no cross-client or
      knowledge-layer retrieval.
- [x] AI Supervisor telemetry (Section 6.3) — every Cedar Brain request
      (success or failure — previously only successes were logged, a
      real gap this slice fixed) now records real mode, model name, a
      manually-bumped prompt version constant, measured latency,
      success/error outcome, and actual input/output token counts from
      the Anthropic response. `/command/supervisor` (new `ai:supervise`
      permission) surfaces real aggregates — success rate, average
      latency, live/stub split, token totals, recent failures, and
      user-flagged-incorrect responses (a real "Flag as incorrect"
      button on the Command Center, satisfying Section 6.3's "user
      corrections" signal). Explicit scope boundary in
      `docs/specs/ai-supervisor.md`: no retry/tool-failure counts (no
      retry logic or tool-calling exists to count), no cost-threshold
      alerting yet — token counts stand in for "cost" rather than a
      computed dollar figure that would need a hardcoded,
      staleness-prone price.
- [x] AI Evaluation Harness (Section 6.3/33) — a real, deterministic
      regression suite for Cedar Brain's routing logic
      (`routeToAgents`), the one fully-deterministic, non-flaky part of
      Cedar Brain's orchestration (evaluating the live model call's
      actual output would need a rubric-based LLM-judge harness — a
      materially bigger, separately-scoped undertaking, explicitly
      deferred, not silently skipped). A 10-case golden set, run on
      demand from `/command/supervisor` ("Run eval now"), persisted as
      `AiEvalRun`/`AiEvalResult` rows. Building the golden set —
      verifying every case against real output before trusting it,
      rather than hand-deriving expectations from the same code being
      tested — found and fixed a real bug: `routeToAgents` used plain
      substring matching, so `"script"` matched inside
      `"de-SCRIPT-ion"` and `"ad"` matched inside `"already"`/
      `"administrator"`, both common words in real agency request text.
      Fixed with word-boundary regex matching. See
      `docs/specs/ai-eval-harness.md` for the full "why routing, not
      live-response quality" reasoning and what's explicitly deferred
      (a live-response LLM-judge harness; scheduled/CI-triggered runs —
      today it's on-demand only).
- [x] AI Budget Governance (Section 33) — the specific mechanism the
      per-agent-output slice cited as missing. A real, enforced monthly
      token budget: `AiBudget` (one row per organization, created only
      when an owner/admin explicitly sets one — no default is ever
      fabricated), `getAiBudgetStatus` computing real usage from
      `CedarBrainRequest` for the current calendar month, and
      enforcement in `/api/cedar-brain/route.ts` that rejects a live
      call with 402 *before* any real API spend once the organization
      is over budget (stub mode is never blocked, since it costs
      nothing either way). `alertIfOverBudget` closes the actual
      "cost-threshold alerting" gap `ai-supervisor.md` had flagged as
      missing — a deduplicated notification (once per 24h) to every
      `ai:supervise` holder. A new "AI budget" card on
      `/command/supervisor` shows usage vs. limit and lets an
      `organization:manage` holder set or clear it. Verified live
      against the seeded dev database: set a real 5,000-token budget,
      inserted a real 5,500-token live-mode request, confirmed the page
      showed the exact over-budget arithmetic. See
      `docs/specs/ai-budget-governance.md`, including why this closes
      the *blocker* the per-agent-fan-out decision cited, without
      itself reopening that decision — true per-agent specialization
      remains its own separate, not-yet-started slice.
- [x] Cedar Prompt Version Registry (Section 33) — the other item
      ADR-007's "what this ADR will need to decide" list had named.
      Rejected the obvious reading (an admin-editable live prompt) as a
      real multi-tenancy bug: any org's admin editing a system-wide
      shared prompt would silently change Cedar Brain's behavior for
      every other organization on the deployment. Built instead: an
      auto-captured, read-only `CedarPromptSnapshot` audit trail. The
      static instructional text was extracted from `callCedarBrain`
      into its own named `SYSTEM_PROMPT_TEMPLATE` export (a real prompt
      content change, so `CEDAR_BRAIN_PROMPT_VERSION` bumped v3 → v4
      per the file's own convention); `ensurePromptSnapshotRecorded`
      captures the real text the first time each version is used
      (idempotent — one DB round-trip per version per server process).
      A new "Prompt version history" card on `/command/supervisor`
      shows every captured version with its real text on expand.
      Verified live against the seeded dev database with a direct-SQL
      cross-check: sent a real request, confirmed a `v4` row existed
      with the real template text, confirmed the page rendered it. See
      `docs/specs/cedar-prompt-registry.md`.
- [ ] AI Gateway, semantic/vector retrieval, live-response evaluation
      scoring, true per-agent specialization (a separate Anthropic call
      per routed agent, each with its own specialist prompt), a real
      model catalog (Section 33's "route to the least expensive model")
      — not started. What *is* built: real per-agent output structure
      within the existing single call
      (`docs/specs/cedar-brain-per-agent-output.md`), the budget
      mechanism a future per-agent-fan-out slice would rely on
      (`docs/specs/ai-budget-governance.md`), and the prompt version
      registry above.

## Phase 4 — Integrations and Publishing: **starter slice exists**

- [x] Connector SDK (`packages/connectors`) — the Section 34
      `ConnectorAdapter` contract (authorize/refresh/healthCheck/sync/
      handleWebhook/execute/reconcile/revoke), plus one real, fully
      working implementation: `GenericWebhookAdapter`, a signed
      provider-agnostic inbound webhook receiver needing no third-party
      OAuth account. Integration Center (`/integrations`, gated on
      `organization:manage`) — a real connection dashboard with
      status/health/event-count, a create flow that reveals a one-time
      signing secret, and a revoke action. The public webhook endpoint
      verifies an HMAC-SHA256 signature and deduplicates replayed
      events by idempotency key (Section 17.1) — proven end-to-end in
      this slice's own smoke test with a `curl` request signed via
      `openssl`, not just unit-tested in isolation. Explicit scope
      boundary in `docs/specs/integration-center.md`: Meta/TikTok/
      Google/WhatsApp adapters (Section 17.2) are not built — they need
      real OAuth app registrations and credentials this environment
      cannot obtain; `refresh`/`sync`/`execute`/`reconcile` are
      legitimately not-applicable for *this* push-only connector
      (documented per-method), not silently stubbed.
- [ ] Priority provider adapters (Meta/TikTok/Google/WhatsApp) — blocked
      on real OAuth credentials. Sync/reconciliation for a pull-based
      provider, publishing jobs, troubleshooting knowledge base — not
      started.

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

## Phase 6 — Advanced Intelligence: **starter slice exists**

- [x] Client Memory (Section 6.6) — `getRecentCedarBrainActivityForClient`
      is the first thing that reads `CedarBrainRequest` history back
      (previously "nothing reads it back yet," per this file's own
      prior wording and ADR-007). A client's past successful Cedar
      Brain answers now feed into governed context retrieval for that
      client's next request, and a new "Cedar Brain Activity" card on
      the client profile page shows the real history (including
      failures, for human visibility). See `docs/specs/client-memory.md`
      for exactly why this is real Client Memory and explicitly not yet
      Agency Memory: no curation, no cross-client pattern extraction,
      no outcome measurement — one client's own history, read back
      verbatim.
- [ ] Agency Memory, Success Library, Knowledge Graph query layer, Cedar
      Decision Engine, Cedar Intelligence, Living/Market Intelligence,
      Digital Twin, Innovation Lab, Experience Engine — not started;
      each needs curation/outcome-measurement/cross-client
      infrastructure this slice deliberately didn't invent.

## Phase 7 — Scale Hardening: started

Load/performance testing toward 100 employees/500 clients, data
lifecycle, advanced recovery, connector scaling, media pipeline
optimization, security review, disaster recovery exercises, operational
SLOs.

- [x] **CEO Dashboard aggregate queries.** The dashboard's four
      organization-wide numbers (revenue, outstanding, expenses, active
      vs. total clients) were computed by fetching *every* client,
      invoice, and expense row the organization has ever created into
      Node and reducing over them in JavaScript — a full-table scan on
      every single dashboard load, growing without bound as the
      organization accumulates history. Replaced with `prisma.count()`
      and `prisma.aggregate({ _sum })` calls, which push the same
      computation into Postgres and return only the four numbers
      needed. Verified byte-identical output against the pre-existing
      seed data via direct SQL cross-check (see
      `docs/specs/dashboard-aggregates.md`). Also found and fixed a
      real pre-existing cross-tenant bug while touching this code: the
      "Pending approvals" stat's `prisma.creative.count()` had no
      organization scoping at all, so it counted `PENDING_APPROVAL`
      creatives across *every organization in the database*, not just
      the current one — confirmed as a real leak (not just theoretical)
      because the dev database has two organizations. Now scoped
      through `campaign.project.client.organizationId`. See
      `docs/specs/dashboard-aggregates.md` for full detail, including
      what this slice explicitly did *not* fix (deferred, not
      forgotten): the client-detail page's six unbounded nested lists,
      the Opportunity Engine's full-organization creative scan, the
      clients list page, the content calendar, the Client Portal, the
      shoots page, and several asset-picker dropdowns — each a real,
      separately-scoped follow-up, ranked in that doc by the audit that
      found them.
- [x] **Client detail page pagination.** The highest-ranked item from
      that same audit: the client detail page's single query nested six
      unbounded relations (`projects`, `invoices`, `expenses`, `notes`,
      `timelineEvents`, `assets`), plus fetched full `campaigns`/`tasks`
      rows per project just to display their counts. Added a real
      pagination service (`client-relations-service.ts`, offset
      pagination, page size 20) backing six new "View all" pages
      (`/clients/[id]/{invoices,expenses,notes,timeline,files,projects}`);
      the overview page now bounds each relation to 10 most-recent rows
      via `take` + `_count` and only shows a "View all" link when
      there's actually more. Campaign/task counts switched to
      `_count.select` instead of fetching full arrays. Verified against
      real Postgres with 9 new integration tests plus a live smoke test
      that inserted 27 real invoice rows for the seeded demo client and
      confirmed page 1/page 2 split exactly 20/7 with zero overlap and
      correctly-disabled boundary links — see
      `docs/specs/client-relations-pagination.md`, including what's
      still open (Opportunity Engine, clients list, content calendar,
      Client Portal, shoots page, asset pickers — unchanged by this
      slice).
- [x] **Opportunity Engine full-organization creative scan.** The
      creative-format-gap signal fetched every creative row for every
      other client in the organization on every client detail page
      load, just to count distinct peer clients per format in
      JavaScript. Own-format history had the same shape. Rewrote the
      peer-format count as a single Postgres `GROUP BY` via
      `prisma.$queryRaw` (parameterized, no injection surface) and the
      own-format query to `distinct: ["type"]` — same output, but data
      transfer now scales with the number of distinct format values in
      use (a handful) instead of the organization's entire creative
      history. All 5 existing tests (including the one proving distinct
      peer *clients*, not distinct creatives, are counted) passed
      unchanged against the rewrite; added 1 new test exercising
      multiple peers across multiple formats in one call. Verified live
      against the seeded dev database with a direct-SQL cross-check —
      see `docs/specs/opportunity-engine-scaling.md`, including why the
      service-gap signal (a JSON-string `services` column, not `jsonb`)
      was deliberately left as-is rather than force-fit into SQL.
- [x] **Clients list page pagination.** The org-wide clients list
      fetched every readable client on every load — unbounded against
      the Bible's own 500-client scale target — plus fully included
      `projects` and `brandProfile` just to display a count and a
      truthiness check. Added the same `PAGE_SIZE=24` offset pagination
      shape used by the client detail page slice (same shared
      `Pagination` component), switched to `_count.select` for the
      project count and a `select`-scoped `brandProfile: { id: true }`
      instead of the full record. Section 38's scoped-collaborator
      filter is unchanged and still applied inside the same `where`.
      Verified live against the seeded dev database: inserted 30
      temporary clients (31 total), confirmed page 1/page 2 split
      exactly 24/7 with correct boundary links, cross-checked against
      `select count(*)` — see `docs/specs/clients-list-pagination.md`.
- [x] **Content Calendar pagination.** The per-client content calendar
      table fetched every scheduling item a client has ever had,
      unbounded across months and years of ongoing content production.
      Same `PAGE_SIZE=20` offset pagination shape as the two prior
      list-pagination slices. The New Content Item form's
      campaign/creative/member dropdowns are deliberately left
      unbounded — they're the audit's separate "asset-picker dropdowns"
      item, needing a real search-as-you-type redesign rather than a
      one-line pagination change, so folding them in here would have
      been scope creep. Verified live against the seeded dev database:
      inserted 25 temporary items, confirmed page 1/page 2 split
      exactly 20/5 — see `docs/specs/content-calendar-pagination.md`.
- [x] **Client Portal pagination.** The audit's own highest-flagged
      customer-visible-latency item: the external-facing Client Portal
      fetched every pending-or-approved creative, every invoice, and
      every available asset for a client on every load. Approved
      history, invoices, and files each got the bounded-preview +
      "View all" page pattern (three new pages, `PAGE_SIZE=20`);
      "Pending your review" got a defensive `take` cap instead of a
      "view all" page, since it's a work queue meant to reach zero, not
      a growing archive — building pagination UI for a backlog that
      shouldn't exist would have been solving the wrong problem. Every
      new page independently re-checks `clients:read` rather than
      trusting the parent page. Verified live against the seeded dev
      database: inserted 15 approved creatives / 15 invoices / 15
      assets, confirmed correct "View all" counts, then pushed invoices
      to 22 total and confirmed the new invoices page split exactly
      20/2 — see `docs/specs/client-portal-pagination.md`.
- [x] **Shoots page pagination.** The per-client production shoots list
      fetched every shoot ever scheduled, unbounded — same shape as the
      content calendar fix. Same `PAGE_SIZE=20` pattern. Verified live
      against the seeded dev database: inserted 24 temporary shoots,
      confirmed page 1/page 2 split exactly 20/4 — see
      `docs/specs/shoots-pagination.md`.
- [x] **Search-as-you-type asset picker.** The last remaining ranked
      item from the Phase 7 audit — the one item that explicitly needed
      a real UX redesign, not a pagination change. The "Add new
      version" form's asset dropdown loaded every one of a client's
      files into a plain `<select>`; replaced with a real
      search-as-you-type picker (`searchClientAssets()`, a bounded
      10-result `filename contains` search; `GET
      /api/clients/[id]/assets/search`; a new `AssetPicker.tsx`
      component with debounced fetch and click-to-select). The page's
      unbounded `findMany` was removed entirely rather than merely
      bounded — a picker fetches on demand, so there's no preview list
      to maintain at all. Verified with 5 new route-contract tests plus
      a live smoke test at both the HTTP and real-browser level
      (Playwright): typed "hero" into the actual picker on a real
      creative's page, confirmed the dropdown showed exactly the
      matching file, clicked it, confirmed the UI updated — see
      `docs/specs/asset-picker-search.md`, including why this is
      representative (the one asset picker in the app) rather than an
      exhaustive sweep for every possible unbounded dropdown. **This
      closes every ranked item from the Phase 7 scale-hardening audit.**

## Cross-cutting gaps worth tracking regardless of phase

- **Integration tests exist for Identity & Access** (`apps/web/src/lib/services/identity.integration.test.ts`,
  8 tests against a real dedicated Postgres database — bootstrap, login,
  full invite→accept→scope-grant flow, last-owner protection).
- **A real browser-driven E2E layer now exists** (Bible Section 32's
  "End-to-end" row) — `tests/e2e/` (Playwright/Chromium): login →
  protected page → logout; the fuller invite → accept → real
  RBAC-scoped session flow; Section 15.1's approval workflow (create a
  creative → request approval → record a real decision, asserting the
  status badge itself transitions DRAFT → PENDING_APPROVAL → APPROVED);
  Section 15.2's Client Portal (an invited external contact's session
  is redirected away from the internal app on *every* direct navigation
  attempt, not just at first login); and Section 23.1's MFA (enrolls a
  real TOTP secret via `/security`, computes a valid code with `otplib`
  against the secret the page displays, then proves via a real logout/
  login that the account is actually challenged on its next login, not
  just that enrollment succeeded); and Section 9's Content Calendar
  (creates a content item and moves it through two real, server-
  validated transitions, BRIEF → DRAFT → INTERNAL_REVIEW). All navigate
  by real link text so they survive a fresh `db:reset` generating new
  ids every run. Run via `npm run test:e2e` against a production build
  with the dev database reset to a known seeded state first. See
  `tests/e2e/README.md` for a real dev-server-only flakiness finding
  this work surfaced (fixed by building/starting, not `next dev`) —
  every flow originally named as a gap here now has coverage; what's
  left is depth (more permutations), not breadth.
- **API-contract tests now exist for a representative set of route
  handlers** (`apps/web/src/app/api/**/*.route.contract.test.ts`, 30
  tests across 6 routes) — the HTTP layer itself (auth gate, status
  codes, JSON envelope), not just the service functions underneath,
  which were already integration-tested. See
  `docs/specs/api-route-contracts.md` for exactly which routes and why.
  Found and fixed two real bugs: `/api/expenses` and `/api/invoices`
  both misreported `amountCents: 0` as "missing" instead of reaching
  the real "must be a positive number" validation, because their
  pre-checks used a truthy check instead of a type check. Not
  exhaustive — ~35 routes exist, 6 are covered to prove the pattern;
  extending it is real follow-up work, not claimed done.
- **Known residual dependency vulnerability:** Next.js's own bundled
  PostCSS carries a moderate/high-severity advisory range that only
  resolves by upgrading to Next 16, which currently fails to build in
  this npm-workspaces layout for reasons unrelated to our code (see
  ADR-001). Accepted as low real-world risk (build-time only, no
  untrusted CSS input) — revisit when a Next 16 patch fixes the build
  issue upstream.

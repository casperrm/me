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
- [ ] Queue/worker runtime exists (`apps/worker`) but carries no real
      job yet — fine per ADR-004, not a blocker for this phase.
- [x] Object storage abstraction — `StorageAdapter` interface with a
      local-filesystem dev implementation, real checksums, signed
      time-limited download URLs, upload validation (type/size).
      Production S3-compatible backend still open — see ADR-005.
- [ ] **Staging deployment — not started.** `infra/` is empty; ADR-010
      needs a decision before this can happen. This is Phase 0's one
      concretely unmet deliverable.
- [ ] MFA for privileged users (Section 23.1) — tracked gap in ADR-006,
      not yet built.

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
- [ ] Search, notifications — not started.
- [ ] Activity timeline (`ClientTimelineEvent`) now gets real writes from
      Brand DNA saves, project creation, campaign creation, asset
      uploads, and creative approvals, in addition to seed data — still
      missing for task/invoice activity.

## Phase 2 — Creative and Approval Operations: **in progress**

Deliverable: brief-to-client-approval lifecycle is operational.

- [x] Campaigns, Creatives, versioning, and the full approval state
      machine (requested → changes_requested/approved/canceled, with a
      new version superseding whatever the previous one's state was) —
      see `docs/specs/approvals.md`. A version can link to an uploaded
      file from the Files module.
- [ ] Content calendar (planning/scheduling, distinct from the Section 12
      due-date calendar already built) — not started.
- [ ] Video/production workflows (Section 11) — not started.
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
- [ ] AI Quality Control (Section 23: brand consistency, spelling,
      dimensions checks before client review) — not started.

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

## Phase 5 — Finance and Executive Intelligence: **data model only**

`Invoice`/`Expense`/`ClientHealthScore` models exist and the CEO Dashboard
(`/dashboard`, gated on `finance:read`) computes real aggregates from
them. Missing: profitability attribution by project/service/campaign,
Client Health scoring as anything more than seeded/manual numbers,
Opportunity Engine, AI Business Advisor, governed metrics catalog
(Section 29).

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

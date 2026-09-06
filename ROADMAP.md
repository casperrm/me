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
- [ ] Object storage abstraction — not started (ADR-005).
- [ ] **Staging deployment — not started.** `infra/` is empty; ADR-010
      needs a decision before this can happen. This is Phase 0's one
      concretely unmet deliverable.
- [ ] MFA for privileged users (Section 23.1) — tracked gap in ADR-006,
      not yet built.

## Phase 1 — Agency Core: **in progress**

Deliverable: Cedar Point can operate client/project work from one
canonical system.

- [x] Clients/contacts, Brand DNA (versioned), projects/tasks — schema and
      a working `/clients` + `/clients/[id]` UI exist, carried forward
      from before the Bible and re-validated against it (client isolation
      enforced server-side, not just in the UI).
- [ ] Calendar, search, notifications — not started.
- [ ] Activity timeline exists at the data level (`ClientTimelineEvent`)
      but nothing writes to it automatically yet from project/task/
      campaign activity — currently only seed data populates it.

## Phase 2 — Creative and Approval Operations: not started

Content calendar, Creative Studio records, video/production workflows,
versions/comments, approval engine, client portal, QC framework.
`Creative`/`CreativeVersion`/`Approval` models exist in the schema
(carried forward pre-Bible) but have no workflow UI — versions can be
created, but there's no review/approve/request-changes screen yet.

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

- **No E2E/integration test layer yet** (Bible Section 32 lists API and
  End-to-end as required test layers). Only `packages/domain` has real
  tests today (13 unit tests covering the RBAC policy and Section 38
  acceptance scenarios). Flagged explicitly in
  `docs/specs/identity-access.md`.
- **Known residual dependency vulnerability:** Next.js's own bundled
  PostCSS carries a moderate/high-severity advisory range that only
  resolves by upgrading to Next 16, which currently fails to build in
  this npm-workspaces layout for reasons unrelated to our code (see
  ADR-001). Accepted as low real-world risk (build-time only, no
  untrusted CSS input) — revisit when a Next 16 patch fixes the build
  issue upstream.

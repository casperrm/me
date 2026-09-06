# Roadmap

`VISION.md` has 41 sections. Building all of them at once isn't a plan,
it's a wish list — this groups them into phases ordered by what has to
exist before the next thing is safe or useful to build. Section numbers
below refer to `VISION.md`.

Per the vision's own closing rule: before adding anything not listed here,
ask whether it saves time, improves quality, improves decision-making,
preserves Cedar Point's knowledge, or increases profitability. If not,
don't build it just to have it.

## Phase 0 — Foundation (done, this repo)

- Data model covering Client, Brand DNA, Projects, Campaigns, Creatives +
  approvals, Invoices/Expenses, Meetings, Audit Log (§2, §3, §22, §25,
  §26, §30 schema-level).
- Client Management: list + 360 profile page (§2, §3).
- CEO Dashboard skeleton with real DB-backed metrics (§18).
- Cedar Command Center + Cedar Brain router/stub, requests logged for
  future Agency Memory use (§4, §5 logging, §32).

## Phase 1 — Access & Security

Nothing else should touch real client data until this exists.

- Invite-only auth, Owner/Admin roles, session handling (§29).
- Enforce `AuditLog` writes on every mutating action (§30).
- Client data isolation checks (org-scoped queries everywhere — currently
  assumed single-org; needs real enforcement once there's more than one).
- MFA, encryption at rest for secrets, backup strategy (§30).
- Client Portal authentication foundation (§28) — the portal UI can come
  later, but its auth model should be decided alongside Phase 1, not
  bolted on after.

## Phase 2 — Creative & Content Engine

- AI Design Studio: idea → concept → design, using Brand DNA (§9).
- Multi-Platform Creative Engine: real per-platform adaptation, not resize
  (§10).
- AI Video Studio: ideas, storyboards, scripts, platform cuts (§11).
- Localization AI: culturally-adapted copy, not literal translation
  (§12).
- Approval & Revision System UI on top of the existing `Approval` /
  `CreativeVersion` tables (§22).
- AI Quality Control pass before client delivery (§23).
- Content Planning & Publishing calendar, with the "AI prepares → human
  approves → system executes" rule enforced for anything public or paid
  (§21).

## Phase 3 — Campaigns & Integrations

- Campaign & Ads Management UI over the existing `Campaign`/`Creative`
  models — budgets, KPIs, testing, recommendations (§13).
- Meta/TikTok/Google integrations + Integration Center showing connection
  health across platforms (§14).
- Agency troubleshooting knowledge base, seeded from real issues as they
  get solved (§15).

## Phase 4 — Finance & Business Intelligence

- Payment & Billing Center + payment-failure knowledge base (§16).
- Finance Hub: profitability per client/project, recurring revenue,
  forecasts (§17).
- AI Business Advisor over real financial + performance data (§19).
- Opportunity Engine + live Client Health Score computation (the
  `ClientHealthScore` model already exists; this phase makes the number
  real instead of seeded) (§20).
- Reverse Campaign Builder: work backward from a target with explicit
  assumptions (§38).

## Phase 5 — Intelligence Layers

These sit above everything built so far and should stay read-only /
recommend-only per §6.

- Cedar Intelligence: monitors agents, workflows, performance; never
  auto-executes (§6).
- Cedar Living Intelligence / Market Intelligence feed (§7).
- Marketing Idea AI at full depth, learning from Brand DNA + campaign
  history (§8 — Phase 0 ships a thin version via Cedar Brain's marketing
  routing; this is the learned/deep version).
- Cedar Decision Engine: reasoning + risk + impact before big decisions,
  human decides (§34).
- Success Library: what worked and why, queryable (§37).
- Cedar Digital Twin per client: predicts what a client will likely
  approve before presenting it (§39).

## Phase 6 — Operations & Scale

- Photography/Production Module: shoots, shot lists, equipment, delivery
  (§24).
- Projects/Tasks/Calendar as a full UI (schema exists from Phase 0) (§25).
- Files & Smart Asset Manager backed by real object storage (§26).
- Meetings AI: extract decisions/tasks/follow-ups automatically (§27).
- Client Portal UI (auth landed in Phase 1) (§28).
- Workflow Automation builder (§31).
- Knowledge Graph queries across the full schema (§33 — data shape exists
  from Phase 0; this is the query/UX layer).
- Cedar AI Supervisor: monitors agent quality/cost/reliability (§36).
- Cedar Innovation Lab: surfaces underused features, bottlenecks, new
  integrations worth considering (§35).
- Operating Manual / documentation for every shipped feature (§40).
- Scalability hardening pass: revisit multi-tenancy, rate limits, cost
  controls now that real usage patterns exist (§41).

Cedar AI Academy (mentioned in §40) stays explicitly out of scope until
the team is large enough to need it.

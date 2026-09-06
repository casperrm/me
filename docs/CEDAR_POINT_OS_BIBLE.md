# CEDAR POINT OS — Master Project Bible v1.0

**AI-Native Agency Operating System**
Executive Product + Technical Specification — Implementation-Ready for Claude Code
Version 1.0 | Baseline: 6 September 2026 | Status: Official Greenfield Specification

> This document is the single authoritative specification for Cedar Point OS.
> It supersedes `VISION.md` (the earlier informal draft, kept for historical
> context only) per Section 0 below. `ARCHITECTURE.md` and `ROADMAP.md` in
> the repo root track how the codebase implements it and current progress
> against Section 36's phases.

# 0. Document Authority and Claude Code Directive
This document is the single authoritative greenfield specification for Cedar Point OS v1.0. Previous drafts are non-authoritative. Claude Code and all contributors must implement from this specification, preserve its architectural principles, and record any deliberate deviation as an Architecture Decision Record (ADR).
## 0.1 Execution Directive
Build production-quality software, not a prototype disguised as a production system.
Work incrementally by bounded module. Keep the repository runnable, tested, documented, and deployable after every implementation slice.
Do not invent critical business rules when this document is explicit. When an implementation detail is unspecified, choose the simplest secure, extensible design consistent with the principles here and document the choice.
Never allow AI to autonomously publish, spend advertising budget, execute payments, delete critical data, change permissions, or modify production-critical configuration without an authorized human approval.
Prefer a modular monolith initially, with clean boundaries, asynchronous events, and extraction seams. Do not introduce microservices without demonstrated operational need.
Use official APIs, OAuth/service authorization, granted permissions, and compliant data acquisition. Do not build policy-evasion or unauthorized scraping mechanisms.
Every feature must save time, improve quality, improve decisions, preserve agency knowledge, or create measurable business value. Otherwise it is out of scope.
## 0.2 Definition of Done
Acceptance criteria pass; automated tests cover critical paths and permissions.
Authorization is enforced server-side; audit events are emitted for sensitive actions.
Observability exists for failures, queues, integrations, and AI calls.
Database migrations are reversible or have a documented safe forward-recovery strategy.
User-facing states include loading, empty, error, permission-denied, and recovery paths.
Documentation and ADRs are updated when behavior or architecture changes.
# 1. Product Vision
Cedar Point OS is an AI-native operating system for Cedar Point Media and, eventually, modern marketing agencies. It unifies client operations, brand knowledge, projects, campaigns, content, creative production, advertising, approvals, finance, files, meetings, reporting, automation, integrations, institutional memory, and decision intelligence in one coherent system.
The system begins as an owner-led workspace for one to two invited collaborators but is architected to scale toward approximately 100 employees and 500 clients without a ground-up rebuild.
## 1.1 North Star
One command should be able to mobilize the agency. A user can ask Cedar Command Center to launch a campaign, prepare a client review, diagnose an integration issue, create a production plan, or explain agency profitability. Cedar Brain decomposes the request, retrieves governed context, coordinates specialist capabilities, prepares work, runs quality checks, and routes sensitive actions to human approval.
## 1.2 Product Principles

| Principle | Implementation meaning |
| --- | --- |
| AI-native, not AI-added | AI orchestration, memory, provenance, evaluation, approvals, and cost controls are platform primitives. |
| Client-centric graph | All work connects to canonical client, brand, project, campaign, asset, decision, result, and finance records. |
| Human authority | AI proposes and prepares; authorized humans approve critical actions. |
| Institutional memory | Approved work, decisions, revisions, outcomes, and lessons become reusable agency knowledge. |
| Modular scalability | New channels, agents, modules, and connectors plug into stable contracts. |
| Operational truth | Dashboards derive from canonical records and traceable calculations, not isolated AI text. |
| Security by design | Least privilege, tenant/client isolation, encryption, auditability, recovery, and secrets hygiene are mandatory. |


# 2. Users, Roles, Permissions, and Governance
## 2.1 Initial and Future Users
Owner: full administrative authority, approvals, financial visibility, permissions, system configuration, and intelligence oversight.
Admin/Operations Manager: delegated operational control within configured scopes.
Account/Client Manager: client, project, approvals, meetings, reporting, and communication workflows.
Ads Manager: campaigns, performance, recommendations, integrations, and approved ad actions.
Designer/Creative: creative briefs, Brand DNA, assets, revisions, and production tasks.
Video/Production: video briefs, shoots, shot lists, footage, versions, and delivery.
Finance: invoices, payments, expenses, renewals, profitability, and financial reporting.
Client Portal User: strictly scoped access to approved client-facing records, approvals, reports, invoices, and files.
Custom roles: permission bundles configurable by the owner.
## 2.2 Authorization Model
Use RBAC plus contextual constraints. A permission decision may depend on role, organization, client, resource, action, sensitivity, financial amount, and ownership. All enforcement is server-side.

| Dimension | Examples |
| --- | --- |
| Resource | client, project, campaign, creative, invoice, integration, user |
| Action | read, create, update, approve, publish, spend, pay, delete, export, administer |
| Scope | organization-wide, assigned clients, specific client, own records |
| Sensitivity | normal, confidential, financial, credential/integration, destructive |
| Approval rule | none, single approver, owner-only, amount threshold, two-person review |


## 2.3 Non-Negotiable Approval Gates
External publishing and scheduled publishing activation.
Advertising spend creation or material budget changes.
Payments, refunds, or financial transfers.
Destructive bulk changes and permanent deletion.
Role/permission escalation and security configuration changes.
Production connector credential changes.
Major AI/system changes proposed by Cedar Intelligence or Innovation Lab.
# 3. Core Domain Model
The relational database is the system of record. A knowledge graph/semantic layer represents relationships and retrieval context without replacing canonical transactional records.

| Domain entity | Purpose |
| --- | --- |
| Organization | Cedar Point Media tenant/root workspace. |
| User / Membership / Role | Identity, access, team membership, scoped permissions. |
| Client / Contact | Canonical customer and stakeholder records. |
| BrandProfile | Brand DNA, voice, visual rules, products, audiences, preferences. |
| Project / Task / Milestone | Operational work, ownership, deadlines, dependencies. |
| Campaign / AdSet / Ad / MetricSnapshot | Campaign strategy, channel execution, performance history. |
| ContentItem / Creative / CreativeVersion | Posts, designs, scripts, videos, revisions, approvals. |
| Asset / FileVersion | Managed files, metadata, lineage, versions, storage pointers. |
| Approval / Comment / Decision | Human governance, revisions, final decisions, rationale. |
| Meeting / Note / ActionItem | Structured meeting knowledge and follow-up. |
| Invoice / Payment / Expense / RevenueEntry | Finance, collections, cost and profitability. |
| Integration / Connection / SyncJob | External platform authorization and synchronization health. |
| Workflow / WorkflowRun / AutomationEvent | Reusable operational automations and execution history. |
| AIRequest / AgentRun / Evaluation / PromptVersion | AI execution, provenance, cost, quality, and versioning. |
| KnowledgeItem / Relationship / EmbeddingRef | Agency/client/market memory and semantic retrieval. |
| AuditEvent | Immutable security and operational event history. |
| Notification / Alert | Actionable user-facing system and intelligence signals. |


# 4. Client Operating System
## 4.1 Central Client Record
Company and contact information; lifecycle stage; assigned team; services; commercial status.
Connected accounts and integrations, with permission and health state.
Brand DNA: logos, colors, fonts, visual rules, tone, languages, audience, products, offers, approved/rejected patterns.
Projects, tasks, campaigns, content, designs, videos, production work, contracts, invoices, payments, meetings, notes, files, reports, approvals, and decisions.
Fast actions: create project, campaign, creative brief, video brief, invoice, meeting, report, task, approval request.
Client Timeline: chronological relationship history from first contact through delivery, revisions, payments, results, issues, renewals, and decisions.
Activity log: who changed what, when, and from which workflow or integration.
## 4.2 Client Health and Opportunity Engine
Compute an explainable Client Health Score from configurable signals such as delivery delays, unresolved issues, approval latency, payment status, campaign trends, communication gaps, satisfaction signals, and renewal proximity. Opportunity Engine identifies evidence-backed cross-sell/upsell opportunities and explains the supporting data. Scores are decision support, not autonomous truth.
## 4.3 Cedar Digital Twin
Maintain an evolving client preference model derived from explicit Brand DNA, approvals/rejections, revision patterns, decisions, and performance. The Digital Twin helps predict likely-fit concepts and presentation styles while retaining provenance and allowing humans to correct learned preferences.
# 5. Brand DNA and Creative Governance
Version Brand DNA so historical creative can be evaluated against the rules active at creation time.
Support visual tokens, typography, logo variants, safe areas, imagery rules, tone of voice, prohibited language, audience profiles, product facts, claims, disclaimers, locales, and examples.
Record approved and rejected creative patterns with rationale.
Quality Control checks outputs for brand consistency, spelling/language, required information, dimensions/specifications, and obvious inconsistencies before client review.
Do not let generative outputs silently overwrite approved assets or Brand DNA.
# 6. Cedar AI Architecture
## 6.1 Cedar Brain - Orchestrator
Cedar Brain is the central orchestration layer. It interprets intent, determines required permissions, retrieves context, creates an execution plan, invokes specialist capabilities, validates outputs, stores provenance, and routes approval-required actions.
### Orchestration lifecycle
Receive command and identify user, organization, client/resource scope, and intent.
Authorize the requested operation before retrieving sensitive context.
Build a task plan and identify required data, tools, agents, integrations, and approval gates.
Retrieve only relevant governed context from canonical records and knowledge layers.
Execute specialist steps with bounded tools and explicit budgets/timeouts.
Run Cedar AI Supervisor and Quality Control checks where applicable.
Persist outputs, source references, model/prompt versions, token/cost metadata, and intermediate decisions as policy permits.
Present a consolidated result with assumptions, confidence/uncertainty, and required approvals.
On approval, execute the external or sensitive action and record the immutable audit trail.
Feed approved outcomes and measured results into Agency Memory.
## 6.2 Specialist Capabilities

| Capability | Responsibilities |
| --- | --- |
| Marketing Idea AI | Campaign ideas, hooks, offers, ad angles, post/reel/story/carousel/TikTok concepts, scripts, captions, CTAs. |
| Design AI Studio | Creative concepts, generation briefs, variations, brand-aware design preparation and iteration. |
| Video AI Studio | Hooks, storyboard, scripts, shot structure, voice-over copy, subtitles, edit instructions, channel variants. |
| Localization AI | Market-aware localization preserving brand voice and meaning; handles creative copy variants. |
| Campaign AI | Strategy, objectives, audiences, budgets/scenarios, testing plan, optimization recommendations. |
| Quality Control AI | Brand, language, format, completeness, consistency, and policy-rule checks. |
| Meetings AI | Structured summaries, decisions, action items, follow-ups, and memory ingestion. |
| Finance Advisor AI | Profitability explanations, collections signals, forecasts, anomalies, and decision support. |
| Troubleshooting AI | Diagnose known integration, permission, publishing, payment, tracking, and platform issues from authorized evidence. |


## 6.3 Cedar AI Supervisor
Track agent/model success rate, evaluation score, latency, cost, retries, tool failures, hallucination/error reports, and user corrections.
Maintain prompt/model versions and evaluation datasets.
Use automated evaluations plus sampled human review for high-impact workflows.
Alert when quality or cost crosses configured thresholds; never silently self-modify production behavior.
## 6.4 Cedar Intelligence
Cedar Intelligence is the system-level advisory layer. It monitors workflows, modules, integrations, AI quality, usage, results, operational friction, and business performance to propose prioritized improvements. Recommendations must include evidence, expected impact, risk, effort, and affected modules. Implementation requires authorized human approval.
## 6.5 Cedar Living Intelligence / Market Intelligence
Ingest legitimate public, licensed, or authorized market knowledge about platforms, marketing practices, creative trends, technology, and AI. Normalize source metadata, freshness, confidence, and applicable markets. Never treat unverified market content as canonical client truth.
## 6.6 Memory Layers

| Layer | Contents | Write policy |
| --- | --- | --- |
| Client Memory | Brand facts, decisions, preferences, approvals, client-specific lessons. | Explicit or approved workflow writes; versioned. |
| Agency Memory | Campaigns, creative patterns, SOPs, decisions, lessons, successful/failed approaches. | Curated or outcome-triggered; provenance required. |
| Success Library | High-performing campaigns/creatives plus context, metrics, and why they may have worked. | Only after measurable outcome and review. |
| Market Memory | External trends, platform changes, technology and market intelligence. | Source/freshness metadata mandatory. |
| Session/Working Memory | Temporary execution context. | Short retention; do not promote automatically. |


# 7. Cedar Command Center
Provide a single natural-language interface across the OS. Commands must be context-aware, permission-aware, traceable, interruptible, and approval-aware.
## 7.1 Example Commands
“Create a complete launch campaign for Client X’s new fast charger.”
“Prepare tomorrow’s client meeting: summarize results, open issues, overdue approvals, and opportunities.”
“Why did profitability fall this month?”
“Create Instagram, TikTok, Facebook, and WhatsApp creative packages from this approved campaign concept.”
“Diagnose why this Meta connection is failing and show the safest resolution.”
## 7.2 Reverse Campaign Builder
Allow the user to specify a desired outcome, then work backward into channel mix, funnel assumptions, creative requirements, budget scenarios, experiments, and KPIs. All forecasts must show assumptions and ranges; the system must never guarantee sales or performance.
# 8. Marketing, Campaigns, Ads, and Performance
Campaign brief, objective, offer, audience, channels, budget plan, schedule, owners, creatives, approvals, experiments, and KPI targets.
Support Meta/Facebook/Instagram, TikTok, Google and future channels through connector adapters where official APIs and permissions allow.
Performance snapshots preserve history rather than only current totals.
Testing framework: hypotheses, variants, start/end criteria, spend, results, learning, winner/loser rationale.
AI recommendations must distinguish observed data from inferred explanation.
Budget/spend changes require configured approval.
## 8.1 Multi-Platform Creative Engine
Generate channel-specific creative packages from one approved campaign concept. Adapt composition, duration, copy length, CTA, aspect ratio, safe zones, caption structure, and platform norms rather than blindly resizing.
# 9. Content Planning and Publishing
Content calendar with client, channel, campaign, content pillar, format, owner, status, due date, approval, publish time, and linked assets.
Workflow: brief -> draft -> internal review -> client approval when required -> scheduled/ready -> publish -> performance -> learning.
Publishing is executed only through authorized connectors and approval policy.
Failed publishes create actionable alerts, preserve payload/error metadata, and support safe retry.
# 10. AI Design Studio
Start from product/campaign/client context and Brand DNA.
Create multiple concept directions and controlled variations.
Persist generation brief, prompt/instruction version, model/tool, source assets, output versions, edits, approvals/rejections, and final asset.
Support human editing handoff and external design connectors such as Canva where supported.
Learn from explicit corrections and approved outcomes, not from every generated draft indiscriminately.
# 11. AI Video Studio and Production
## 11.1 Video Studio
Concept, hook, storyboard, script, shot plan, voice-over copy, subtitle/caption copy, edit instructions, music/asset notes, platform variants.
Version scripts and edits; connect each final video to campaign, client, approval, publishing, and performance.
## 11.2 Photography / Production Module
Shoot schedule, locations, contacts, crew, roles, equipment, permits/requirements, call sheet, shot list, product list, references, status.
Large-file organization and metadata; proxies/previews where appropriate; best-shot selection and delivery sets.
AI can prepare shot lists, angle ideas, schedule suggestions, and equipment planning; humans own safety and production decisions.
# 12. Projects, Tasks, Calendar, and Work Management
Projects with templates, stages, owners, client, budget, timeline, health, deliverables, and linked campaigns/assets.
Tasks with assignee, status, priority, due date, dependency, estimate, actual time where enabled, checklist, comments, attachments, and audit history.
Milestones and dependencies with overdue/risk signals.
Calendar unifies deadlines, meetings, shoots, campaign launches, approvals, publishing, invoice dates, and renewals.
Reusable workflow templates reduce repeated agency setup work.
# 13. Meetings AI and Decision Capture
Meeting record: participants, client/project, agenda, notes/transcript reference, summary, decisions, action items, owners, deadlines, follow-ups.
Decisions are first-class records with rationale, approver, date, affected resources, and evidence.
Approved meeting decisions update relevant client/project context and can be promoted into memory.
# 14. Files and Smart Asset Manager
Object storage for binary assets; relational metadata for ownership, client/project/campaign links, content type, checksum, size, version, creator, and retention.
Immutable or recoverable version history for important assets.
Search by metadata plus semantic similarity where permitted.
Prevent orphaned assets through reference tracking and lifecycle policies.
Signed, time-limited access URLs; never expose storage credentials to clients.
Virus/malware scanning and file-type validation for uploads.
# 15. Approvals, Revisions, and Client Portal
## 15.1 Approval Model
Approval request targets a specific immutable version.
States: draft, requested, changes_requested, approved, superseded, canceled.
Comments and requested changes remain attached to the reviewed version.
Final approval records approver identity, timestamp, scope, and any conditions.
## 15.2 Client Portal
Client sees only explicitly shared resources within their client scope.
Review designs/videos/content, comment, approve/request changes, view reports/invoices/files where enabled.
Portal actions are audited and can trigger internal workflow events.
No internal notes, profitability data, agency memory, or unrelated client information is exposed.
# 16. Finance Hub
Invoices, line items, taxes/discounts where configured, due dates, status, payment records, outstanding balances, recurring billing metadata.
Expenses linked to client/project/campaign/vendor/category.
Revenue and cost attribution enabling gross profit and profitability by client/project/service/campaign.
Renewal and collection alerts.
Forecasts clearly separate committed, invoiced, collected, expected, and scenario-based values.
Financial adjustments are audited; payment execution requires explicit authorization.
## 16.1 CEO Dashboard
Owner view combines cash/revenue/expenses/profitability, client health, overdue invoices, pipeline/opportunities, project risk, campaign performance, pending approvals, integration incidents, team workload, and Cedar Intelligence recommendations. Every KPI must be drillable to its source records.
## 16.2 AI Business Advisor
Explain profitability, identify cost leakage, unprofitable engagements, strong services, capacity risks, collection risks, and evidence-backed upsell opportunities. Recommendations must expose assumptions and underlying metrics.
# 17. Integration Center
## 17.1 Connector Framework
Connector interface: authorize, refresh/revoke, health check, initial sync, incremental sync, webhook ingest, command/action execution, reconciliation.
OAuth/service authorization and scoped credentials stored in a secrets manager or encrypted credential vault.
Idempotency keys for external writes; deduplicate webhook events.
Rate-limit awareness, exponential backoff with jitter, dead-letter handling, and replay tools.
Connection dashboard shows connected/not connected, scopes, token expiry, last sync, next retry, errors, degraded status, and required user action.
## 17.2 Priority Integrations
Meta Business assets: Facebook/Instagram/Ads where supported by official APIs and permissions.
TikTok business/ads capabilities where supported.
Google Ads, Google Analytics, Google Business Profile and related authorized Google services as needed.
WhatsApp Business capabilities where officially available and authorized.
Canva/design workflow integration where supported.
Future CRM, storage, communication, accounting, and analytics connectors through the same adapter contract.
## 17.3 Troubleshooting Knowledge
Known integration, permission, verification, payment, publishing, tracking, and API incidents become structured troubleshooting articles/playbooks containing symptoms, evidence, safe resolution, platform/source version, and last verification date. Never encode policy bypasses.
# 18. Workflow Automation Engine
Automation is event-driven and policy-aware. Triggers may be domain events, schedules, status changes, incoming webhooks, or approved manual commands. Conditions filter execution; actions create/update records, notify users, call AI, or invoke authorized connectors.
## 18.1 Example: New Client
Create client workspace and contacts.
Collect/validate Brand DNA and required access.
Create project from service template.
Generate onboarding checklist and deadlines.
Create content/campaign planning placeholders.
Prepare invoice/renewal schedule as applicable.
Create integration tasks and connection checks.
Use AI to prepare initial research/briefs.
Route all client-facing or external actions through required approvals.
## 18.2 Reliability Requirements
Every workflow run has status, step history, input/output references, retry count, errors, and correlation ID.
Actions must be idempotent or protected by idempotency keys.
Long-running work executes asynchronously via durable queues/workers.
Support pause, cancel, retry failed step, and safe replay.
Do not allow automation to bypass authorization or approval policy.
# 19. Knowledge Graph and Cedar Knowledge Engine
Represent meaningful relationships such as Client -> Brand -> Project -> Campaign -> Creative -> Version -> Approval -> Publication -> Result, and Client -> Meeting -> Decision -> Task, plus financial and integration links.
## 19.1 Retrieval Architecture
Structured queries first for canonical facts and metrics.
Semantic retrieval for unstructured notes, briefs, meetings, SOPs, and knowledge items.
Graph expansion to collect relevant neighboring entities under authorization constraints.
Rerank and context-budget results before model invocation.
Every AI answer that relies on internal knowledge should retain source/resource references for traceability.
## 19.2 Knowledge Promotion
Raw AI output is not automatically institutional knowledge. Promotion requires an approved outcome, explicit curation, a verified external source, or a defined system rule. Store provenance, scope, freshness, confidence, and supersession links.
# 20. Cedar Decision Engine
For important decisions, aggregate relevant operational, performance, financial, client, and historical evidence. Return recommendation, alternatives, reasons, risks, assumptions, expected impact, and required approvals. The authorized human makes the final decision.

| Decision type | Example evidence |
| --- | --- |
| Campaign budget | historical CPA/ROAS, creative fatigue, funnel metrics, cash constraints, objective |
| Client renewal | profitability, health score, delivery history, results, payment behavior, opportunity |
| Hiring/capacity | workload, deadlines, utilization, pipeline, service demand |
| System improvement | usage telemetry, error rate, latency, agent evaluation, cost, user friction |


# 21. Cedar Innovation Lab and Evolution AI
Periodically identify underused modules, repeated manual work, slow workflows, missing capabilities, integration opportunities, and relevant new AI/technology.
Produce a prioritized innovation backlog with evidence, impact, effort, risk, dependencies, and suggested experiment.
No self-deployment. Owner approval and normal engineering review are mandatory.
# 22. Cedar Experience Engine
Learn non-sensitive workflow preferences such as commonly used views, recurring command patterns, preferred approval routes, and frequently selected templates. Adapt recommendations and shortcuts without hiding functionality or weakening controls. Users can reset or override learned preferences.
# 23. Security Architecture
## 23.1 Security Controls
Strong authentication; MFA for privileged users; secure session lifecycle and device/session revocation.
Least-privilege authorization and strict client/tenant scoping on every data path.
Encryption in transit and at rest; sensitive secrets stored outside application source/database plaintext.
CSRF/XSS/SQL injection protections, secure headers, input validation, output encoding, and dependency scanning.
Rate limiting and abuse controls on authentication, public/client portal endpoints, AI endpoints, and webhooks.
Audit sensitive reads/exports where appropriate and all sensitive writes.
Backups, restore testing, point-in-time recovery where supported, file versioning, and disaster recovery procedures.
Data retention/classification policies and export/delete workflows consistent with applicable obligations.
Security events and anomalous behavior surfaced to administrators.
## 23.2 Audit Event Minimum Schema
id, organization_id, actor_type, actor_id, action, resource_type, resource_id, client_id if applicable, timestamp, request/correlation_id, source_ip/device metadata where appropriate, before/after summary or change set where safe, approval_id, result, and integrity metadata.
## 23.3 AI Security
Treat retrieved content and external webhooks as untrusted data, not instructions.
Tool permissions are narrower than user permissions and explicitly declared.
Prevent prompt injection from escalating connector or data access.
Redact/minimize sensitive data before model calls when full context is unnecessary.
Log model/provider, prompt version, tool calls, source references, cost, and result status subject to privacy policy.
# 24. Recovery and Resilience
Soft delete for recoverable business records unless legal/security requirements demand hard deletion.
Version history for key records and files.
Database backups plus tested restore procedure and defined RPO/RTO targets before production launch.
Queue durability and dead-letter queues for failed asynchronous jobs.
Connector reconciliation detects drift between Cedar Point OS and external platforms.
Cedar Recovery System provides authorized restoration workflows with full audit logging.
# 25. Technical Architecture
## 25.1 Recommended Initial Topology
Use a modular monolith for the transactional core, separate asynchronous workers for durable jobs/AI/integration workloads, a relational database, object storage, cache/queue infrastructure, and a search/vector capability. Preserve module boundaries so high-load components can later be extracted.
## 25.2 Logical Components

| Component | Responsibility |
| --- | --- |
| Web Application | Owner/team/client UI; responsive operational workspace. |
| API/Application Core | Domain use cases, authorization, transactions, module contracts. |
| Worker Runtime | AI jobs, sync, publishing, media processing, reports, automation. |
| PostgreSQL | Canonical relational records, transactions, audit references. |
| Object Storage | Images, video, documents, exports, generated artifacts. |
| Redis/Queue or durable broker | Caching, locks, rate control, asynchronous work depending on chosen stack. |
| Search/Vector Layer | Full-text and semantic retrieval; may begin with PostgreSQL extensions before dedicated infrastructure. |
| Connector Gateway | External platform adapters, webhooks, reconciliation. |
| AI Gateway | Provider abstraction, model routing, prompt registry, safety/policy, cost/telemetry. |
| Observability Stack | Structured logs, metrics, traces, alerts, error tracking. |


## 25.3 Module Boundaries
Identity & Access
Clients & CRM
Brand & Knowledge
Projects & Work
Campaigns & Performance
Content & Publishing
Creative Studio
Video & Production
Files & Assets
Approvals & Portal
Meetings & Decisions
Finance
Integrations
Automation
AI Platform
Intelligence & Analytics
Notifications
Audit & Governance
## 25.4 API Principles
Version public/external APIs; internal module contracts should be explicit and tested.
Use resource-oriented APIs plus command endpoints for non-CRUD operations such as approve, publish, sync, or run-workflow.
Consistent error envelope with code, message, correlation_id, field errors, and safe remediation hints.
Pagination, filtering, sorting, sparse expansion where useful; never return unrestricted large collections.
Optimistic concurrency/version fields for collaborative edits and approvals.
Idempotency keys for external or financially sensitive commands.
# 26. Event Architecture
Domain events decouple modules without sacrificing transactional consistency. Use an outbox pattern so events are published only after the originating transaction commits.
## 26.1 Representative Events

| Event | Consumers |
| --- | --- |
| client.created | workflow automation, notifications, analytics |
| brand.updated | knowledge indexing, quality rules, cache invalidation |
| creative.approved | success pipeline, publishing readiness, audit |
| campaign.metric_snapshot_ingested | analytics, intelligence, client health |
| invoice.overdue | notifications, client health, CEO dashboard |
| integration.degraded | alerts, troubleshooting, intelligence |
| meeting.completed | action-item creation, knowledge promotion |
| ai.agent_run_evaluated | AI Supervisor, cost/quality analytics |
| workflow.failed | alerts, operations dashboard |
| client.health_changed | account manager alerts, opportunity/renewal workflows |


# 27. Data Architecture and Database Rules
## 27.1 Baseline Rules
Use UUID/ULID-style globally unique IDs consistently.
All tenant-scoped tables carry organization_id; client-scoped records carry client_id where meaningful.
created_at, updated_at, created_by/updated_by where meaningful; version/concurrency field on collaboratively edited records.
Money stored as integer minor units plus ISO currency, never floating point.
Time stored in UTC; preserve source/local timezone for scheduled business events.
External IDs namespaced by connector/account; never assume global uniqueness.
Use normalized transactional tables; denormalize only for measured read/performance needs.
Do not store binary files in the relational database except small technical blobs with a documented reason.
Audit records are append-oriented and protected from ordinary mutation.
## 27.2 Representative Tables

| Area | Tables / aggregates |
| --- | --- |
| Identity | organizations, users, memberships, roles, permissions, role_permissions, scoped_grants |
| Clients | clients, contacts, client_services, client_timeline_events, client_health_snapshots |
| Brand | brand_profiles, brand_versions, brand_assets, brand_rules, audiences, products, preference_signals |
| Projects | projects, milestones, tasks, task_dependencies, time_entries, project_templates |
| Campaigns | campaigns, channel_campaigns, experiments, creatives, metric_snapshots, recommendations |
| Content | content_items, content_versions, publishing_jobs, publishing_results, content_calendar_entries |
| Assets | assets, asset_versions, asset_links, asset_tags |
| Approvals | approval_requests, approval_steps, comments, decisions |
| Meetings | meetings, meeting_notes, action_items |
| Finance | invoices, invoice_items, payments, expenses, revenue_entries, recurring_billing_rules |
| Integrations | integrations, connections, external_accounts, sync_jobs, webhook_events, reconciliation_runs |
| Automation | workflows, workflow_versions, workflow_runs, workflow_steps, scheduled_triggers |
| AI | ai_requests, agent_runs, tool_runs, prompt_versions, model_configs, evaluations, ai_cost_entries |
| Knowledge | knowledge_items, knowledge_sources, relationships, embedding_refs, success_cases |
| Governance | audit_events, alerts, notifications, retention_rules |


# 28. Frontend Architecture and UX
## 28.1 Navigation
Command Center
CEO Dashboard
Clients
Projects
Campaigns
Content
Creative Studio
Video & Production
Calendar
Files
Approvals
Finance
Integrations
Knowledge
Intelligence
Team & Permissions
Settings
## 28.2 UX Rules
Client context is visible and switchable without losing work.
Global search/command palette can find records and initiate permitted actions.
Every AI output visibly distinguishes draft/recommendation from approved/executed state.
Critical actions show scope, impact, and approval requirement before execution.
Dashboards are drill-down interfaces, not static charts.
Use progressive disclosure: simple default workflows with advanced controls available when needed.
Accessible keyboard navigation, semantic structure, adequate contrast, responsive layouts, and meaningful empty/error states.
## 28.3 Key Screens

| Screen | Core content |
| --- | --- |
| CEO Dashboard | financial KPIs, client health, risk, approvals, campaigns, integrations, intelligence |
| Client 360 | overview, timeline, brand, projects, campaigns, content, assets, finance, meetings, approvals |
| Campaign Workspace | brief, strategy, creatives, experiments, performance, recommendations, approvals |
| Creative Workspace | brief, Brand DNA, variants, comments, versions, QC, approval |
| Integration Center | connections, scopes, sync health, errors, actions, troubleshooting |
| Command Center | conversation/command, plan, sources, generated artifacts, approvals, execution history |
| Intelligence Center | recommendations, evidence, impact, risk, owner decision, implementation status |


# 29. Analytics and Reporting
Metric definitions live in a governed metrics catalog so revenue, profit, ROAS, CPA, health scores, utilization, etc. have one definition.
Separate operational dashboards from client-facing reports.
Snapshot external metrics with source timestamp and connector/account identifiers.
Reports can combine narrative AI explanation with deterministic metrics; AI must not fabricate missing numbers.
Support scheduled report generation, approval, client portal delivery, and export.
Track report versions and the data cutoff used.
# 30. Notifications and Alerts
In-app notification center with severity, category, client/resource, action, read/acknowledged state.
Email/push/other channels may be added through adapters and user preferences.
Deduplicate noisy alerts and group repeated integration failures.
Escalation rules for overdue approvals, project risk, payment risk, integration degradation, security events, and failed workflows.
Intelligence recommendations are separate from urgent operational/security alerts.
# 31. DevOps, Environments, and Delivery
## 31.1 Environments
Local development with reproducible setup.
Automated test environment in CI.
Staging environment using production-like configuration and isolated credentials/data.
Production with least-privilege access and change controls.
## 31.2 CI/CD Gates
Formatting/linting, type checks, unit tests, integration tests, security/dependency scanning.
Database migration validation.
Build frontend/backend/workers and run smoke tests.
Deploy to staging automatically after passing main-branch gates; production uses controlled approval.
Post-deploy health checks and rollback/forward-fix procedure.
## 31.3 Observability
Structured logs with correlation/request/workflow/agent IDs.
Metrics: request latency/errors, queue depth/age, worker failures, sync health, connector rate limits, AI latency/cost/evaluation, database health.
Distributed traces for critical cross-component flows where valuable.
Alert runbooks link directly to troubleshooting knowledge.
# 32. Testing Strategy

| Test layer | Required focus |
| --- | --- |
| Unit | domain rules, calculations, state transitions, permission predicates |
| Integration | database repositories, queues, object storage, AI gateway contracts, connector adapters |
| API | authorization, validation, idempotency, pagination, error contracts |
| End-to-end | client onboarding, creative approval, publishing, campaign sync, invoice lifecycle, command-to-approval |
| Security | tenant/client isolation, privilege escalation, webhook validation, secrets exposure, rate limits |
| AI evaluation | grounding, brand adherence, localization, tool selection, refusal/approval behavior, regression |
| Recovery | backup restore, failed job replay, connector reconciliation, version restore |


# 33. AI Evaluation and Cost Governance
Maintain evaluation datasets for representative Cedar Point workflows and client-brand scenarios.
Score factual grounding, brand adherence, completeness, localization quality, action safety, tool correctness, and user correction rate.
Route tasks to the least expensive model that meets quality requirements; allow escalation for complex tasks.
Set per-user/per-workflow/provider budgets and anomaly alerts.
Cache only where safe and freshness requirements permit.
Store costs against client/project/workflow when useful for profitability analysis.
# 34. API / Connector Implementation Contract
Each connector must implement a common adapter contract conceptually equivalent to:
authorize(context) -> connection
refresh(connection) -> connection
health_check(connection) -> health
sync(cursor, scope) -> normalized_changes + next_cursor
handle_webhook(headers, payload) -> verified_events
execute(command, idempotency_key) -> external_result
reconcile(scope) -> drift_report
revoke(connection) -> result
Normalized external data is mapped into Cedar Point OS canonical models. Provider-specific payloads may be retained as bounded metadata for debugging/audit, but business logic must not depend on undocumented provider shapes.
# 35. Claude Code Repository Blueprint
Exact language/framework choices may be selected during bootstrap, but the repository must preserve the following boundaries. A TypeScript-first monorepo is a strong default for shared types and full-stack velocity; PostgreSQL is the canonical database.
/apps/web                 # team + client web application
/apps/api                 # HTTP/API application
/apps/worker              # async jobs, AI, automation, sync, publishing
/packages/domain          # domain entities, policies, value objects
/packages/application     # use cases / commands / queries
/packages/db              # schema, migrations, repositories
/packages/auth            # identity/authorization policies
/packages/events          # domain events, outbox, consumers
/packages/ai              # AI gateway, agents, prompts, evals, memory retrieval
/packages/connectors      # connector SDK + provider adapters
/packages/automation      # workflow engine contracts
/packages/ui              # shared UI system
/packages/observability   # logs, metrics, tracing helpers
/packages/config          # typed configuration
/docs/adr                 # architecture decision records
/docs/specs               # module specs and acceptance criteria
/tests/e2e                # critical end-to-end flows
/infra                    # deployment/infrastructure definitions
## 35.1 Coding Rules for Claude Code
Never place domain logic in UI components or provider adapters.
Every external dependency is behind an interface/adapter at the appropriate boundary.
Authorization is a first-class application policy, not scattered UI conditionals.
Commands that mutate state return deterministic results and emit domain/audit events.
Do not use untyped generic JSON as a substitute for modeled core business data.
Generate migrations alongside schema changes; seed only safe development fixtures.
Use feature flags for incomplete/high-risk modules rather than half-wired production behavior.
Add tests with each behavior, not as a final cleanup phase.
Do not commit secrets, production tokens, client credentials, or sensitive sample data.
Keep README/setup commands current after every infrastructure change.
# 36. Implementation Roadmap
## Phase 0 - Foundation
Monorepo, environments, CI/CD, configuration, PostgreSQL, migrations, authentication, organizations/memberships, RBAC, audit framework, object storage abstraction, queues/workers, observability, base UI system.
Deliverable: secure owner login, invite-only membership, role assignment, audit trail, health endpoints, staging deployment.
## Phase 1 - Agency Core
Clients/contacts, Brand DNA, projects/tasks/calendar, files/assets, activity timeline, search, notifications.
Deliverable: Cedar Point can operate client/project work from one canonical system.
## Phase 2 - Creative and Approval Operations
Content calendar, Creative Studio records, video/production workflows, versions/comments, approval engine, client portal, QC framework.
Deliverable: brief-to-client-approval lifecycle is operational.
## Phase 3 - AI Foundation and Command Center
AI Gateway, prompt/model registry, Cedar Brain orchestration, governed retrieval, Marketing/Localization/Meetings/QC capabilities, AI Supervisor telemetry/evals, Command Center.
Deliverable: natural-language commands create traceable drafts and workflows without bypassing approvals.
## Phase 4 - Integrations and Publishing
Connector SDK, Integration Center, priority provider adapters, sync/webhooks/reconciliation, publishing jobs, campaign metric ingestion, troubleshooting knowledge.
Deliverable: authorized external platform data/actions operate reliably with visible health.
## Phase 5 - Finance and Executive Intelligence
Invoices/payments/expenses/revenue/profitability, CEO Dashboard, Client Health, Opportunity Engine, AI Business Advisor, governed metrics.
Deliverable: owner can understand operational and financial health from source-backed data.
## Phase 6 - Advanced Intelligence
Agency Memory, Success Library, Knowledge Graph, Cedar Decision Engine, Cedar Intelligence, Living/Market Intelligence, Digital Twin, Innovation Lab, Experience Engine.
Deliverable: the OS learns from approved agency history and produces evidence-backed strategic recommendations.
## Phase 7 - Scale Hardening
Load/performance testing toward 100 employees/500 clients, data lifecycle, advanced recovery, connector scaling, media pipeline optimization, security review, disaster recovery exercises, operational SLOs.
Deliverable: documented production readiness at target scale.
# 37. MVP Boundary
MVP is not every future intelligence concept. MVP must establish the durable operating core and enough AI to prove the command-and-approval model.

| MVP Must Have | Later / Progressive |
| --- | --- |
| Identity, invite-only users, RBAC, audit | Advanced custom policy builder |
| Client 360 + Brand DNA | Digital Twin sophistication |
| Projects/tasks/calendar/files | Advanced resource forecasting |
| Content/creative/video records + versions | Deep generative media automation |
| Approvals + basic client portal | Complex multi-party approval graphs |
| AI Gateway + Cedar Brain + Marketing/QC/Localization/Meetings | Full Cedar Intelligence / Innovation Lab |
| Integration Center framework + first priority connectors | Broad marketplace of connectors |
| Basic finance + CEO essentials | Advanced forecasting/scenario modeling |
| Agency knowledge foundation | Living global market intelligence at scale |


# 38. Key Acceptance Scenarios
Owner invites a collaborator, assigns a scoped role, and the collaborator cannot access unauthorized clients or finance.
Owner creates a client, completes Brand DNA, uploads assets, and sees all subsequent work on the Client Timeline.
A command creates a campaign plan and platform-specific creative package using client context; the output is clearly a draft and traceable to sources/model/prompt.
A creative version is reviewed, changes are requested, a new version is created, and final approval remains bound to the approved version.
An approved content item is scheduled; connector failure produces an actionable alert and safe retry without duplicate publishing.
Campaign metrics sync into historical snapshots and dashboards without overwriting prior observations.
An overdue invoice affects client health and CEO alerts with a drill-down to the source invoice.
A meeting summary creates assigned action items and an approved decision that becomes client knowledge.
An integration token expires; Integration Center reports degraded health and guides reauthorization without exposing credentials.
Cedar Intelligence proposes an improvement with evidence and impact but cannot deploy or change production behavior without approval.
A deleted recoverable asset/record can be restored by an authorized user and the restoration is audited.
Cross-client access attempts fail at the API layer even if a user manipulates frontend identifiers.
# 39. Non-Functional Requirements

| Area | Baseline |
| --- | --- |
| Availability | Define production SLOs before launch; design stateless web/API tiers and durable workers. |
| Performance | Interactive CRUD pages should feel immediate; expensive analytics/AI/media work is asynchronous with progress states. |
| Scalability | Architecture supports ~100 employees / 500 clients baseline without redesigning domain boundaries. |
| Reliability | Idempotent external writes, durable jobs, retries, reconciliation, backups, restore testing. |
| Security | Least privilege, MFA for privileged access, encryption, audit, secrets management, secure SDLC. |
| Maintainability | Modular boundaries, typed contracts, tests, ADRs, automated migrations, observability. |
| AI quality | Evaluation gates, source traceability, human approvals, prompt/model versioning, cost monitoring. |
| Accessibility | Keyboard and semantic accessibility are part of definition of done for core UI. |
| Localization | Data model and UI are locale/timezone aware; client content supports multiple languages/markets. |


# 40. Cedar Standards and Operating Manual
Maintain system-wide standards for naming, statuses, approvals, Brand DNA, AI provenance, security, metrics, connector behavior, and error handling.
Each module has an operational page in /docs/specs describing purpose, entities, permissions, events, APIs, jobs, UI, metrics, failure modes, and acceptance tests.
Create SOPs for onboarding, campaign launch, creative approval, publishing failure, invoice collection, connector reauthorization, backup restore, incident response, and access revocation.
Documentation changes are part of feature completion.
# 41. Architecture Decision Records
Create an ADR whenever a choice materially affects architecture, security, data model, infrastructure, AI providers, connector strategy, or operational complexity. Minimum ADR fields: status, context, decision, alternatives, consequences, migration/rollback implications, and date.
## Initial ADRs Claude Code should create
ADR-001: Monorepo and primary application stack.
ADR-002: Modular monolith boundaries and extraction criteria.
ADR-003: PostgreSQL schema/migration strategy.
ADR-004: Queue/outbox/event delivery strategy.
ADR-005: Object storage and media lifecycle.
ADR-006: Authentication and authorization implementation.
ADR-007: AI provider gateway/model routing.
ADR-008: Semantic search/vector implementation.
ADR-009: Secrets/connector credential storage.
ADR-010: Deployment platform and observability stack.
# 42. First Claude Code Execution Plan
Claude Code should execute the project in small verified slices. The first implementation sequence is:
Bootstrap repository, package manager/workspaces, lint/format/type/test tooling, environment validation, README, and CI.
Create local infrastructure configuration for PostgreSQL plus the chosen queue/cache components; add health checks.
Implement organization, user, membership, invitation, role, permission, scoped grant, and session models.
Implement server-side authorization policy layer and tests for owner/admin/scoped user/client isolation.
Implement append-oriented audit event service and instrument identity/permission changes.
Implement base web shell, authenticated navigation, owner dashboard placeholder, team/permissions screens.
Implement client/contact aggregates, Client 360 shell, timeline event model, and tests.
Implement Brand DNA versioning and asset linkage.
Implement project/task/milestone primitives and calendar query model.
Implement object storage abstraction, asset metadata/versioning, upload validation, and signed access.
Only after these foundations are stable, proceed to content/creative/approval workflows and then AI orchestration.
## 42.1 Mandatory Checkpoint After Each Slice
Run all tests and static checks.
Apply migrations to a clean database.
Run a smoke test of the affected user flow.
Review authorization and audit coverage.
Update module spec/ADR/README if affected.
Commit a coherent change with no secrets and no knowingly broken feature path.
# 43. Future Expansion Framework
Future modules may include richer HR/team management, internal training/Cedar AI Academy, template marketplace, externalized Cedar OS Marketplace, additional accounting/CRM/storage connectors, advanced forecasting, and new AI/media providers. New capabilities must integrate through existing permission, audit, event, connector, knowledge, and approval frameworks rather than bypass them.
# 44. Final Product Rule
Cedar Point OS must become more valuable as Cedar Point Media uses it. The compounding asset is not merely software features; it is the governed combination of client context, agency decisions, approved creative, operational history, performance outcomes, financial truth, reusable workflows, and evaluated AI assistance. The system must preserve that knowledge while keeping humans in control of consequential actions.

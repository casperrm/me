# Architecture

This document explains how the codebase is structured so the full vision in
`VISION.md` can be built incrementally — new agents, integrations, and
modules attach to what exists rather than triggering a rewrite (Section
41: modular, API-first, from day one).

## Stack

- **Next.js (App Router) + TypeScript** — one deployable for UI and API
  routes. Server Components read the database directly (no separate
  internal API layer to keep in sync); API routes exist for things that
  need to be called from client components or eventually from outside the
  app (webhooks, the Client Portal, future integrations).
- **Prisma + SQLite (dev) / Postgres (prod)** — one schema, one migration
  history. SQLite means `npm install && npm run db:push` gets a working
  app with zero external services; switching `datasource.provider` to
  `postgresql` and pointing `DATABASE_URL` at a real instance is the only
  change needed to run this for real. Nothing in the app code is
  SQLite-specific.
- **Tailwind CSS** — utility styling, no design system dependency to
  maintain yet.

No auth provider, queue, or vector store is wired in yet. Those are
real decisions (see "What's deliberately not built yet" below) rather than
oversights, and each one has a clear attachment point already.

## Data model = the knowledge graph's first layer

Section 33 asks for `Client ↔ Brand ↔ Project ↔ Campaign ↔ Creative ↔
Result ↔ Invoice ↔ Meeting ↔ Decision ↔ AI Output` to be one interconnected
structure, not ten silos. `prisma/schema.prisma` is written so that's true
from the start: every entity below `Client` has a foreign key back to it
(directly or via `Project`), so "everything about this client" is always
one query away, and nothing new needs a parallel "which client does this
belong to" table bolted on later.

```
Organization
  └─ User (role: OWNER/ADMIN/MEMBER/CLIENT)
Client
  ├─ BrandDNA (1:1)
  ├─ ClientTimelineEvent[]
  ├─ ClientHealthScore[]
  ├─ Note[]
  ├─ Invoice[]
  ├─ Meeting[]
  └─ Project[]
       ├─ Task[]
       ├─ Asset[]
       └─ Campaign[]
            └─ Creative[]
                 └─ CreativeVersion[]
                      └─ Approval[]
AuditLog        — who did what, when, to which entity (Section 30)
CedarBrainRequest — every Command Center request + which agents it routed to (Section 5)
```

A literal graph database is not needed yet — the relational shape above
already gives correct traversal in every direction Section 33 lists. If
the app later needs graph-native queries (e.g. "what did we learn from
every rejected creative across all clients that share this industry"), the
same tables can be projected into a graph store without changing how data
is written.

## Cedar Brain: router today, multi-agent orchestrator tomorrow

`src/lib/cedar-brain.ts` is the seam Section 4 describes. Right now:

1. `routeToAgents(prompt)` — a keyword classifier that names which
   specialist agents (`marketing`, `design`, `video`, `localization`,
   `campaign`, `quality_control`) a request touches.
2. `callCedarBrain(prompt, agents)` — calls the Anthropic API with those
   agents named in the system prompt and asks for one combined plan. If
   `ANTHROPIC_API_KEY` isn't set, it returns a deterministic stub instead
   of failing, so the Command Center UI and the logging path
   (`CedarBrainRequest`) are exercisable without a key.

This is intentionally not real multi-agent orchestration yet. The
upgrade path, when it's time (Roadmap Phase 2+), is to replace step 2's
single call with one call per routed agent (each with its own system
prompt, its own access to Brand DNA / Success Library / prior revisions
for that client) and a merge step — without changing the router's
interface or the `CedarBrainRequest` log, since both already treat
"agents" as a list and "response" as an opaque blob.

Cedar Intelligence (Section 6) and Market Intelligence (Section 7) are
layers *above* this, not alternate entry points — they read from
`CedarBrainRequest`, `Approval`, `ClientHealthScore` etc. to produce
recommendations, and (per Section 6) never call back into the system to
change anything without a human approving it first. When built, they
should be read-only consumers of this schema plus whatever new
`Recommendation`/`Alert` tables they need — they should not need to modify
the core entities above.

## Module boundary rule

Every new module (Video Studio, Localization, Integration Center,
Finance Hub, ...) should:

1. Attach to `Client`, `Project`, `Campaign`, or `Creative` — not invent a
   parallel client/project concept.
2. Log anything decision-worthy as a `ClientTimelineEvent`,
   `AuditLog` entry, or (for AI output) a row modeled after
   `CedarBrainRequest`, so Agency Memory and the audit trail stay complete
   automatically instead of needing each module to remember to report in.
3. Follow the Section 21 principle for anything that publishes or spends
   money: **AI prepares → human approves (`Approval` model) → system
   executes.** No module should skip the `Approval` step for
   publish/spend actions, including ones built later.

## What's deliberately not built yet

These are scoped in `ROADMAP.md`, not forgotten:

- **Auth (Sections 29-30).** The schema has `User.role` and `AuditLog`
  ready, but there's no login flow — every page currently scopes to
  "the first organization in the database" (`src/lib/org.ts`). This is
  the top of `ROADMAP.md` Phase 1 and should land before this touches
  real client data or a second human user.
- **Real ad platform integrations (Section 14).** `Campaign.platform` /
  `externalId` exist so synced data has somewhere to go, but nothing syncs
  yet — that needs Meta/TikTok/Google's own OAuth + API terms, which is a
  business decision (API access approval, data-use agreements) as much as
  a coding one.
- **File storage (Section 26).** `Asset.url` is a plain string today
  (works fine for seed data / manual entry). Real upload needs an object
  store (S3-compatible) decision before it's wired to the UI.
- **Vector search / embeddings** for Agency Memory and the Success
  Library (Sections 5, 37) — needed once there's enough real campaign
  history to make similarity search worthwhile; premature over empty
  tables.

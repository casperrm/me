# Cedar Point OS

An AI-native operating system for Cedar Point Media — one place for clients,
projects, advertising, content, design, video, employees, finances, files,
approvals, reporting, automation, and AI. Not a website. Not a generic CRM.

The full vision (41 sections) lives in [`VISION.md`](./VISION.md) verbatim.
[`ARCHITECTURE.md`](./ARCHITECTURE.md) explains how this codebase is
structured to grow into that vision without a rewrite, and
[`ROADMAP.md`](./ROADMAP.md) sequences the remaining work into phases.

## What exists right now

This is the foundation, not the finished system. Building all 41 sections
in one pass isn't realistic — what's here is a real, working core that the
rest plugs into:

- **Data model** (`prisma/schema.prisma`) — Organization, Users/Roles,
  Client, Brand DNA, Client Timeline, Client Health Score, Projects, Tasks,
  Campaigns, Creatives + versions + approvals, Assets, Invoices, Expenses,
  Meetings, Audit Log, and a `CedarBrainRequest` log for Agency Memory.
- **Client Management + Brand DNA** (`/clients`, `/clients/[id]`) — a real
  client 360 profile: info, brand colors/fonts/tone, projects, timeline,
  invoices, notes.
- **CEO Dashboard** (`/dashboard`) — revenue, expenses, outstanding
  invoices, active clients, pending approvals, delayed projects, recent
  activity — computed from the database, not mocked.
- **Cedar Command Center** (`/command`) — a single natural-language input
  that routes a request to the relevant Cedar Brain agents and logs it.
  Works with a deterministic stub out of the box; set `ANTHROPIC_API_KEY`
  to get real drafted responses.

Everything else in the vision (Cedar Intelligence, Market Intelligence,
Video/Design Studios, ad platform integrations, finance automation, the
knowledge graph, etc.) is scoped and sequenced in `ROADMAP.md` but not yet
built — see that file before assuming a section is implemented.

## Getting started

```bash
npm install
cp .env.example .env
npm run db:push      # creates prisma/dev.db from the schema
npm run db:seed      # loads a demo client (Volt Mobile) with sample data
npm run dev
```

Then open `http://localhost:3000`.

To get real Cedar Brain responses in the Command Center instead of the
stub, set `ANTHROPIC_API_KEY` in `.env`.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + Prisma. SQLite in dev;
swap `DATABASE_URL` and the Prisma datasource provider to Postgres for
production — no model changes required. See `ARCHITECTURE.md` for why
this stack and how new modules/agents are meant to attach to it.

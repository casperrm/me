# Cedar Point - Agency Command Center

An all-in-one platform for Cedar Point's social media agency: manage
partners (clients), plan content, track boost campaigns, handle
invoicing/analytics, run a task list, and lean on **Cedar Point Brain** -
an AI teammate with persistent memory that helps write client reports,
brainstorm content, prioritize your day, and speed up ad design.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (swap the `DATABASE_URL` for Postgres in production - no code changes needed)
- Custom email/password auth (bcrypt + signed JWT session cookie)
- Recharts for analytics
- Anthropic API (Claude) for the Brain

## Getting started

```bash
npm install
cp .env.example .env      # then fill in AUTH_SECRET and (optionally) ANTHROPIC_API_KEY
npm run db:push           # creates dev.db and the schema
npm run db:seed           # optional: adds a demo account + sample data
npm run dev
```

Open http://localhost:3000 - it redirects to `/signup` the first time.
If you ran the seed script, you can also log in with:

- email: `demo@cedarpoint.test`
- password: `demopass123`

### Turning on the Brain

The app runs fully without it - every AI feature just explains it isn't
configured yet. To activate it:

1. Get an API key at https://console.anthropic.com/
2. Put it in `.env` as `ANTHROPIC_API_KEY=...`
3. Restart `npm run dev`

Once connected, the Brain can:

- **Chat** - a running conversation that remembers your business context.
- **Generate content ideas** for a partner, straight into the calendar.
- **Draft client reports** using that partner's real posts, campaigns, and invoices.
- **Prioritize your tasks** and explain its reasoning.
- **Write ad copy + creative briefs** (headlines, primary text, CTAs, visual direction) to speed up ad design - it can't generate images itself, but hands you everything needed to brief a designer or template tool.
- **Remember things long-term** via the Memory tab: save notes manually, save any chat reply, or paste a link to an article and have the Brain read it and store the key takeaways. Every other AI feature automatically pulls in relevant saved memories.

## Project structure

```
src/app/(app)/        Authenticated pages (dashboard, clients, calendar, campaigns, invoices, tasks, brain)
src/app/api/           REST-ish route handlers backing every page
src/app/login|signup   Auth pages
src/lib/               db client, auth helpers, Anthropic wrapper, memory retrieval
prisma/schema.prisma   Data model
prisma/seed.ts         Optional demo data
```

## Deploying

- Any Node host works (Vercel, Railway, Render, a VPS with `npm run build && npm start`).
- Swap `DATABASE_URL` to a Postgres connection string for a real multi-user deployment (SQLite is fine for a single agency running on one server, but doesn't handle concurrent writes well at scale).
- Set `AUTH_SECRET` to a long random string in production (`openssl rand -base64 32`).
- Set `ANTHROPIC_API_KEY` to enable the Brain.

## Notes on scope

This is a genuine working app, not a mockup - every button is wired to a
real API route and database. A few things are intentionally left simple
and are natural next steps if you want to go further:
- The "brain memory" retrieval is keyword-based, not vector search - fine for an agency's notebook of learnings, but could be upgraded to embeddings if the memory grows very large.
- There's a single shared workspace (all clients/campaigns/invoices are visible to every logged-in user) rather than per-user data isolation - appropriate for a small agency team, not a multi-tenant SaaS.
- No automated background "crawl the internet" job - the Brain learns from links you explicitly feed it, which keeps what it knows accurate and reviewable.

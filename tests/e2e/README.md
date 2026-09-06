# tests/e2e

Critical end-to-end flows (Bible Section 35, 32).

Empty so far — Phase 0's identity/access flow is currently exercised by
`packages/domain/src/policy.test.ts` (unit-level) plus a manual smoke test
recorded in `docs/specs/identity-access.md`. The first E2E test that
belongs here: login → protected page → logout, and invite → accept →
session, run against a real browser (e.g. Playwright) rather than curl.
Flagged as a tracked gap in `ROADMAP.md`.

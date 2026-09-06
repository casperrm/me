# ADR-009: Secrets / connector credential storage

- **Status:** Proposed (interim dev-only approach documented); production
  approach not yet decided
- **Date:** 2026-09-06

## Context

Bible Section 17.1 requires OAuth/service credentials in a secrets manager
or encrypted credential vault, never plaintext in the database. No
connectors exist yet (Phase 4), so there are no external credentials to
store today.

## Decision (current, interim — development only)

Application secrets that do exist today (`SESSION_SECRET`,
`ANTHROPIC_API_KEY`, `DATABASE_URL`) live in a git-ignored root `.env`
file, validated at startup by `packages/config`'s `loadEnv()`. This is
standard for local development and explicitly not a production-grade
secrets story.

## What this ADR will need to decide before any real connector credential
(Meta, TikTok, Google OAuth tokens) is stored

- A real secrets manager (cloud KMS-backed, e.g. AWS Secrets Manager /
  GCP Secret Manager / HashiCorp Vault) or, at minimum, application-level
  encryption of credential columns before they touch Postgres.
- Depends on the deployment platform decided in ADR-010.

## Consequences of deferring

None yet — no connector credentials exist to protect. This ADR is a
placeholder marker so Phase 4 doesn't start storing OAuth tokens in plain
columns "temporarily."

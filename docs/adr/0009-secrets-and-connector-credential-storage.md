# ADR-009: Secrets / connector credential storage

- **Status:** Proposed (interim dev-only approach documented); production
  approach not yet decided
- **Date:** 2026-09-06
- **Updated:** 2026-09-06 — the first real connector now exists; see
  below and `docs/specs/integration-center.md`.

## Context

Bible Section 17.1 requires OAuth/service credentials in a secrets manager
or encrypted credential vault, never plaintext in the database.

**Update:** the first real connector now exists — a generic webhook
receiver (`Connection.signingSecretEncrypted`, see
`docs/specs/integration-center.md`). Its one secret is a self-generated
HMAC signing key, not a third-party OAuth token, so it took the "at
minimum, application-level encryption of credential columns" option
this ADR already named below: AES-256-GCM via the same
`encryptSecret`/`decryptSecret` primitive MFA already uses
(`packages/auth/src/mfa.ts`), reused rather than duplicated. This is
still not a real secrets manager — the encryption key is derived from
`SESSION_SECRET`, the same interim posture as every other secret in
this system today.

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

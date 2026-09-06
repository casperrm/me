# ADR-005: Object storage and media lifecycle

- **Status:** Accepted (interim adapter) — production backend still open
- **Date:** 2026-09-06, revised 2026-09-06

## Context

Bible Section 14 requires object storage for binary assets with signed,
time-limited access URLs, checksum/version metadata, and virus/malware
scanning on upload.

## Decision

- **`StorageAdapter` interface** (`apps/web/src/lib/storage/adapter.ts`):
  `put`/`read`/`delete` keyed by an opaque string. Application code
  (`asset-service.ts`) only ever talks to this interface, never to a
  filesystem path or cloud SDK directly.
- **Local filesystem adapter** (`local-adapter.ts`) is the only
  implementation today, writing under `apps/web/.storage/` (git-ignored,
  outside `public/` and `src/` so nothing is ever served statically by
  accident). Fine for local development and this environment; **not**
  fine for a real multi-instance deployment (no shared storage across
  processes) — swapping in an S3-compatible adapter behind the same
  interface is the whole migration, once ADR-010 picks a deployment
  target that determines which provider makes sense.
- **Signed URLs, without S3:** `signed-url.ts` HMAC-signs
  `assetId + expiresAt` using `SESSION_SECRET`, and the download route
  (`/api/assets/[id]/download`) trusts the signature alone — no session
  check at download time. This deliberately mirrors real presigned-S3-URL
  semantics: the permission check happens once, when a page renders and
  calls `buildSignedDownloadPath`, and the resulting link is what's
  handed to the browser exactly as a presigned URL would be. Links expire
  after 5 minutes by default and are regenerated fresh on every page
  render, so there's no long-lived credential floating around.
- **Checksum:** SHA-256 of the file content, computed synchronously on
  upload and stored on `Asset.checksum` — real, not deferred.
- **File-type validation:** an explicit allow-list (common image formats
  + PDF) and a 15MB size cap, enforced before anything touches storage or
  the database.
- **Virus/malware scanning is NOT implemented.** There is no AV service
  available in this environment. `Asset.status` includes a `PENDING_SCAN`
  value in the schema for exactly this purpose, but every upload today
  goes straight to `AVAILABLE` — a status that never transitions is worse
  than being honest that scanning doesn't happen. This is an accepted gap
  for internal team uploads; **do not accept this ADR as sufficient once
  the Client Portal (Section 15.2) allows third-party uploads** — wire a
  real scanner (ClamAV via an `apps/worker` job, or a cloud AV API) before
  that surface exists.
- **Version history:** not modeled yet. `Asset.version` exists
  (defaulted to 1) but nothing increments it — a re-upload today creates
  a new `Asset` row rather than a new version of an existing one. Follow
  the `CreativeVersion`/`BrandProfileVersion` pattern (a child `AssetVersion`
  table) if/when in-place asset replacement with history becomes a real
  need, rather than guessing the right shape now.

## Alternatives considered

- **Go straight to S3/R2/etc. now** — rejected: no deployment target is
  chosen yet (ADR-010), so there's no real bucket, region, or credential
  story to build against. A local adapter behind the same interface lets
  every call site (upload route, download route, future Creative Studio
  output) be written once and be correct for both today's dev environment
  and tomorrow's real backend.
- **Skip signed URLs, just check session on every download** — considered
  and rejected for the download route specifically: Section 14 explicitly
  asks for time-limited access URLs, and building the habit now (checking
  permission once, at link-generation time, not on every byte served)
  is what actually generalizes to S3, where there is no "check session on
  download" option at all.

## Consequences

Files & Smart Asset Manager's core mechanics (upload, validate, store,
retrieve, delete, audit) are real and tested
(`apps/web/src/lib/services/asset-service.integration.test.ts`). What's
still missing before this is production-ready: a shared/durable storage
backend, virus scanning, and version history — tracked here and in
`ROADMAP.md`, not silently assumed done.

## Migration/rollback

Swapping `local-adapter.ts` for an S3-compatible adapter is additive:
implement `StorageAdapter` against the new backend, change the one export
in `apps/web/src/lib/storage/index.ts`, and existing `Asset.storageKey`
values become S3 keys instead of local paths (a one-time backfill/migration
of existing files into the new backend, not a schema change).

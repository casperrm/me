# ADR-005: Object storage and media lifecycle

- **Status:** Proposed — not yet implemented
- **Date:** 2026-09-06

## Context

Bible Section 14 requires object storage for binary assets with signed,
time-limited access URLs, checksum/version metadata, and virus/malware
scanning on upload. The current `Asset` model (`packages/db`) has a plain
`url: String` field — enough to carry seed data and demo links, not a real
upload path.

## Decision

Not yet made. This is Phase 0's honest boundary: `Asset.url` exists so
downstream models (`Project`, `Creative`) have somewhere to point, but no
upload flow, storage provider, or signed-URL mechanism is implemented.

## What this ADR will need to decide when Files & Smart Asset Manager
(Section 14, Phase 6 per `ROADMAP.md`) is actually built

- S3-compatible object storage provider (concrete choice depends on the
  deployment target decided in ADR-010).
- Signed URL generation (short-lived, scoped per asset) so client browsers
  never receive storage credentials.
- Where checksum/virus-scan happens (upload-time synchronous check vs.
  `apps/worker` async job) — likely async given Section 18.2's durability
  requirements, with the asset marked `pending` until scanned.
- Version history model: new `AssetVersion` rows vs. mutating `Asset` in
  place — should mirror the `CreativeVersion` pattern already established.

## Consequences of deferring

Nothing currently depends on real file upload working, so this is a safe
gap — but any Phase 1+ feature that assumes real asset URLs (Client Portal
file sharing, Creative Studio output) should treat this ADR as a
prerequisite, not build around the placeholder `url` field.

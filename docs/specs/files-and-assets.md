# Module: Files & Smart Asset Manager

Status: **Implemented, dev-grade storage backend** (Phase 0/1 slice).
Bible reference: Section 14. See `docs/adr/0005-object-storage-and-media-lifecycle.md`
for the storage backend decision and its known gaps.

## Purpose

A centralized place for client files (images, documents, logos) with
ownership metadata, integrity checking, and access that never exposes raw
storage paths or credentials to a browser.

## Entities

| Model | Package | Notes |
|---|---|---|
| `Asset` | `@cedar/db` | `organizationId` + optional `clientId`/`projectId`/`creativeId`; `storageKey` is backend-specific (see ADR-005), `checksum` is real SHA-256, `status` defaults to `AVAILABLE` (no virus scan gate — see ADR-005), `version` exists but nothing increments it yet. |

## Permissions

- Read (download): gated by a signed URL generated only when a page
  render already confirmed `clients:read` on the asset's client — no
  separate check happens at download time (ADR-005 explains why that's
  correct, not a gap).
- Write (upload, delete): `clients:write` on the asset's client.

## Events

`asset.uploaded`, `asset.deleted` (audit), plus an `asset_uploaded`
`ClientTimelineEvent`.

## APIs / entry points

- `POST /api/clients/[id]/assets` — multipart upload (`file` field).
  Validates content-type against an allow-list and a 15MB size cap before
  anything touches storage.
- `DELETE /api/assets/[id]` — removes both the database row and the
  underlying stored file.
- `GET /api/assets/[id]/download?token=...` — the only way to read a
  file back; requires a valid, unexpired HMAC token from
  `buildSignedDownloadPath`.

## UI

- `/clients/[id]` — "Files" card: upload control (`clients:write` only),
  list of files with size/uploader, download links (plain `<a>` tags —
  no client JS needed to download), and a remove button.

## Jobs

None. Upload is synchronous; there is no async virus-scan job yet (see
ADR-005 — this is the one thing Section 14 asks for that's genuinely not
built, not merely deferred-with-an-interim-version).

## Metrics

None instrumented yet.

## Failure modes

- **Disallowed file type or oversized file:** rejected before storage or
  database writes, with a specific error message.
- **Empty file:** rejected explicitly rather than creating a zero-byte
  asset.
- **Expired or forged download token:** 403, no information about
  whether the asset exists leaked in the response.
- **Cross-organization asset ID (delete or, in principle, download):**
  the delete path re-checks `organizationId` after the permission check;
  the download path's token is bound to one specific `assetId` at
  signing time, so a token for one asset can't be replayed against
  another.

## Acceptance tests

- `apps/web/src/lib/services/asset-service.integration.test.ts` — 6 tests
  against a real Postgres database and a real (temp-directory) local
  filesystem adapter: content-type rejection, empty-file rejection, a
  successful upload with checksum verified against the actual bytes
  written to disk, permission rejection for a role without
  `clients:write`, deletion removing both the row and the file, and
  cross-organization delete rejection.
- `apps/web/src/lib/storage/signed-url.test.ts` — 4 fast unit tests
  (fake timers, no I/O) covering token issuance/verification, rejection
  when the token is presented for a different asset id, expiry after the
  requested window, and rejection of malformed/tampered tokens.
- Manual smoke test performed for this slice: uploaded a `.txt` file
  (rejected), uploaded a real PNG (accepted), confirmed it appeared on
  the client page, downloaded it via the signed URL and byte-diffed it
  against the original, confirmed a forged token returns 403.

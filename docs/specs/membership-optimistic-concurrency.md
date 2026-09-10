# Optimistic concurrency for Membership updates

Bible reference: Section 27.1 ("version/concurrency field on
collaboratively edited records").

## The gap

`Membership.version` has existed since the original schema with a code
comment invoking this exact rule — `version Int @default(1) //
optimistic concurrency (Section 27.1)` — and `changeMemberRole`/
`revokeMembership` have always incremented it on every write. But until
now, nothing ever *compared* it before writing: every `prisma.membership
.update()` call used `where: { id: target.id }` only, never `where: {
id, version: expectedVersion }`. The increment happened, but nothing was
gated on it — a working-looking mechanism that couldn't actually catch
what it exists to catch, the same class of gap already found and fixed
this project for `correlationId` (a typed field nobody populated) and
named but deliberately left alone for `Invoice.currency` (a field
nothing reads, where the honest fix was leaving it alone rather than
inventing a consumer). This one is different from both: the field has a
real, concrete purpose stated in its own schema comment, and the Bible
names it as a baseline data-architecture rule — so the fix here is to
finish wiring the mechanism, not to remove the field or accept the gap.

**Concretely:** an org with two ADMINs (or an ADMIN and an OWNER) both
looking at `/team` is a completely ordinary scenario, not a contrived
one. If both act on the same membership — one changes a role while the
other revokes access, or both submit different role changes — from
what each saw when their page last loaded, the second write silently
overwrote the first with no indication to either admin that anything
had changed underneath them. For a security-relevant surface (who has
what access), a silent lost update is a real correctness gap, not a
cosmetic one.

## What's built

- `changeMemberRole` and `revokeMembership`
  (`apps/web/src/lib/services/membership-service.ts`) now take an
  `expectedVersion: number` parameter. The write itself is
  `prisma.membership.updateMany({ where: { id, version: expectedVersion
  }, data: { ..., version: { increment: 1 } } })` — the version check
  happens *inside* the same database write, not as a separate read-then-
  compare step beforehand (which would leave its own race window between
  the check and the write). If `count === 0`, nothing matched — either
  the row doesn't exist (already covered by other checks) or, in the
  real case this exists for, someone else's write already moved the
  version — and an `AuthError` is thrown: "This member was changed by
  someone else since the page loaded. Refresh and try again."
- A malformed/tampered `expectedVersion` (not a real integer) is
  rejected up front with an `AuthError` before any query runs, matching
  the existing pattern of validating malformed input at the service
  boundary (e.g. `setTaskStatus`'s `TASK_STATUSES.includes` check).
- `apps/web/src/lib/actions/membership.ts`'s `changeRoleAction`/
  `revokeMembershipAction` parse `expectedVersion` from the submitted
  `FormData` and pass it through. Both already return `{ error }`
  instead of throwing (the previous slice,
  `docs/specs/inline-action-errors.md`) — a version conflict surfaces
  through the exact same inline-error path as the "ADMIN can't manage an
  OWNER" case, no new UI mechanism needed. On any `AuthError` (including
  a conflict), the action now also calls `revalidatePath("/team")`
  before returning — previously that only ran on success — so a stale
  view gets refreshed to current server state regardless of which
  request lost the race.
- New `apps/web/src/app/(app)/team/MemberRowActions.tsx` (already a
  client component from the previous slice) gained a `version: number`
  prop and a hidden `expectedVersion` input on both the role-change and
  revoke forms, sourced from `team/page.tsx`'s already-fetched
  `Membership.version` field (no new query).

## Scope — explicitly not built

- **`grantClientScopeAction` was not touched.** It creates a new
  `ScopedGrant` row rather than updating the `Membership` record itself,
  so there's no lost-update risk on the membership row for this
  operation — adding a version check here would be defensive code for a
  race that can't happen.
- **`Asset.version`** (a separate, unrelated field on a different model)
  was found while investigating this gap and is genuinely dead — never
  read, never incremented, never referenced anywhere in the codebase, no
  explanatory comment. Left alone for now: it's a smaller, separate
  question (whether asset uploads are ever "collaboratively edited" in
  a sense that needs this at all, versus files simply being replaced by
  new `Asset` rows) than this slice's clear, Bible-cited, already-half-
  built `Membership.version` gap, and speculatively wiring a
  never-articulated use case for it would repeat the exact
  `Invoice.currency` mistake this project has already caught once.
- **No optimistic concurrency added to other models.** `Membership` was
  the only model in the schema with a comment explicitly invoking
  Section 27.1's concurrency-field rule; nothing here searches for or
  retrofits the pattern onto other "collaboratively edited" records
  (e.g. `Task`) without a similar concrete signal that one was intended.

## Testing

- `apps/web/src/lib/services/identity.integration.test.ts` (new
  describe block, 2 tests, against real Postgres): the core scenario —
  two role-change requests both read version 1, the first succeeds and
  moves the row to version 2, the second (still submitting
  `expectedVersion: 1`) is rejected with the "changed by someone else"
  message, and the final row shows exactly the first write's role with
  version 2, not 3 — proving no double-apply and no silent overwrite. A
  second test confirms a non-integer `expectedVersion` is rejected
  before any row is touched.
- Live-verified against a real running production build with two real
  browser sessions (Playwright/Chromium, two separate logins simulating
  two open `/team` tabs): both loaded the page with the target
  membership at version 1; tab A changed its role to `FINANCE` and
  succeeded; tab B, still holding its stale version-1 view, submitted a
  different role change and received the real inline conflict error
  text with no full-page crash. Direct query after both submissions
  confirmed the database held tab A's write only (`role: FINANCE`,
  `version: 2`) — tab B's conflicting write never landed. Fixture rows
  (1 user, 1 membership, its session/audit event) cleaned up afterward;
  confirmed the dev database was back to exactly the seeded 1 user / 1
  membership.

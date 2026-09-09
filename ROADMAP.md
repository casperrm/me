# Roadmap

Canonical phase structure: `docs/CEDAR_POINT_OS_BIBLE.md` Section 36. This
file tracks progress against it and adds the concrete next steps within
each phase. Section numbers below refer to the Bible unless noted.

Per Section 0.1: before adding anything not implied by the current phase,
ask whether it saves time, improves quality, improves decision-making,
preserves Cedar Point's knowledge, or increases profitability — and check
`docs/adr/` for whether a related decision has already been deferred on
purpose.

## Phase 0 — Foundation: **mostly done**

Target deliverable (Section 36): secure owner login, invite-only
membership, role assignment, audit trail, health endpoints, staging
deployment.

- [x] Monorepo, environments config (`packages/config`), PostgreSQL +
      migrations (`packages/db`).
- [x] Authentication (session-based), organizations/memberships/
      invitations, RBAC (`packages/domain`, `packages/auth`).
- [x] Audit framework (`packages/events`, Section 23.2 schema).
- [x] Base UI system, owner dashboard, team/permissions screens
      (`apps/web`). A follow-up slice closed a real Section 28.2 gap
      ("meaningful empty/error states") this app never had: no
      `error.tsx` boundary anywhere, meaning an uncaught error from any
      Server Component render or server action crashed the *entire*
      page to Next.js's generic "Application error" screen — the exact
      failure mode two earlier slices had each hit and separately
      worked around at one specific call site (`docs/specs/
      projects-and-calendar.md`'s blocked-task bug; `docs/specs/mfa.md`'s
      explicitly-named "server actions don't catch
      AuthorizationError/MfaRequiredError" gap), without ever fixing the
      underlying absence of a boundary. New shared
      `apps/web/src/components/ErrorBoundaryContent.tsx` plus three
      `error.tsx` files — `(app)/error.tsx` (→ `/dashboard`),
      `portal/error.tsx` (→ `/portal`), and the root `apps/web/src/app/
      error.tsx` (→ `/login`, and — per Next.js's nesting rule that a
      segment's own `layout.tsx` sits outside that segment's
      `error.tsx` — the only boundary that can catch a failure inside
      `(app)/layout.tsx` or `portal/layout.tsx` themselves, both of
      which do real data fetching). Deliberately never renders
      `error.message` — Next.js already strips it for a server-thrown
      error before the boundary sees it, a security default worth
      keeping, not fighting. Explicit scope boundary in
      `docs/specs/error-boundaries.md`: no `global-error.tsx` (the true
      root layout only renders static shell markup, nothing in it can
      throw); server actions still don't do their own try/catch, so
      this is the *last* line of defense, not a replacement for
      preventing a predictable rejection at the call site (the pattern
      already used for the blocked-task bug); no error-tracking service
      wired up, only `console.error` with the real `digest`. Verified
      live against the real running server: reproduced a genuine
      uncaught server-action error on purpose — tampered with
      `TaskPriorityForm`'s hidden `taskId` input via the browser's own
      DOM (a real-world equivalent of a task deleted in another tab)
      and submitted, driving a real, uncaught `AuthError("Task not
      found.")` from inside `setTaskPriorityAction` — and confirmed the
      real app showed the new friendly boundary with a working "Try
      again" button, not Next's generic crash page.
- [x] Health endpoints (`apps/api` `/health` + `/ready`).
- [x] Queue/worker runtime (`apps/worker`) now carries a real job — the
      Section 30 overdue-escalation scan (hourly, `immediately: true` on
      restart), see `docs/specs/notifications.md`.
- [x] Object storage abstraction — `StorageAdapter` interface with a
      local-filesystem dev implementation, real checksums, signed
      time-limited download URLs, upload validation (type/size).
      Production S3-compatible backend still open — see ADR-005.
- [ ] **Staging deployment — not started.** `infra/` is empty; ADR-010
      needs a decision before this can happen. This is Phase 0's one
      concretely unmet deliverable.
- [x] MFA (Section 23.1) — TOTP enrollment/login-challenge/recovery codes,
      per-user opt-in from `/security`, plus two follow-up enforcement
      slices. First: `Organization.mfaRequiredForPrivilegedRoles` (off by
      default, toggled from a new "Security policy" card on `/team`,
      `organization:manage`-gated) makes MFA mandatory, not just
      offered, for OWNER/ADMIN members. The shared `(app)/layout.tsx`
      shell redirects any gated, unenrolled OWNER/ADMIN to `/security`
      on every other page (a new `middleware.ts` forwards the real
      request pathname so the layout can exempt `/security` itself
      without a route-group assumption); a banner there explains why.
      Second (this slice): closed that first slice's own explicitly-named
      remaining gap — the gate blocked page navigation only, not a direct
      API call made with an already-valid session. Moved
      `MFA_PRIVILEGED_ROLES` to its canonical home,
      `packages/domain/src/roles.ts` (previously duplicated in
      `mfa-policy-service.ts`), and added the real gate to
      `packages/auth/src/authorize.ts`'s `requirePermission`/
      `requireAnyPermission` — the actual authorization choke point every
      mutating server action/API route already calls — via a new
      `MfaRequiredError`, thrown only *after* the permission check itself
      passes (so an actor who isn't authorized at all still gets a plain
      `AuthorizationError`, never leaking MFA-gating status to someone
      who was never going to be allowed the action regardless).
      Deliberately not added to `isAuthorized`/`isAuthorizedAny` — those
      are documented read-branching helpers for UI conditionals that
      return a boolean rather than throw, not the security boundary.
      Mapped to HTTP 403 with a consistent message in all 38 API route
      files that already catch `AuthorizationError`, following this
      codebase's established per-file convention rather than introducing
      a shared error-mapping abstraction. See `docs/specs/mfa.md` for
      full design rationale, what's still open (WebAuthn/security-key, a
      per-role-configurable policy — both unchanged from the first
      slice), and one explicit gap this slice did not fix:
      `apps/web/src/lib/actions/*.ts` server actions still don't catch
      `AuthorizationError`/`MfaRequiredError` at all, so an uncaught
      `MfaRequiredError` from one propagates the same way an uncaught
      `AuthorizationError` already did — pre-existing, out of scope here.
      New coverage: `packages/auth/src/authorize.integration.test.ts` (9
      tests, real Postgres, new `packages/auth/vitest.config.ts` since
      this package had no integration-test database wiring before);
      3 existing route-contract files extended with real HTTP-level 403
      coverage (expenses +2, team/invite +2, milestone toggle +1); 2
      pre-existing test files' fixtures fixed for a real, correct
      behavior change the gate surfaces (an unenrolled OWNER/ADMIN can no
      longer turn the org's own MFA policy back off via the API until
      they enroll — not a lockout of the organization, since any other
      enrolled privileged member, or the same member after enrolling,
      still can). Full suite: 526 tests across 6 workspaces, all passing.
      Verified live against the real running server and dev database
      with real HTTP only (not a browser — this gap was specifically
      about bypassing the UI): logged in as the seeded owner, confirmed
      baseline 200 on a direct `POST /api/expenses`, turned the org's MFA
      policy on via the real API, confirmed via `psql`, then — with the
      *same* still-valid session cookie and no page ever visited — issued
      the identical direct mutation and got a real 403 with the
      MFA-required message; completed real enrollment through the
      running app (`otplib`-computed TOTP code against the real returned
      secret), repeated the mutation, got a real 200. Restored state
      through real flows in the correct order (learned live: disabling
      MFA before turning the policy off leaves the account unable to turn
      its own policy off, so cleanup re-enrolled, toggled the policy off
      first, then disabled MFA), cross-checked via `psql`: policy back to
      `false`, user back to unenrolled with no stored secret or recovery
      codes, `expenses` row count back to its exact pre-test value with
      the two smoke-test rows and their audit events deleted, and 7
      legitimate new audit events (a real login plus the real MFA/policy
      lifecycle) left in place as genuine history, matching the first
      slice's own precedent. Confirmed no server process left running
      afterward.

## Phase 1 — Agency Core: **complete**

Deliverable: Cedar Point can operate client/project work from one
canonical system.

- [x] Clients/contacts, Brand DNA (versioned, with a real edit UI at
      `/clients/[id]/brand/edit` — see `docs/specs/brand-dna.md`),
      projects/tasks (creation, assignment, status transitions, and —
      added in nine follow-up slices — per-task checklists: add/toggle/
      delete a flat ordered list of sub-items; task priority
      (low/medium/high, defaulting to medium, changeable inline via its
      own `<select>` next to status); task estimate (a nullable hours
      figure, changeable inline via a number input with an explicit
      "Set" button); task comments (a flat, append-only, per-author
      conversation log, collapsed behind a "Show comments (N)" toggle);
      task attachments (reusing the existing Files module's `Asset`
      model and storage adapter rather than a parallel upload path — an
      attachment is just an `Asset` row with `taskId` set alongside
      `clientId`/`projectId`); project milestones (a named deadline
      with a computed, not stored, overdue signal — `!done && dueDate <
      now` — now unified into `/calendar` alongside task/project/invoice
      due dates); task dependencies (a task can declare it's blocked by
      another task in the same project — a "Blocked by: X" pill, and a
      hard rule inside `setTaskStatus` itself that a task can't be
      marked done while an open blocker remains, so every caller of
      status changes gets the rule automatically, not just the UI); and
      reusable project templates (save any project's current tasks —
      title + priority — as an org-wide `ProjectTemplate`, then
      instantiate a new project from one for any client, with a "+ From
      template" picker on the client page), all `clients:write`-gated
      the same way task writes already were — see
      `docs/specs/projects-and-calendar.md`) with client isolation
      enforced server-side, not just in the UI. Those follow-ups closed
      every item Section 12 explicitly named as "not built yet" —
      checklist, priority, estimate, comments, attachments, milestones,
      (the smallest real cut of) task dependencies, and (a similarly
      scoped cut of) project templates — leaving only a real
      dependency-graph/critical-path engine as a still-deliberately-
      unbuilt refinement within those cut features, not an open list
      item. A ninth follow-up then closed that same paragraph's other
      named refinement, template *editing*: `renameProjectTemplate`,
      `deleteProjectTemplate` (deletes the template's
      `ProjectTemplateTask` rows first, in one `prisma.$transaction`,
      since that relation has no `onDelete: Cascade`), `addTemplateTask`
      (append-only, same `position = current count` convention checklist
      items use, importing `TASK_PRIORITIES` from `project-service.ts`
      rather than redefining it), and `removeTemplateTask` — all four
      gated on `clients:write` with **no `clientId`**, restricting them
      to an actor who holds it organization-wide (OWNER always, ADMIN by
      role, or an explicit org-wide `ScopedGrant`) rather than any one
      client's grant, since managing the shared template library isn't
      scoped to a client the way creating/instantiating a template is —
      verified by a dedicated integration test proving a per-client (not
      org-wide) `clients:write` grant is correctly denied. A new
      `/templates` management page (nav-gated the same org-wide way,
      matching `/integrations`'s own pattern) lists every template with
      an inline rename form, a `confirm()`-guarded delete button (same
      weight `RevokeConnectionButton` already established), and a
      per-task remove button plus add-task form — no reordering, same
      append-only precedent checklist items set. Deleting a template
      never affects projects already instantiated from it, since
      `createProjectFromTemplate` copies tasks into independent rows
      rather than keeping a live reference — confirmed by re-reading
      that function before documenting it. New coverage: the existing
      `project-template-service.integration.test.ts` grew from 12 to 24
      tests; three new route-contract files
      (`project-templates/[id]/route.contract.test.ts` for PATCH/DELETE,
      `project-templates/[id]/tasks/route.contract.test.ts`,
      `project-template-tasks/[id]/route.contract.test.ts`) add 19 more.
      Full suite: 557 tests across 6 workspaces (up from 526), all
      passing. Verified live against the real running server and dev
      database: reused the seeded "FastCharge Launch" project rather
      than creating a fresh one, saved it as a template through the
      real pre-existing UI flow (proving that path still works), then
      through a real headless-Chromium pass on the new `/templates`
      page renamed the template, added a task, removed a task, and
      deleted the whole template (accepting its real `confirm()`
      dialog) — each step cross-checked with `psql`, including
      confirming the deleted template's task rows were really gone with
      no FK error ever surfacing to the user. A screenshot taken
      mid-pass was visually inspected and showed a clean layout with no
      overlapping or unclickable controls. Cleaned up back to the exact
      pre-test row counts (0 templates/0 template tasks), leaving only
      the real audit events and login sessions the pass legitimately
      generated, and confirmed no server process was left running
      afterward.
      Each slice was verified live against a real
      running server: checklist via a full real add/toggle/delete round
      trip driven through a headless browser against a real seeded
      task; priority via a real API-created task whose priority was
      then changed through the real UI dropdown and confirmed with
      `psql` after a page reload; estimate the same way, changing a
      real task's hours through the real input and "Set" button;
      comments by posting one through the real API, confirming its
      author attribution with `psql`, then posting a second through the
      real UI form and confirming both rendered with the right author
      names after a reload; attachments by uploading a real file
      through the real API, confirming the persisted row and the
      on-disk file, then removing it through the real UI and confirming
      both the row and the file were gone afterward; milestones by
      creating a real past-due milestone, confirming the real "Overdue"
      badge rendered on the project page and disappeared once marked
      done, then separately confirming a near-future milestone appeared
      on the real `/calendar` page with the correct badge; dependencies
      by creating a real blocking edge through the real API, then in a
      real browser confirming the blocked task's "Done" option was
      disabled, unblocking it by completing the blocker, completing the
      blocked task successfully, and removing the dependency via its
      "✕" button — this live pass caught a real bug (an uncaught
      `AuthError` from the new status-change rule crashing the whole
      page with no error boundary to catch it) that the integration and
      route-contract tests alone had not, fixed by disabling the "Done"
      option client-side whenever a task has an open blocker; templates
      by saving a real project as a template and instantiating a new
      project from it through the real API, confirming both the task
      snapshot and the copied tasks via `psql`, then repeating the full
      save/instantiate round trip through the real UI — which caught a
      second real bug, a header-row layout overflow that made the
      instantiate form's own "Create" button unclickable, fixed by
      moving the form into the card body and adding `flex-wrap`.
- [x] Calendar — `/calendar` unifies task/project/invoice/milestone due
      dates, scoped to what the actor can read. A follow-up slice
      finally joined `Shoot.scheduledAt` and client-scoped
      `Meeting.occurredAt` — this bullet's own prior wording named both
      as pending "once those modules exist," and both now do. An
      internal (clientless) meeting is deliberately excluded: every
      other event type here has exactly one client, and the calendar is
      inherently client-centric, so there's no client thread for one to
      hang off of — it stays visible on `/meetings` instead. Campaign
      launches remain the one still-pending item (Phase 4, blocked on
      real ad-platform connectors this environment can't obtain OAuth
      credentials for). Extended
      `project-and-calendar.integration.test.ts`'s existing
      `getUpcomingEvents` tests with a real scheduled shoot and a
      client-scoped meeting (both asserted present and correctly
      client-scoped) plus a real internal meeting in the same window
      (asserted absent from every result, scoped or org-wide) — still 29
      tests total, since these extend existing assertions rather than
      adding new cases. Verified live: created a real shoot and a real
      client-scoped meeting through the running server, confirmed both
      rendered on `/calendar` with the correct new "Shoot"/"Meeting"
      badges and client names, then confirmed a real internal meeting
      created the same way never appeared there.
- [x] Meetings and Decision Capture (Section 13) — closes a real gap
      this file never named as built: `Meeting`/`MeetingAttendee` were
      scaffolded early alongside the core domain models, but had no
      service, API route, UI, or test anywhere in the codebase
      referencing them. Section 13's own text is a large, partly
      AI-dependent, partly speculative vision (transcript capture,
      AI-generated summaries, decisions with "approver ... and
      evidence," promotion into memory); this slice builds the smallest
      real cut on top of the real (dead) schema rather than inventing a
      feature from scratch, and Section 36's phase list only mentions
      "Meetings" in passing as a future Cedar Brain AI capability — the
      record-keeping half built here is squarely Phase 1 agency-core
      work, not an AI feature, so it's placed here alongside Section
      12's Projects/Tasks/Calendar rather than under Phase 3. Two real,
      pre-existing schema bugs were fixed in one migration first (zero
      rows in either table in both the dev and test databases, confirmed
      via `psql` before touching anything — safe to restructure with no
      data-migration risk): `Meeting` had no `organizationId`, so a
      clientless internal meeting (a real case — an agency has internal
      team meetings too) would have had no tenant scope at all (a real
      Section 38 gap); `MeetingAttendee.userId` pointed at the bare
      global `User` instead of `Membership`, inconsistent with every
      other actor-reference in this schema
      (`Task.assigneeId`/`TaskComment.membershipId`/`Asset.uploadedBy`).
      New `meeting-service.ts`: `createMeeting`/`updateMeetingNotes`/
      `addMeetingDecision`/`addMeetingFollowUp`/`getMeeting`/
      `listMeetingsForClient`/`listMeetingsForOrganization` (the last
      following `calendar-service.ts`/`search-service.ts`'s established
      already-resolved-`clientIds` contract exactly, no
      `requirePermission` inside it), and `promoteFollowUpToTask` — the
      standout feature, turning a follow-up into a real `Task` by
      reusing the existing `createTask` (Section 12) rather than
      reimplementing task creation, the concrete buildable half of
      Section 13's "approved meeting decisions update relevant
      client/project context" (Agency Memory itself doesn't exist yet —
      `docs/specs/client-memory.md` already documents that gap — so
      "promoted into memory" stays unbuilt). No new permission: reuses
      `clients:write`/`clients:read`, gated by the meeting's own scope
      (its `clientId`, or org-wide when internal) exactly the way
      `project-template-service.ts`'s template-management functions
      already precedent this "sometimes client-scoped, sometimes
      org-wide" shape. Decisions are deliberately simple user-entered
      records (`text`, optional `rationale`) rather than a second
      approval workflow with an approver/evidence model, which would
      duplicate Section 15.1's existing Approval engine for a different
      resource type. Five new routes under `/api/meetings/**`; a new
      `/meetings` list page (ungated nav item like `/metrics`, computing
      `clientIds` via `getReadableClientIds` the same way `/calendar`'s
      page does, plus a new `getWritableClientIds` — the write-side
      mirror of that helper — for the "+ New meeting" client picker) and
      `/meetings/[meetingId]` detail page (notes textarea with an
      explicit "Save" button matching `TaskEstimateForm.tsx`'s
      explicit-save pattern, a Decisions list, and a Follow-ups list
      with a "Promote to task →" control that becomes a "✓ Task
      created" link once promoted); the client 360 page gained a
      compact "Meetings" card mirroring the Invoices/Expenses cards'
      shape. New coverage: `meeting-service.integration.test.ts` (26
      tests, including a dedicated org-wide-vs-per-client permission
      boundary test — same shape as the one added for project template
      management — proving a per-client-only `ScopedGrant` holder can
      create/read that client's meetings but not an internal one, even
      one that already exists) plus five `*.route.contract.test.ts`
      files (28 tests). Full suite: 625 tests across 6 workspaces with
      any tests (up from 571), all passing; clean typecheck/lint/build.
      Verified live against the real running server and seeded dev
      database with a real headless-Chromium pass: created a real
      client-scoped meeting for the seeded "Volt Mobile" client with a
      real attendee through the actual `/meetings` UI, confirmed it
      appeared both on `/meetings` and on that client's 360 page's new
      Meetings card; opened its detail page, saved a real note through
      the UI, reloaded, and confirmed it persisted (cross-checked via
      `psql` against the real dev database); added a real decision and a
      real follow-up (with an owner and a due date), confirmed both
      rendered; promoted the follow-up to a task against the seeded
      "FastCharge Launch" project, confirmed the UI switched to "✓ Task
      created," and confirmed via `psql` that a real `Task` row existed
      with the right title/assignee/due date and the meeting's
      `followUps` JSON had `promotedTaskId` set correctly; confirmed the
      promote button was correctly gone from the UI for the
      now-promoted follow-up, then proved the server-side guard
      directly via a real authenticated `curl` request repeating the
      same promotion and got back a real 400 "This follow-up has
      already been promoted to a task."; created a second, real internal
      meeting (no client) through the UI, confirmed it appeared on
      `/meetings` labeled "Internal" but never appeared on the client
      360 page. A screenshot of the meeting detail page (its Follow-ups
      card in particular — owner/due-date/promote-button sharing one
      row, a layout shape this session has gotten wrong before) was
      visually inspected and showed a clean layout with no overlapping
      or unclickable controls. Cleaned up every row this pass created
      (both meetings, their attendee row, the promoted task, and the 7
      tied audit/timeline events) and cross-checked via `psql` that dev
      database row counts matched their exact pre-test values, leaving
      only the 2 real login audit events the pass legitimately
      generated as genuine history (same precedent as every prior live
      smoke test this session). Confirmed no server process was left
      running afterward. See `docs/specs/meetings.md` for the full
      design, the schema-fix rationale, and the explicit scope
      boundary (no transcript capture/AI summary, decisions are not an
      approval workflow, no memory promotion).
- [x] Files/assets — upload, download, delete with real validation,
      checksums, and signed URLs on a dev-grade local storage backend
      (see `docs/specs/files-and-assets.md`, ADR-005). Virus/malware
      scanning is the one explicitly unbuilt piece.
- [x] Notifications (Section 30) — in-app notification center
      (severity/category/client/resource/action/read-acknowledged
      state), a real fan-out (`notifyClientWriters`) wired into approval
      requests (QC-aware severity), failed content-calendar publishes,
      and a new hourly worker escalation job for overdue tasks/projects/
      content. Explicit scope boundary in `docs/specs/notifications.md`:
      payment-risk and integration-degradation escalation triggers need
      modules that don't exist yet (real invoicing, Phase 4 connectors);
      email/push channels are adapters for later, not built.
- [x] Global search / command palette (Section 28.2) — `⌘K`/`Ctrl+K`
      overlay finding Clients/Projects/Campaigns/Creatives/Content
      Calendar items/Shoots by name, scoped through the same
      `getReadableClientIds` isolation the Section 12 calendar uses. A
      follow-up slice added `Task` as a 7th searchable entity type — the
      original slice predates Task priority/comments/attachments/
      dependencies, and a core, high-frequency record with a real
      `title` field being unsearchable was a real gap, not a deliberate
      decision; a task result links to its own project's detail page,
      the same pattern `content`/`shoot` results already used (neither
      has a standalone per-item URL). `Invoice` stays deliberately out
      of scope — no free-text field exists to match against, so adding
      it would mean inventing a search key nobody asked for. Explicit
      scope boundary in `docs/specs/search.md`: this is "find records,"
      not Section 28.2's paired "initiate permitted actions" — that
      belongs with Cedar Command Center, not a second parallel
      command-execution path. Verified live: searched for a real seeded
      task's title through the actual `⌘K` palette in a headless
      browser, confirmed the "Task" badge rendered and selecting it
      navigated to the task's real project page. A second follow-up
      slice (same day the Meetings module below shipped) added `Meeting`
      as an 8th entity type for the identical reason `Task` needed one —
      a real `title` field, unsearchable. `Meeting` scopes differently
      from every other entity here: it carries `organizationId` directly
      (an internal meeting has no client at all), so a scoped reader
      only matches a meeting tied to one of their readable clients,
      excluding internal/clientless meetings entirely (mirroring
      `listMeetingsForOrganization`'s own identical rule) — an org-wide
      reader matches every meeting, internal ones included. 9
      integration tests (up from 7), 5 route-contract tests (up from 4).
      Verified live: searched for a real meeting through the `⌘K`
      palette, confirmed the "Meeting" badge and correct subtitle
      (client name, or "Internal meeting") rendered, and confirmed
      selecting it navigated to the real meeting detail page.
- [x] Activity timeline (`ClientTimelineEvent`) now gets real writes from
      Brand DNA saves, project creation, campaign creation, asset
      uploads, creative approvals, task creation/completion, and invoice
      creation/sending/payment. Invoices also gained their first real
      write path (`invoice-service.ts`'s `createInvoice`/`sendInvoice`/
      `markInvoicePaid`, gated on `finance:write`) — previously
      seed-only, like `Expense` before `createExpense`. See
      `docs/specs/activity-timeline.md` for the exact scope boundary:
      automatic `OVERDUE` status transition isn't built (overdue is
      already computed on the fly everywhere it's needed; storing it too
      would create a second source of truth), and only task *completion*
      (not every status flip) is timeline-worthy.

## Phase 2 — Creative and Approval Operations: **complete**

Deliverable: brief-to-client-approval lifecycle is operational.

- [x] Campaigns, Creatives, versioning, and the full approval state
      machine (requested → changes_requested/approved/canceled, with a
      new version superseding whatever the previous one's state was) —
      see `docs/specs/approvals.md`. A version can link to an uploaded
      file from the Files module.
- [x] Content Calendar (planning/scheduling, distinct from the Section 12
      due-date calendar) — `ContentCalendarItem` (client/channel/campaign/
      pillar/format/owner/status/dueDate/publishAt, optional link to a
      `Creative` for its own approval history), a 7-state workflow
      enforced server-side (BRIEF → DRAFT → INTERNAL_REVIEW →
      CLIENT_APPROVAL → SCHEDULED → PUBLISHED, plus FAILED with a
      required reason and retry), a per-client planning page at
      `/clients/[id]/content`, and due/publish dates now feed into the
      Section 12 unified `/calendar` as `content_due`/`content_publish`
      events. `PUBLISHED` means "the plan says this went out," not a real
      connector call — see `docs/specs/content-calendar.md` for the exact
      scope boundary (actual publish execution is Phase 4).
- [x] Video/production workflows (Section 11) — `VideoBrief`/
      `VideoBriefVersion` (versioned concept/hook/storyboard/script/
      voiceover/caption/edit-instruction/music-note/platform-variant
      planning, 1:1 with a `Creative`) and `Shoot` (schedule/location/
      crew/equipment/permits/call sheet/shot list/product list/
      references/status for Section 11.2 photography/production). Video
      brief editor lives on the Creative detail page (video-type
      creatives only); `/clients/[id]/shoots` covers scheduling. The
      final video file's approval/publishing still goes through the
      existing Creative/CreativeVersion/Approval pipeline rather than a
      parallel one. Explicit scope boundary (see
      `docs/specs/video-and-production.md`): Section 11's *AI* assistance
      (shot-list generation, angle ideas, schedule suggestions) is not
      built — this is the data model/workflow a human plans against.
- [x] Client Portal (Section 15.2) — `/portal` + `/portal/[clientId]`
      curated view (pending approvals with a decide action, approved
      history, invoices, files); a `CLIENT_PORTAL` membership has zero
      org-wide permissions, all access comes from `ScopedGrant`s
      auto-created on invitation acceptance; a new narrow
      `approvals:decide` permission (OR'd with `clients:write` via
      `requireAnyPermission`) lets a portal contact record their own
      decision, always attributed to their own authenticated identity —
      `Approval.decidedBy` free text from a portal contact is discarded
      server-side, never trusted. See `docs/specs/client-portal.md`.
- [x] Quality Control (Section 5/6.1/7: brand consistency, spelling/
      language, required information, dimensions/specifications before
      client review) — runs automatically inside `requestApproval`:
      prohibited-language scan and required-disclaimer presence check
      against two new Brand DNA fields (`prohibitedLanguage`,
      `requiredDisclaimers`), plus an image aspect-ratio check against a
      static per-platform spec table (via `sharp`). Advisory, not a hard
      gate — a FAIL is stored and rendered prominently on the Creative
      detail page but never blocks the approval request, matching
      Section 5's "before client review" as a visibility requirement.
      Explicit scope boundary (see `docs/specs/quality-control.md`):
      every check is a deterministic rule check, not an LLM judgment
      call — no AI Foundation wiring exists yet for a genuine "does this
      feel on-brand" assessment (Phase 3+).

## Phase 3 — AI Foundation and Command Center: **thin slice exists**

- [x] Cedar Command Center UI + a naive keyword-based agent router +
      direct Anthropic API call (or deterministic stub) — see ADR-007 for
      exactly how far this is from the Bible's full orchestration
      lifecycle (no evaluation of the live model call's actual output,
      no cost governance beyond what AI Supervisor now tracks).
- [x] Cedar Brain per-agent output breakdown (Section 4/6.1) — the
      Command Center's response always carried a `plan[]` array (one
      entry per routed agent), but live mode set every entry's output
      to `null` and the UI never rendered `plan[]` at all. Fixed with
      one Anthropic call per request (unchanged — see below for why not
      one call per agent) whose system prompt now asks for labeled
      per-agent sections, parsed into real `plan[]` entries; the
      Command Center UI now renders that breakdown. A real
      per-agent-specialization design (separate API calls per agent,
      each with a specialist prompt) was considered and explicitly
      rejected for now: Section 33's budget/cost-governance mechanism
      doesn't exist yet, so multiplying real API spend per request with
      no safety net would be introducing financial risk the Bible says
      needs governance first, not silently accepted. See
      `docs/specs/cedar-brain-per-agent-output.md`.
- [x] Governed context retrieval (Section 6.1) — Command Center's client
      picker (scoped to what the actor can read) triggers a real
      structured-query retrieval (`buildGovernedContext`) of that
      client's Brand DNA, Client Health Score, and recent timeline
      events, authorized *before* any data is touched and injected into
      the model's system prompt with an explicit "don't invent facts
      beyond this" instruction. The real sources retrieved are shown
      back to the user, not hidden inside the model call. Explicit scope
      boundary in `docs/specs/governed-context-retrieval.md`: structured
      queries only, no semantic/vector retrieval (ADR-008 defers that —
      no unstructured content exists yet to index), no cross-client or
      knowledge-layer retrieval.
- [x] AI Supervisor telemetry (Section 6.3) — every Cedar Brain request
      (success or failure — previously only successes were logged, a
      real gap this slice fixed) now records real mode, model name, a
      manually-bumped prompt version constant, measured latency,
      success/error outcome, and actual input/output token counts from
      the Anthropic response. `/command/supervisor` (new `ai:supervise`
      permission) surfaces real aggregates — success rate, average
      latency, live/stub split, token totals, recent failures, and
      user-flagged-incorrect responses (a real "Flag as incorrect"
      button on the Command Center, satisfying Section 6.3's "user
      corrections" signal). Explicit scope boundary in
      `docs/specs/ai-supervisor.md`: no retry/tool-failure counts (no
      retry logic or tool-calling exists to count), no cost-threshold
      alerting yet — token counts stand in for "cost" rather than a
      computed dollar figure that would need a hardcoded,
      staleness-prone price.
- [x] AI Evaluation Harness (Section 6.3/33) — a real, deterministic
      regression suite for Cedar Brain's routing logic
      (`routeToAgents`), the one fully-deterministic, non-flaky part of
      Cedar Brain's orchestration (evaluating the live model call's
      actual output would need a rubric-based LLM-judge harness — a
      materially bigger, separately-scoped undertaking, explicitly
      deferred, not silently skipped). A 10-case golden set, run on
      demand from `/command/supervisor` ("Run eval now"), persisted as
      `AiEvalRun`/`AiEvalResult` rows. Building the golden set —
      verifying every case against real output before trusting it,
      rather than hand-deriving expectations from the same code being
      tested — found and fixed a real bug: `routeToAgents` used plain
      substring matching, so `"script"` matched inside
      `"de-SCRIPT-ion"` and `"ad"` matched inside `"already"`/
      `"administrator"`, both common words in real agency request text.
      Fixed with word-boundary regex matching. See
      `docs/specs/ai-eval-harness.md` for the full "why routing, not
      live-response quality" reasoning and what's explicitly deferred
      (a live-response LLM-judge harness; scheduled/CI-triggered runs —
      today it's on-demand only).
- [x] AI Budget Governance (Section 33) — the specific mechanism the
      per-agent-output slice cited as missing. A real, enforced monthly
      token budget: `AiBudget` (one row per organization, created only
      when an owner/admin explicitly sets one — no default is ever
      fabricated), `getAiBudgetStatus` computing real usage from
      `CedarBrainRequest` for the current calendar month, and
      enforcement in `/api/cedar-brain/route.ts` that rejects a live
      call with 402 *before* any real API spend once the organization
      is over budget (stub mode is never blocked, since it costs
      nothing either way). `alertIfOverBudget` closes the actual
      "cost-threshold alerting" gap `ai-supervisor.md` had flagged as
      missing — a deduplicated notification (once per 24h) to every
      `ai:supervise` holder. A new "AI budget" card on
      `/command/supervisor` shows usage vs. limit and lets an
      `organization:manage` holder set or clear it. Verified live
      against the seeded dev database: set a real 5,000-token budget,
      inserted a real 5,500-token live-mode request, confirmed the page
      showed the exact over-budget arithmetic. See
      `docs/specs/ai-budget-governance.md`, including why this closes
      the *blocker* the per-agent-fan-out decision cited, without
      itself reopening that decision — true per-agent specialization
      remains its own separate, not-yet-started slice.
- [x] Cedar Prompt Version Registry (Section 33) — the other item
      ADR-007's "what this ADR will need to decide" list had named.
      Rejected the obvious reading (an admin-editable live prompt) as a
      real multi-tenancy bug: any org's admin editing a system-wide
      shared prompt would silently change Cedar Brain's behavior for
      every other organization on the deployment. Built instead: an
      auto-captured, read-only `CedarPromptSnapshot` audit trail. The
      static instructional text was extracted from `callCedarBrain`
      into its own named `SYSTEM_PROMPT_TEMPLATE` export (a real prompt
      content change, so `CEDAR_BRAIN_PROMPT_VERSION` bumped v3 → v4
      per the file's own convention); `ensurePromptSnapshotRecorded`
      captures the real text the first time each version is used
      (idempotent — one DB round-trip per version per server process).
      A new "Prompt version history" card on `/command/supervisor`
      shows every captured version with its real text on expand.
      Verified live against the seeded dev database with a direct-SQL
      cross-check: sent a real request, confirmed a `v4` row existed
      with the real template text, confirmed the page rendered it. See
      `docs/specs/cedar-prompt-registry.md`.
- [x] Model Catalog and Routing Policy (Section 33) — the last item
      ADR-007's "what this ADR will need to decide" list had named: "a
      real model catalog ... the model-catalog half does not [exist]."
      A small, static `MODEL_CATALOG`
      (`apps/web/src/lib/model-catalog.ts`) of 3 real Anthropic model
      ids, one per tier (`claude-haiku-4-5-20251001` fast,
      `claude-sonnet-5` standard, `claude-opus-5` premium), and
      `selectModelForRequest()`, a deterministic function of how many
      agents `routeToAgents()` matched (≤2 → fast, 3 → standard, ≥4 →
      premium) — the only real, already-computed complexity signal
      Cedar Brain has today. `callCedarBrain()`'s live Anthropic call
      now uses the selected model's real id instead of a hardcoded
      `"claude-sonnet-5"` literal, and returns a new `modelId` field in
      *both* its stub and live return shapes, so stub-mode requests
      (every request in any environment with no `ANTHROPIC_API_KEY`,
      including this sandbox) no longer discard which model would have
      been used. `/api/cedar-brain/route.ts`'s two hardcoded
      `"claude-sonnet-5"` literals (success and failure paths) were
      replaced with the real selection. Explicit, stated-honestly scope
      boundary in `docs/specs/model-catalog.md`: breadth of routing is
      a real proxy for request complexity, not the live-response
      *quality* evaluation Section 33's own wording asks for — that
      needs a rubric-based LLM-judge harness, which
      `docs/specs/ai-eval-harness.md` documents as not built. Also not
      multi-provider, and does not change budget accounting (still raw
      token totals regardless of tier — per-model dollar-cost
      governance remains open). `/command/supervisor` gained a "Model
      routing policy" card: all 3 catalog entries, plus a real
      `groupBy` aggregate breakdown of actual per-model usage for the
      organization (historical pre-catalog rows shown in an honestly
      labeled "not recorded (pre-catalog)" bucket, never backfilled).
      12 new tests (8 in the new `model-catalog.test.ts`, 2 in
      `cedar-brain.test.ts`, 2 in the route-contract suite) — full
      `apps/web` suite 512/512 across 83 files. Verified live against
      the seeded dev database: sent a 2-agent prompt through the API
      (recorded `claude-haiku-4-5-20251001`) and a 5-agent prompt
      through the real Command Center UI (recorded `claude-opus-5`),
      confirmed both via direct `psql`, and confirmed
      `/command/supervisor`'s new card rendered the real breakdown via
      a headless-Chromium screenshot. See `docs/specs/model-catalog.md`.
- [ ] AI Gateway, semantic/vector retrieval, live-response evaluation
      scoring, true per-agent specialization (a separate Anthropic call
      per routed agent, each with its own specialist prompt) — not
      started. What *is* built: real per-agent output structure within
      the existing single call
      (`docs/specs/cedar-brain-per-agent-output.md`), the budget
      mechanism a future per-agent-fan-out slice would rely on
      (`docs/specs/ai-budget-governance.md`), the prompt version
      registry, and the model catalog/routing policy above.

## Phase 4 — Integrations and Publishing: **starter slice exists**

- [x] Connector SDK (`packages/connectors`) — the Section 34
      `ConnectorAdapter` contract (authorize/refresh/healthCheck/sync/
      handleWebhook/execute/reconcile/revoke), plus one real, fully
      working implementation: `GenericWebhookAdapter`, a signed
      provider-agnostic inbound webhook receiver needing no third-party
      OAuth account. Integration Center (`/integrations`, gated on
      `organization:manage`) — a real connection dashboard with
      status/health/event-count, a create flow that reveals a one-time
      signing secret, and a revoke action. The public webhook endpoint
      verifies an HMAC-SHA256 signature and deduplicates replayed
      events by idempotency key (Section 17.1) — proven end-to-end in
      this slice's own smoke test with a `curl` request signed via
      `openssl`, not just unit-tested in isolation. Explicit scope
      boundary in `docs/specs/integration-center.md`: Meta/TikTok/
      Google/WhatsApp adapters (Section 17.2) are not built — they need
      real OAuth app registrations and credentials this environment
      cannot obtain; `refresh`/`sync`/`execute`/`reconcile` are
      legitimately not-applicable for *this* push-only connector
      (documented per-method), not silently stubbed.
- [ ] Priority provider adapters (Meta/TikTok/Google/WhatsApp) — blocked
      on real OAuth credentials. Sync/reconciliation for a pull-based
      provider, publishing jobs, troubleshooting knowledge base — not
      started.

## Phase 5 — Finance and Executive Intelligence: **complete except one deferred item**

`Invoice`/`Expense`/`ClientHealthScore` models exist and the CEO Dashboard
(`/dashboard`, gated on `finance:read`) computes real aggregates from
them.

- [x] Client Health Score (Section 4.2) — a real daily worker job now
      computes an explainable score from real signals (overdue tasks/
      projects, overdue unpaid invoices, approval latency, Quality
      Control failure rate), replacing the seeded/manual number; the
      client profile page shows the full factor breakdown, not just the
      score. Explicit scope boundary in `docs/specs/client-health.md`:
      campaign trends, communication gaps, satisfaction signals, and
      renewal proximity (also named in Section 4.2) need modules that
      don't exist yet and are never faked.
- [x] Client-level profitability attribution (Section 4.2/16) — new
      `Expense.clientId` (optional) plus a first real write path
      (`createExpense`, gated on `finance:write`) makes cost
      attribution real, paired with `Invoice.clientId` (already
      existed) for revenue. CEO Dashboard gained a per-client
      revenue/cost/profit/margin table; client profile page gained an
      Expenses card.
- [x] Project-level profitability attribution (Section 4.2/16 Phase 5)
      — new `Invoice.projectId`/`Expense.projectId` (both optional FKs
      to `Project`), validated by both write paths against the given
      `clientId` (not just the organization) so a project can't be
      mis-tagged to another client's project. New
      `getProjectProfitability(clientId)` breaks down revenue/cost/
      profit/margin by project within a client, with an "unassigned"
      bucket for untagged invoices/expenses — mirrors the client-level
      unattributed-overhead pattern one level down. UI: the invoice/
      expense forms gained an optional project picker (4 call sites);
      the project detail page gained a real Profitability card. Also
      fixed a real unbounded `expense.findMany` found while touching
      `profitability-service.ts`, converted to `groupBy`/`aggregate`
      matching the invoice side's existing pattern. Explicit scope
      boundary in `docs/specs/profitability.md`: campaign/service-level
      attribution (Phase 5's own wording) still needs a billable
      line-item model and reconciled campaign spend, neither of which
      exist — deferred with reasons given, not faked.
- [x] Opportunity Engine (Section 4.2) — `getOpportunitiesForClient`
      surfaces evidence-backed service and creative-format gaps: a
      service or creative format used by 2+ other distinct clients in
      the organization but absent from this one, each with a literal
      evidence count, never a prediction. Rendered on the client
      profile page as an "Opportunities" card, gap-free clients show no
      card. Explicit scope boundary in
      `docs/specs/opportunity-engine.md`: intent signals, market/
      industry benchmarking, and trend-based or AI-generated
      opportunities need modules or data sources that don't exist yet
      and are never faked.
- [x] Governed metrics catalog (Section 29) — new `packages/metrics`
      package: shared pure functions for every metric formula complex
      enough to risk drift (client margin, all five Client Health Score
      penalty formulas), now the single real definition imported by
      both `apps/web`'s profitability service and `apps/worker`'s
      health-score job (previously duplicated inline in each). A new
      `/metrics` page documents every catalogued metric's formula,
      unit, and source. Explicit scope boundary in
      `docs/specs/metrics-catalog.md`: revenue/expense sums are
      catalogued but not function-governed (a one-line aggregation
      query isn't worth the `@cedar/db` coupling a shared function
      would need); ROAS, CPA, and utilization have no entry at all —
      no connector or time-tracking data exists yet to compute them
      from, and a definition for a number that doesn't exist would be
      fabrication.
- [x] AI Business Advisor (Section 16.2) — `getBusinessAdvisorBriefing`
      combines six real signals into one CEO Dashboard briefing:
      unprofitable engagements, cost leakage by expense category, strong
      services (correlated with actually-profitable clients), team
      capacity risks (open/overdue task load per member), collection
      risks (overdue unpaid invoices), and an org-wide rollup of
      Opportunity Engine gaps. An optional AI narrative
      (`generateBusinessAdvisorNarrative`, same live/stub pattern as
      Cedar Command Center) restates the data in prose when
      `ANTHROPIC_API_KEY` is set, under an explicit instruction never to
      add a number or claim beyond what was computed; the underlying
      lists always render regardless, so nothing is unverifiable.
      Explicit scope boundary in `docs/specs/business-advisor.md`:
      capacity risk is a coarse task-count proxy (no time-tracking/
      effort model exists), cost leakage identifies the largest category
      but not root cause, and no signal here uses trend data.
- [x] Campaign-level profitability attribution (Section 4.2/16 Phase 5)
      — new `Expense.campaignId` (optional FK to `Campaign`), validated
      by `createExpense` against the given `projectId` (not just the
      organization), mirroring the project-belongs-to-client check one
      level deeper. Deliberately cost-only, no `Invoice.campaignId`:
      this agency invoices at the project/retainer level, not per
      campaign, so there is no campaign-level revenue to attribute —
      confirmed by checking how `Campaign.budgetCents` is used before
      building anything. New `getCampaignProfitability(projectId)`
      compares each campaign's real actual spend against
      `Campaign.budgetCents`'s pre-existing manual estimate (the
      "reconciled actual spend" this bullet used to name as missing),
      reporting the difference as a variance, `null` when no budget was
      ever set — with an "unassigned" bucket for project-level expenses
      not tagged to any specific campaign. UI: `AddExpenseForm` gained
      an optional campaign picker, shown only once a project is chosen
      and scoped to that project's own campaigns; the campaign detail
      page gained a real Profitability card (budget/actual spend/
      variance). Verified live: created a real expense against the
      seeded "FastCharge 65W Launch" campaign via the running server's
      API, cross-checked in Postgres, and drove a real headless browser
      to confirm the campaign detail page's Profitability card and the
      expense form's campaign picker both render correctly with no
      layout issues; all inserted rows cleaned up afterward. Explicit
      scope boundary in `docs/specs/profitability.md`: service-level
      attribution still needs a billable line-item model on invoices,
      `Client.services` today is just a tag list — deferred with
      reasons given, not faked.

Phase 5's concretely buildable scope is now complete.

## Phase 6 — Advanced Intelligence: **starter slice exists**

- [x] Client Memory (Section 6.6) — `getRecentCedarBrainActivityForClient`
      is the first thing that reads `CedarBrainRequest` history back
      (previously "nothing reads it back yet," per this file's own
      prior wording and ADR-007). A client's past successful Cedar
      Brain answers now feed into governed context retrieval for that
      client's next request, and a "Cedar Brain Activity" card on
      the client profile page shows the real history (including
      failures, for human visibility). A follow-up slice closed this
      module's own explicitly-named next increment: a prior answer a
      human reviewer already flagged incorrect (Section 6.3's AI
      Supervisor) is now excluded from the model-facing context too,
      not just failed requests — respecting a human's explicit signal
      without the system forming any judgment of its own. The client
      profile card gained a matching "flagged incorrect" badge.
      Verified live: flagged a real Cedar Brain request through the
      running server, confirmed a subsequent request's `contextSources`
      correctly omitted it even though it had succeeded and had real
      content. See `docs/specs/client-memory.md` for exactly why this
      is real Client Memory and explicitly not yet Agency Memory: no
      curation, no cross-client pattern extraction, no outcome
      measurement — one client's own history, read back verbatim,
      filtered only by what a human already said about it.
- [ ] Agency Memory, Success Library, Knowledge Graph query layer, Cedar
      Decision Engine, Cedar Intelligence, Living/Market Intelligence,
      Digital Twin, Innovation Lab, Experience Engine — not started;
      each needs curation/outcome-measurement/cross-client
      infrastructure this slice deliberately didn't invent.

## Phase 7 — Scale Hardening: started

Load/performance testing toward 100 employees/500 clients, data
lifecycle, advanced recovery, connector scaling, media pipeline
optimization, security review, disaster recovery exercises, operational
SLOs.

- [x] **CEO Dashboard aggregate queries.** The dashboard's four
      organization-wide numbers (revenue, outstanding, expenses, active
      vs. total clients) were computed by fetching *every* client,
      invoice, and expense row the organization has ever created into
      Node and reducing over them in JavaScript — a full-table scan on
      every single dashboard load, growing without bound as the
      organization accumulates history. Replaced with `prisma.count()`
      and `prisma.aggregate({ _sum })` calls, which push the same
      computation into Postgres and return only the four numbers
      needed. Verified byte-identical output against the pre-existing
      seed data via direct SQL cross-check (see
      `docs/specs/dashboard-aggregates.md`). Also found and fixed a
      real pre-existing cross-tenant bug while touching this code: the
      "Pending approvals" stat's `prisma.creative.count()` had no
      organization scoping at all, so it counted `PENDING_APPROVAL`
      creatives across *every organization in the database*, not just
      the current one — confirmed as a real leak (not just theoretical)
      because the dev database has two organizations. Now scoped
      through `campaign.project.client.organizationId`. See
      `docs/specs/dashboard-aggregates.md` for full detail, including
      what this slice explicitly did *not* fix (deferred, not
      forgotten): the client-detail page's six unbounded nested lists,
      the Opportunity Engine's full-organization creative scan, the
      clients list page, the content calendar, the Client Portal, the
      shoots page, and several asset-picker dropdowns — each a real,
      separately-scoped follow-up, ranked in that doc by the audit that
      found them.
- [x] **Client detail page pagination.** The highest-ranked item from
      that same audit: the client detail page's single query nested six
      unbounded relations (`projects`, `invoices`, `expenses`, `notes`,
      `timelineEvents`, `assets`), plus fetched full `campaigns`/`tasks`
      rows per project just to display their counts. Added a real
      pagination service (`client-relations-service.ts`, offset
      pagination, page size 20) backing six new "View all" pages
      (`/clients/[id]/{invoices,expenses,notes,timeline,files,projects}`);
      the overview page now bounds each relation to 10 most-recent rows
      via `take` + `_count` and only shows a "View all" link when
      there's actually more. Campaign/task counts switched to
      `_count.select` instead of fetching full arrays. Verified against
      real Postgres with 9 new integration tests plus a live smoke test
      that inserted 27 real invoice rows for the seeded demo client and
      confirmed page 1/page 2 split exactly 20/7 with zero overlap and
      correctly-disabled boundary links — see
      `docs/specs/client-relations-pagination.md`, including what's
      still open (Opportunity Engine, clients list, content calendar,
      Client Portal, shoots page, asset pickers — unchanged by this
      slice).
- [x] **Opportunity Engine full-organization creative scan.** The
      creative-format-gap signal fetched every creative row for every
      other client in the organization on every client detail page
      load, just to count distinct peer clients per format in
      JavaScript. Own-format history had the same shape. Rewrote the
      peer-format count as a single Postgres `GROUP BY` via
      `prisma.$queryRaw` (parameterized, no injection surface) and the
      own-format query to `distinct: ["type"]` — same output, but data
      transfer now scales with the number of distinct format values in
      use (a handful) instead of the organization's entire creative
      history. All 5 existing tests (including the one proving distinct
      peer *clients*, not distinct creatives, are counted) passed
      unchanged against the rewrite; added 1 new test exercising
      multiple peers across multiple formats in one call. Verified live
      against the seeded dev database with a direct-SQL cross-check —
      see `docs/specs/opportunity-engine-scaling.md`, including why the
      service-gap signal (a JSON-string `services` column, not `jsonb`)
      was deliberately left as-is rather than force-fit into SQL.
- [x] **Clients list page pagination.** The org-wide clients list
      fetched every readable client on every load — unbounded against
      the Bible's own 500-client scale target — plus fully included
      `projects` and `brandProfile` just to display a count and a
      truthiness check. Added the same `PAGE_SIZE=24` offset pagination
      shape used by the client detail page slice (same shared
      `Pagination` component), switched to `_count.select` for the
      project count and a `select`-scoped `brandProfile: { id: true }`
      instead of the full record. Section 38's scoped-collaborator
      filter is unchanged and still applied inside the same `where`.
      Verified live against the seeded dev database: inserted 30
      temporary clients (31 total), confirmed page 1/page 2 split
      exactly 24/7 with correct boundary links, cross-checked against
      `select count(*)` — see `docs/specs/clients-list-pagination.md`.
- [x] **Content Calendar pagination.** The per-client content calendar
      table fetched every scheduling item a client has ever had,
      unbounded across months and years of ongoing content production.
      Same `PAGE_SIZE=20` offset pagination shape as the two prior
      list-pagination slices. The New Content Item form's
      campaign/creative/member dropdowns are deliberately left
      unbounded — they're the audit's separate "asset-picker dropdowns"
      item, needing a real search-as-you-type redesign rather than a
      one-line pagination change, so folding them in here would have
      been scope creep. Verified live against the seeded dev database:
      inserted 25 temporary items, confirmed page 1/page 2 split
      exactly 20/5 — see `docs/specs/content-calendar-pagination.md`.
- [x] **Client Portal pagination.** The audit's own highest-flagged
      customer-visible-latency item: the external-facing Client Portal
      fetched every pending-or-approved creative, every invoice, and
      every available asset for a client on every load. Approved
      history, invoices, and files each got the bounded-preview +
      "View all" page pattern (three new pages, `PAGE_SIZE=20`);
      "Pending your review" got a defensive `take` cap instead of a
      "view all" page, since it's a work queue meant to reach zero, not
      a growing archive — building pagination UI for a backlog that
      shouldn't exist would have been solving the wrong problem. Every
      new page independently re-checks `clients:read` rather than
      trusting the parent page. Verified live against the seeded dev
      database: inserted 15 approved creatives / 15 invoices / 15
      assets, confirmed correct "View all" counts, then pushed invoices
      to 22 total and confirmed the new invoices page split exactly
      20/2 — see `docs/specs/client-portal-pagination.md`.
- [x] **Shoots page pagination.** The per-client production shoots list
      fetched every shoot ever scheduled, unbounded — same shape as the
      content calendar fix. Same `PAGE_SIZE=20` pattern. Verified live
      against the seeded dev database: inserted 24 temporary shoots,
      confirmed page 1/page 2 split exactly 20/4 — see
      `docs/specs/shoots-pagination.md`.
- [x] **Search-as-you-type asset picker.** The last remaining ranked
      item from the Phase 7 audit — the one item that explicitly needed
      a real UX redesign, not a pagination change. The "Add new
      version" form's asset dropdown loaded every one of a client's
      files into a plain `<select>`; replaced with a real
      search-as-you-type picker (`searchClientAssets()`, a bounded
      10-result `filename contains` search; `GET
      /api/clients/[id]/assets/search`; a new `AssetPicker.tsx`
      component with debounced fetch and click-to-select). The page's
      unbounded `findMany` was removed entirely rather than merely
      bounded — a picker fetches on demand, so there's no preview list
      to maintain at all. Verified with 5 new route-contract tests plus
      a live smoke test at both the HTTP and real-browser level
      (Playwright): typed "hero" into the actual picker on a real
      creative's page, confirmed the dropdown showed exactly the
      matching file, clicked it, confirmed the UI updated — see
      `docs/specs/asset-picker-search.md`, including why this is
      representative (the one asset picker in the app) rather than an
      exhaustive sweep for every possible unbounded dropdown. **This
      closes every ranked item from the Phase 7 scale-hardening audit.**

## Cross-cutting gaps worth tracking regardless of phase

- **Integration tests exist for Identity & Access** (`apps/web/src/lib/services/identity.integration.test.ts`,
  8 tests against a real dedicated Postgres database — bootstrap, login,
  full invite→accept→scope-grant flow, last-owner protection).
- **A real browser-driven E2E layer now exists** (Bible Section 32's
  "End-to-end" row) — `tests/e2e/` (Playwright/Chromium): login →
  protected page → logout; the fuller invite → accept → real
  RBAC-scoped session flow; Section 15.1's approval workflow (create a
  creative → request approval → record a real decision, asserting the
  status badge itself transitions DRAFT → PENDING_APPROVAL → APPROVED);
  Section 15.2's Client Portal (an invited external contact's session
  is redirected away from the internal app on *every* direct navigation
  attempt, not just at first login); and Section 23.1's MFA (enrolls a
  real TOTP secret via `/security`, computes a valid code with `otplib`
  against the secret the page displays, then proves via a real logout/
  login that the account is actually challenged on its next login, not
  just that enrollment succeeded); and Section 9's Content Calendar
  (creates a content item and moves it through two real, server-
  validated transitions, BRIEF → DRAFT → INTERNAL_REVIEW). All navigate
  by real link text so they survive a fresh `db:reset` generating new
  ids every run. Run via `npm run test:e2e` against a production build
  with the dev database reset to a known seeded state first. See
  `tests/e2e/README.md` for a real dev-server-only flakiness finding
  this work surfaced (fixed by building/starting, not `next dev`) —
  every flow originally named as a gap here now has coverage; what's
  left is depth (more permutations), not breadth.
- **API-contract tests now exist for every route handler in the app**
  (`apps/web/src/app/api/**/*.route.contract.test.ts`, 165 tests
  across all 40 routes, up from an initial 6) — the HTTP layer
  itself (auth gate, status codes, JSON envelope), not just the
  service functions underneath, which were already integration-tested.
  See `docs/specs/api-route-contracts.md` for exactly which routes and
  why. The first batch found and fixed two real bugs: `/api/expenses`
  and `/api/invoices` both misreported `amountCents: 0` as "missing"
  instead of reaching the real "must be a positive number" validation,
  because their pre-checks used a truthy check instead of a type
  check. A second slice added `/api/auth/login` (the one route that
  creates the session itself, so it mocks `next/headers` rather than
  `getCurrentActor`), the three notification routes (ownership gated
  per-membership rather than by role permission), and the
  content-calendar/shoot status-transition routes. A third slice
  added the four MFA routes (real `otplib`-generated TOTP codes
  against a real encrypted secret, not a stub), `/api/invite/[token]/accept`
  (the other no-session route, verified with a live end-to-end
  invite→accept smoke test), and `/api/search` (proving
  `getReadableClientIds` actually filters results for a scoped
  collaborator, not just gates access). A fourth slice added the nine
  `clients:write`-gated CRUD create routes (campaign, creative,
  creative version, video brief, project, task, shoot, content item,
  brand version) — surfacing a real pattern worth documenting: every
  one of these services checks `requirePermission` *before* verifying
  the parent id belongs to the caller's org, so a cross-org id from an
  `OWNER` (whose role check never touches the database) is caught by
  the second check and returns 400, not 403 — plus the three routes
  that write to real file storage (`/api/clients/[id]/assets`,
  `/api/assets/[id]` delete, `/api/assets/[id]/download`, reusing the
  `process.cwd()`-monkeypatch trick from
  `asset-service.integration.test.ts` to stay hermetic) and the one
  `organization:manage`-gated pair
  (`/api/integrations/connections`/`/revoke`, distinct from
  `clients:write` everywhere else). Verified live end-to-end: created a
  real project→campaign→creative→version chain, uploaded and confirmed
  a real file on disk, created and revoked a real connection, all
  cross-checked via SQL and fully cleaned up afterward. A fifth and
  final slice closed the last four routes: `/api/auth/bootstrap` (the
  third no-session route, gated on an entirely-empty `organizations`
  table rather than a token — its own test wipes to a genuinely empty
  database rather than seeding one), `/api/cedar-brain/[id]/flag` (the
  one write route gated by nothing more than active membership — no
  `clients:write`, no `organization:manage`), and
  `/api/invoices/[id]/send`/`/mark-paid` (the last two state-machine
  transitions, `DRAFT → SENT → PAID`). Verified live: rejected a real
  bootstrap attempt against the non-empty dev database with the
  correct message, sent and marked a real invoice paid, triggered and
  flagged a real (stub-mode) Cedar Brain request — cross-checked via
  SQL and cleaned up. **API route-contract coverage is now complete:
  40 of 40 routes.**
- **Known residual dependency vulnerability:** Next.js's own bundled
  PostCSS carries a moderate/high-severity advisory range that only
  resolves by upgrading to Next 16, which currently fails to build in
  this npm-workspaces layout for reasons unrelated to our code (see
  ADR-001). Accepted as low real-world risk (build-time only, no
  untrusted CSS input) — revisit when a Next 16 patch fixes the build
  issue upstream.

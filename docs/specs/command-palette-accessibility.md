# Command Palette: keyboard and semantic accessibility

Bible reference: Section 39 (Non-Functional Requirements) — "Keyboard and
semantic accessibility are part of definition of done for core UI."

## Why this component, and why not an app-wide audit

Section 39's requirement is written generically across "core UI," but a
literal app-wide accessibility audit and remediation is a large,
unbounded body of work — every page, every form, every interactive
element — not a single well-scoped slice. This closes the requirement
for one representative component instead: the Command Palette
(`apps/web/src/app/(app)/CommandPalette.tsx`, Cmd/Ctrl+K), the single
most keyboard-driven interaction in the entire app. Before this slice,
Section 39 had never been referenced anywhere in this project's history —
a real, previously-unaudited gap, confirmed by grepping `ROADMAP.md` for
"accessib"/"aria"/"keyboard" and finding nothing.

This is deliberately a representative fix, not a claim that the rest of
the app is now accessible — see Scope below.

## What was actually broken

Before this slice, the palette was keyboard-operable in the loose sense
(arrow keys worked, Escape closed it) but had no real semantic structure:

- The overlay had no `role="dialog"`/`aria-modal`/`aria-label` — a screen
  reader had no way to know a dialog opened at all.
- No focus trap — pressing Tab moved focus onto elements in the page
  *behind* the still-open overlay (which remains in the DOM and tabbable),
  since nothing intercepted Tab to keep it inside the dialog.
- No focus restoration — closing the dialog (Escape or selecting a
  result) never returned focus to the "Search…" button that opened it,
  so a keyboard-only user's focus would drop to an unpredictable place
  (often `<body>`), forcing them to re-navigate from the top of the page.
- The input/results had no combobox/listbox ARIA pattern — no
  `role="combobox"`, no `aria-expanded`/`aria-controls` on the input, no
  `role="listbox"`/`role="option"`/`aria-selected` on the results, no
  `aria-activedescendant` linking the two. The visual highlight moving
  with arrow keys had no assistive-technology-visible equivalent at all.

## What's fixed

- Trigger button: `aria-haspopup="dialog"`, `aria-expanded`.
- Dialog: `role="dialog"`, `aria-modal="true"`, `aria-label="Search"`.
- Input: `role="combobox"`, `aria-expanded`, `aria-controls` (pointing at
  the listbox), `aria-autocomplete="list"`, `aria-activedescendant`
  (tracking the currently-highlighted result).
- Results container: `role="listbox"` with a matching `id` and
  `aria-label`; each result: `role="option"`, a stable `id`,
  `aria-selected` matching the real highlighted state.
- A real focus trap: Tab/Shift+Tab cycle only among the dialog's own
  focusable elements (the input plus rendered result buttons, computed
  live via `querySelectorAll` scoped to the dialog), wrapping at both
  ends rather than escaping into the page behind the overlay.
- Focus restoration: closing the dialog (any path — Escape, selecting a
  result) calls `.focus()` on the trigger button ref.

## A real regression this slice caused and fixed

The new E2E test originally logged in fresh in a `beforeEach` for 4
separate test cases — a pattern no other file in `tests/e2e/` uses (every
other file logs in once, inline, in a single `test()`). Combined with
every other spec file's own login, one full `npm run test:e2e` run
performed roughly 11 real logins from the same client IP within the login
rate limiter's 15-minute window (`docs/specs/rate-limiting.md`,
10 attempts/15 min) — enough to trip it. The real effect: `mfa.spec.ts`'s
login (running after the others) got a real 429 and stayed on `/login`
instead of reaching the dashboard, failing a previously-passing,
unrelated test.

Fixed two ways:
1. Consolidated the new test to one login, matching every other file's
   established convention (see the test file's own comment).
2. **Hardened the E2E pipeline itself**, since the underlying risk — a
   growing E2E suite eventually re-tripping the same shared-IP rate
   limit as more spec files are added — isn't fully solved by fixing one
   file. `npm run test:e2e` now runs a new
   `scripts/reset-rate-limits.ts` (via `packages/auth`'s new
   `resetAllRateLimitsForTests()`) immediately after its existing
   `db:reset`, so every E2E run starts with a clean rate-limit slate,
   the same way it already starts with a clean database.

## Scope — explicitly not built here

- **Not an app-wide accessibility audit.** Every other interactive
  component (forms, modals, tables, the rest of the app) has not been
  reviewed for keyboard/semantic accessibility in this slice. This is
  one representative fix for the single highest-value target, matching
  this project's established pattern of picking one representative
  instance over a sprawling audit when a requirement is broad (e.g. the
  asset-picker-search slice's "the one asset picker" framing).
- **No automated axe-core/lint-rule accessibility gate in CI.** Real ARIA
  correctness is proven here via Playwright assertions on actual roles
  and focus state (`getByRole`, `toBeFocused()`), which only pass if the
  semantics are genuinely correct — not a general-purpose accessibility
  linter across the whole app.
- **No color-contrast or screen-reader-announcement-text audit** —
  Section 39 also implies visual/AT-output quality this slice doesn't
  attempt to verify (would need real assistive-technology testing, not
  achievable via Playwright alone).

## Testing

- `tests/e2e/command-palette-accessibility.spec.ts` — a single real
  browser test (Playwright/Chromium), driven entirely by keyboard (no
  mouse clicks): opens via `Ctrl/Cmd+K` and asserts real dialog/combobox
  ARIA roles and focus; types a query and arrows through real search
  results, confirming `aria-selected` moves with the keyboard; presses
  Enter on the active result and confirms real navigation to that
  record's page; confirms Escape closes the dialog and restores focus to
  the trigger button; confirms Tab is trapped inside the dialog (forward
  through every option wraps back to the input; Shift+Tab from the input
  wraps to the last option) rather than escaping to the page behind it.
- `packages/auth/src/rate-limit.integration.test.ts` — 1 new test for
  `resetAllRateLimitsForTests()` against real Redis: clears every bucket
  without needing to know their keys in advance.
- Full `npm run test:e2e` run (production build, real seeded dev
  database, all 8 spec files) passes end to end, including `mfa.spec.ts`
  — the regression this slice both caused and fixed.

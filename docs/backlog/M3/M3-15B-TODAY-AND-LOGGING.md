# M3-15B: Today and logging

**Status:** in development — the product owner approved the agent brief and
Tier 2 dispatch on 30 August 2026. Split out of
[M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026.

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Tier:** 2 — user-visible behavior on M3-15A's already accepted schema,
authorization boundary, and write function.

**Depends on:** [M3-19](M3-19-DELETE-A-PLANNED-SESSION.md) accepted and merged,
so the corrected Cancel/Delete verbs are inherited rather than shipped twice.

**Blocks:** [M3-15C](M3-15C-PROGRESS.md), which has nothing to show until
completions can be written.

## Agent brief

**Outcome.** Restore `/home/today` as one owner-local day of plan content that
the owner can page through, and `/home/log` as the form that writes a
completion through M3-15A's accepted seam. Today reads; Log writes.

**Tier:** 2. Raise to Tier 1 and re-dispatch against M3-15A if any schema,
grant, or privileged-function change turns out to be needed.

**Product decisions, taken by the product owner on 30 August 2026.**
Today lists and links; the log form does not open inline on the card. Today
shows one date at a time, defaulting to owner-local today, with controls to
move to the previous and next day.

**Hard constraints:**

- Reach persistence only through the accepted seam: `createCompletionLog()`
  (`src/server/repositories/completion-log-repository.ts:136`) for writes, and
  `readPlanWindowToppedUp` (`src/server/completions/plan-window-top-up.ts:45`)
  for the day's plan content. **This ticket is that function's first caller**,
  per ADR-017 consequence 3 and M3-15A limitation 7. No new SQL, migration,
  grant, or privileged-function change.
- The selected date is a URL search param, so the view is addressable and the
  back button works. Fall back to owner-local today when it is absent or
  unparseable — never to a server-local date.
- `readPlanWindowToppedUp` returns `toppedUp: false` when the top-up could not
  run. Say so. A window that is short must never be drawn as an empty day.
  Likewise a date past the materialization window (`today + 13`) is knowably
  unfilled rather than empty, and should say which it is.
- **Skip is a completion status, not a plan operation.** It writes `skipped`
  through the completion path and must never reach
  `apply_rolling_plan_change_set`.
- Surface `completedKept`: add it to `SeriesEffectView`
  (`src/app/home/plan/series-action-state.ts:8`) and to the `end_series` copy
  at `src/app/home/plan/series-actions.ts:107`, which today reports only
  removed and locked-kept counts. This closes M3-15A limitation 3, and the
  count stops being zero the moment this ticket ships.
- Update `src/architecture/m3-11-legacy-reset.test.ts` deliberately, not
  incidentally: drop `src/app/home/log/actions.ts` from `legacyModules` and the
  two pages from `maintenancePages`, and **add all three new modules to
  `rollingPlanSurface`**, so they stay constrained rather than becoming
  unchecked.
- Owner, anonymous, and cross-owner checks on every read and write. Bound every
  query by the selected date.

**Non-goals.** No Progress, roadmap, or AI context. No completion delete — a
mistaken log is edited to `skipped`. No activity editor and no actual-measurement
capture. No completion schema change. No new date rule: whatever the write
function already permits is unchanged.

**Acceptance:**

1. Today shows one owner-local day carrying one-off, recurring, cancelled,
   locked, and Recovery day content, and pages to the previous and next day.
2. A planned session can be logged and skipped, unplanned training can be
   logged, and a mistaken log can be edited, including to `skipped`.
3. `readPlanWindowToppedUp` is called, and `toppedUp: false` is visible.
4. The `end_series` receipt reports a completed survivor.
5. Honest empty, error, and offline states; 390px throughout.
6. Green exact-commit CI, including a new pinned 390px flow on its own port and
   config, added to `.github/workflows/ci.yml` as an additive step.

**Expected to change:** `src/app/home/today/page.tsx`,
`src/app/home/log/page.tsx`, a new `src/app/home/log/actions.ts`, new Today and
Log components with their CSS module, `src/app/home/plan/series-action-state.ts`,
`src/app/home/plan/series-actions.ts`,
`src/architecture/m3-11-legacy-reset.test.ts`, a new `e2e/m3-15b-*.spec.ts` with
its pinned config, `.github/workflows/ci.yml`, and this ticket's validation
record. `src/components/home/training-maintenance.tsx` stays — Progress, roadmap,
and proposal still use it.

**Skills.** `vercel-react-best-practices` for the new routes, Server Actions,
and server/client boundary; `frontend-design` for two new user-visible
surfaces. Both are project copies at `.agents/skills/<name>/SKILL.md` and must
be read from there.

Read only this section unless you hit an ambiguity it does not resolve.

## Why this ticket exists separately

M3-15 was one ticket covering Today, logging, Progress, AI context, and the
roadmap. It was split on 29 August 2026 because a single ticket touching five
surfaces cannot be summarized in a forty-line brief, which AGENTS.md treats as
the signal to split rather than as a reason to write a longer brief.

This is the first slice because the other three have nothing to show until a
completion can be written. It is sequenced after M3-19 so that the session card
verbs Today inherits are already Cancel and Delete.

## Decisions taken

- **29 August 2026 — skip lands here, as a completion status.** It is a fact
  about what happened, not a planning verb. Recorded when M3-19 declined it.
- **30 August 2026 — Today lists, `/home/log` writes.** The product owner chose
  a read view with a Log control per session over an inline form on the card.
  One form serves both a planned session and unplanned training.
- **30 August 2026 — one day at a time, with day navigation.** The product
  owner declined a multi-day window: "only today but you should be able to
  navigate through days."
- **30 August 2026 — no new date rule.** The lead raised that backward paging
  is unbounded and this ticket adds no cutoff on how late a session may be
  logged. M3-15A left that rule open deliberately (its limitation 5), and
  inventing one inside a Tier 2 ticket would smuggle in a product decision. The
  write function's existing behavior stands until a ticket changes it on
  purpose.

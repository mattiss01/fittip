# M3-15B: Today and logging

**Status:** proposed — not approved for implementation. Split out of
[M3-15](M3-15-REPLACEMENT-CONSUMER-READINESS.md) on 29 August 2026.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 2 — user-visible behavior on M3-15A's already accepted schema,
authorization boundary, and write function. Raise to Tier 1 if any schema,
grant, or privileged-function change turns out to be needed; that is a signal
to re-dispatch against M3-15A, not to widen this ticket.

**Depends on:** [M3-19](M3-19-DELETE-A-PLANNED-SESSION.md) accepted and merged,
so the corrected Cancel/Delete verbs are inherited rather than shipped twice.

**Blocks:** [M3-15C](M3-15C-PROGRESS.md), which has nothing to show until
completions can be written.

## Scope

- Restore `/home/today` and `/home/log` from their `TrainingMaintenance` stubs.
- One consistent owner-local dated view of one-off, recurring, cancelled,
  locked, and **Recovery day** Plan content.
- The logging path onto M3-15A's write function, for a planned session or valid
  unplanned training. **Skip** is recorded here, as one of the five completion
  statuses — it is a fact about what happened, not a plan operation.
- First caller of `readPlanWindowToppedUp`, per ADR-017 consequence 3. M3-15A
  limitation 7 records that it currently has no consumer.
- **Surface `completedKept`.** `src/app/home/plan/series-actions.ts` still
  reports only removed and locked-kept counts, and `SeriesEffectView` does not
  carry the field. The count is zero until this ticket ships a write path and
  non-zero the moment it does. Raised by M3-15A's independent reviewer on
  29 August 2026 as non-blocking observation 1.
- The `src/architecture/m3-11-legacy-reset.test.ts` invariant lists
  `today/page.tsx` and `log/page.tsx` among the pages that must stay on the
  maintenance module. Update that invariant deliberately; do not let it change
  incidentally.
- Owner, anonymous, and cross-owner checks, query bounds, and the 390px pass.

## Non-goals

- No Progress, roadmap, or AI context — M3-15C, M3-15E, and M3-15D.
- No completion delete. Completions stay create/edit; a mistaken log is edited
  to `skipped`, per M3-15A limitation 2 and the 29 August 2026 decision.
- No activity editor and no per-activity actual-measurement capture. M3-15A
  ships that schema deliberately unused, and M3-14B recorded activities as
  fixture-backed and read-only.
- No completion schema change. If one becomes necessary, stop and re-dispatch
  against M3-15A.

## Approval boundary

This shell records the narrowed scope only. The exact contract requires an
`## Agent brief` and separate product-owner approval before dispatch.

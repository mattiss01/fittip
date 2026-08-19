# M3-14: Recurring session series foundation

**Status:** in development — the product owner approved Tier 1 dispatch on
19 August 2026 against this contract and
[ADR-017](../../decisions/ADR-017-RECURRENCE-MATERIALIZATION.md).

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — temporal schema, history, authorization, RLS, and concurrency.

**Depends on:** M3-13 accepted (19 August 2026, merged as `5e765fe`) and
ADR-017 accepted.

**Blocks:** [M3-14B](M3-14B-RECURRING-SERIES-SURFACE.md), and through it M3-15
and every later F-005 replacement slice.

## Agent brief

**Outcome.** Give the rolling plan a first-class recurring series: the
effective-dated rule, its session template, and the owner-derived function that
materializes occurrences into the fourteen-day Plan window. **No user-visible
surface** — M3-14B owns that. Tier 1.

**Hard constraints**

- One forward migration, additive; never edit an applied one. Two new tables,
  `rolling_plan_series` and `rolling_plan_series_activities`: owner-scoped,
  immutable `user_id` trigger, RLS on with one owner-bound select policy each,
  `select` to `authenticated` and nothing to anyone else. Mirror M3-13's
  `saved_session_activities`, same-owner `personal_activity_id` included.
- `rolling_plan_sessions` gains `series_id`, `occurrence_date`, `has_diverged`,
  nullable or defaulted so one-off sessions are untouched.
- Replace `rolling_plan_change_entries_kind_check` to add `add_series`,
  `edit_series`, `end_series`, `delete`; replace M3-12's `target_check` so a
  `delete` entry carries a null `session_id` and a `local_date`.
- `materialize_rolling_plan_series(p_expected_plan_revision,
  p_idempotency_key)`: `security definer`, `set search_path = ''`, owner from
  `auth.uid()` alone and **no owner argument**, window from
  `profiles.timezone_name`, never the request. Skip a rule date when an
  occurrence exists for `(series_id, occurrence_date)`, it precedes owner-local
  today, it is outside the segment's range, or the date holds ten sessions.
  Write the rest as `add` entries in **one** change set,
  `provenance = 'series_expansion'`. **Return `unchanged` without advancing the
  revision when nothing is missing** — two tabs depend on it. Never touch a
  diverged occurrence, never recreate a cancelled one. Return skipped dates.
- `end_series` **deletes** every occurrence on or after the effective date,
  **keeps locked ones active**, touches nothing completed or earlier. Each
  deletion writes a `delete` entry with null `session_id`, the `local_date`, and
  the full session and activities in `before_state`. That null `session_id` is
  what lets it survive `rolling_plan_change_entries_session_fkey`, which is
  `on delete cascade` — **never weaken or drop that key.** Return deleted,
  diverged, and locked-kept counts.
- Series operations go through `apply_rolling_plan_change_set`, contract
  unchanged: one transaction, one grouped change set, one revision advance, one
  honest stale loser. Refuse a whole-series edit once the first occurrence has
  passed. ADR-010 bounded lock waits.
- Dates are owner-local `date`; no timestamp anywhere in the rule, so
  daylight-saving correctness holds by construction.
- Extend `src/server/rolling-plan/`, its shared adapter contract, and
  `session-copy.ts`. No parallel module, no second copy path.

**Non-goals.** No UI, route, page, Server Action, or activation switch. No
calendar import/export, reminders, background materialization, arbitrary
recurrence language, or AI mutation.

**Acceptance criteria.** The ten below. **There is no 390px pass** — nothing
here is visible. Do not invent a surface to screenshot.

**Expected to change.** A new migration and its pgTAP file, an integration
harness, `src/server/rolling-plan/**`, the rolling-plan repository,
`session-copy.ts`, `database.types.ts`, and `.github/workflows/ci.yml`
(its own commit).

**Skills** from `.agents/skills/<name>/SKILL.md`: `schema-change` (migration →
reset → pgTAP → types, in order), `codebase-design`, `validation-record`.

Read only this section unless you hit an ambiguity it does not resolve.

## Outcome

Give the rolling plan a first-class recurring series: the effective-dated rule,
its session template, and the owner-derived function that materializes its
occurrences into the fourteen-day Plan window. **No user-visible surface.**

This is deliberately the same shape as
[M3-10](M3-10-ROLLING-PLAN-FOUNDATION.md), which delivered dormant rolling-plan
identity, state, history, and concurrency with no UI and was accepted on schema
and security evidence. M3-12 then made it visible. M3-14B does the same here.

## Contract

The binding constraints are in the Agent brief above and are deliberately not
repeated here. What follows is the acceptance bar, the decisions behind the
shape, and what this ticket knowingly leaves open.

Per ADR-017, an occurrence inside the Plan's fourteen-day owner-local window is
a real `rolling_plan_sessions` row. The series is the rule and the template.
ADR-017 records what that choice gives up, and this ticket must not quietly
soften any of it.

### Acceptance criteria

1. Every migration applies from zero; db lint and the local and hosted advisors
   report no new category.
2. pgTAP proves the privilege and policy matrix, owner immutability, cross-owner
   denial, direct-write denial, refusal of a whole-series edit after the first
   occurrence, and that a diverged or cancelled occurrence is never revisited.
3. pgTAP proves a daily-interval and a weekly-weekday series materialize the
   correct owner-local dates, including across a daylight-saving transition.
4. A date at the ten-session cap yields no occurrence, the series still exists,
   and the skipped dates are returned.
5. Re-running materialization changes nothing and does not advance the revision.
6. A concurrency harness like M3-13's proves two simultaneous materializations
   produce one writer, no duplicate occurrence, and no blended row.
7. This-and-future produces a successor segment; occurrences before the split
   date are byte-identical afterwards.
8. **`end_series` deletes every occurrence of the ended segment on or after the
   effective date**, including a diverged one, and **keeps every locked one
   active**. Every occurrence before the effective date and every completed one
   is byte-identical afterwards. It returns the deleted, diverged, and
   locked-kept counts.
9. Each deletion leaves a `delete` change entry whose `before_state` carries the
   full session and activities, and that entry survives the row's deletion.
   pgTAP asserts it is still present and readable afterwards.
10. The founder migration is applied and verified in timestamp order, with the
    schema, RLS, privilege boundary, and advisors recorded.

**There is no 390px acceptance pass**, because this ticket makes nothing
visible. That is the accepted cost of the split, and M3-10 set the precedent.
Do not invent a surface to produce a screenshot.

## Decisions taken on 19 August 2026

1. **Occurrences are materialized rows, not projections.** The product owner
   chose this against the lead's recommendation and against ADR-016 and F-005 as
   written, with the four costs stated first. ADR-017 records the objection, the
   rejected alternatives, and the consequences; F-005 carries the matching
   amendment. Nothing here reopens it.
2. **A cap collision skips the date and reports it**, rather than refusing the
   series, raising the cap, or exempting recurrence from the cap.
3. **Ending a series deletes its already-materialized future occurrences,
   including diverged ones, and keeps locked ones.** Raised by the product
   owner on 19 August 2026, who asked whether an owner can remove a recurring
   session and everything after it from the session itself. They can, and under
   ADR-017 the rows must be dealt with explicitly — the contract did not say so
   before this amendment.

   The product owner then rejected cancellation twice, on the grounds that a
   cancelled tombstone per occurrence makes the Plan unreadable, and chose
   deletion including for occurrences they had edited. The lead recommended
   deleting only untouched machine-generated occurrences and cancelling
   owner-edited ones, and was overruled. ADR-017 records the three costs.
4. **A lock excludes an occurrence from bulk removal**, not only from AI
   replacement. This widens what a lock means: F-005 currently scopes locks to
   AI proposals alone, and its lock rule needs the matching amendment before
   dispatch. The owner may still cancel or delete that one session directly —
   a lock constrains bulk operations, not deliberate individual ones.
5. **The ticket is split**, on the lead's recommendation: this foundation, then
   [M3-14B](M3-14B-RECURRING-SERIES-SURFACE.md) for the surface. The scope
   carries a two-table migration, a session-table alteration, a constraint
   replacement, three new change operations, and a new privileged function —
   more than M3-13, whose brief already ran 73 lines against a 40-line target.
6. **No cap on active series per owner**, consistent with M3-13's deliberately
   unbounded library. The lead recommended a bound of twenty and the product
   owner declined it. The consequence is recorded as a limitation below rather
   than argued again here.

## Known follow-ups, deliberately out of scope

- **Nothing bounds series count or reclaims occurrence rows.** Decision 4 plus
  ADR-017 consequence 2: an open-ended daily series is roughly 365 session rows
  per year, and an owner may create any number of them. A retention, archival,
  or bound decision is a separate product question, and it gets harder once
  rows exist.
- **M3-15 must top up before reading.** Today, Progress, and AI context each
  read the Plan and will read an incomplete one otherwise — ADR-017
  consequence 3. That belongs to M3-15; this ticket must not pretend to close
  it.
- **A background top-up cannot report skipped dates to anyone.** M3-14B shows
  them at creation; a later cap collision during a routine top-up is silent
  unless a surface is built for it.
- Activities still cannot be created or edited anywhere (M3-13 limitation 1), so
  a template's activities are proved by pgTAP rather than by clicking.

## Scope preserved from the approved decomposition

The decomposition shell's scope is split across this ticket and M3-14B. This
ticket owns:

- Daily/every-N-days intervals from 1–365 and weekly/every-N-weeks intervals
  from 1–52 on selected weekdays; no monthly, yearly, ordinal, or arbitrary
  RRULE behavior.
- Owner-local calendar-date expansion across daylight-saving boundaries, with a
  start date, optional end date, and explicit open-ended series.
- Bounded expansion with no infinite row creation or unbounded query.
- Effective-dated successor series, divergence marking, and whole-series editing
  only before the first occurrence.
- Past and completed occurrences immutable, planned snapshots retained, locks
  and the daily session cap enforced, and atomic history/revision behavior.
- The template copy from a same-owner saved session without a continuing library
  dependency.
- Owner/anonymous/cross-owner, concurrency, timezone/DST, and query-bound tests.

M3-14B owns the surface, the review-before-save flow, the change and remove
scopes on an occurrence, the consequence copy that names how many sessions a
removal affects, the pending top-up state, and the `390x844` flow.

## Non-goals

- No user-visible surface, route, Server Action, or activation switch.
- No calendar import/export, reminders, background materialization, arbitrary
  recurrence language, or AI mutation of a series.
- No replacement logging/Progress/AI consumers, AI proposal application,
  regeneration, or destructive reset.

## Approval boundary

The F-005 decomposition was approved on 14 August 2026 and ADR-017 on
19 August 2026. This contract records the dispatch-ready scope. Tier 1 dispatch
and the `## Agent brief` written against it remain a separate product-owner
decision.

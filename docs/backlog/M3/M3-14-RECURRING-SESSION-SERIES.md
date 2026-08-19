# M3-14: Recurring session series foundation

**Status:** proposed — contract drafted 19 August 2026 against
[ADR-017](../../decisions/ADR-017-RECURRENCE-MATERIALIZATION.md) and split the
same day. Tier 1 dispatch is **not** approved and requires a separate
product-owner decision.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — temporal schema, history, authorization, RLS, and concurrency.

**Depends on:** M3-13 accepted (19 August 2026, merged as `5e765fe`) and
ADR-017 accepted.

**Blocks:** [M3-14B](M3-14B-RECURRING-SERIES-SURFACE.md), and through it M3-15
and every later F-005 replacement slice.

## Outcome

Give the rolling plan a first-class recurring series: the effective-dated rule,
its session template, and the owner-derived function that materializes its
occurrences into the fourteen-day Plan window. **No user-visible surface.**

This is deliberately the same shape as
[M3-10](M3-10-ROLLING-PLAN-FOUNDATION.md), which delivered dormant rolling-plan
identity, state, history, and concurrency with no UI and was accepted on schema
and security evidence. M3-12 then made it visible. M3-14B does the same here.

## Contract

### Representation

Per ADR-017, an occurrence inside the Plan's fourteen-day owner-local window is
a real `rolling_plan_sessions` row. The series is the rule and the template; the
window is materialized ahead by an owner-derived function. ADR-017 records what
that choice gives up, and this ticket must not quietly soften any of it.

### Schema

One forward migration, additive. Never edit an applied one.

- **`public.rolling_plan_series`** — owner-scoped and effective-dated.
  `rule_kind` (`daily` | `weekly`), `interval` (1–365 for daily, 1–52 for
  weekly), `weekdays` (ISO 1–7, non-empty for weekly, null for daily),
  `start_date`, nullable `end_date` where null means open-ended,
  `predecessor_series_id` for a this-and-future successor, the sport-agnostic
  session template fields M3-12 already uses, `status`, `revision`,
  `created_at`, `updated_at`. Immutable `user_id` enforced by a
  `before update` trigger, RLS enabled with one owner-bound select policy, and
  `select` granted to `authenticated` alone.
- **`public.rolling_plan_series_activities`** — the template's activities,
  mirroring `saved_session_activities` from M3-13 including its same-owner
  `personal_activity_id` constraint.
- **`rolling_plan_sessions`** gains `series_id`, `occurrence_date`, and
  `has_diverged`, all nullable or defaulted so every existing one-off session
  is untouched. `occurrence_date` records the rule date that produced the row,
  so an occurrence the owner has moved is still recognised as covered and is
  never recreated on its original date.
- The `rolling_plan_change_entries` `change_kind` CHECK constraint is replaced
  to add `add_series`, `edit_series`, and `end_series`. Occurrence-level
  changes reuse the existing `add`, `edit`, `move`, `set_lock`, and `cancel`;
  add no operation a composed change set already expresses.

### Series operations

`apply_rolling_plan_change_set` gains `add_series`, `edit_series`, and
`end_series`, keeping its existing contract exactly: one transaction, one
grouped before/after change set, one revision advance, one winner and one honest
stale loser. A this-and-future change closes the current segment's `end_date`
and creates a successor effective from the split date, in one change set.

Whole-series editing is refused once the first occurrence has passed.

**`end_series` ends the series forward and cancels every already-materialized
occurrence on or after the effective date, in the same change set.** This is a
correctness requirement created by ADR-017, not a convenience: under projection
an ended series simply stops producing dates, but under materialization those
occurrences are real rows and would otherwise stay on the Plan after the owner
removed the series that produced them. The function must therefore leave no
active occurrence of an ended segment standing in the future.

It never touches an occurrence before the effective date, never touches a
completed one, and never deletes: cancellation sets `status = 'cancelled'` with
`cancelled_at` and records the transition, exactly as M3-12's `cancel` does.

**A diverged future occurrence is cancelled with the rest** — product-owner
decision, 19 August 2026. It is still an occurrence of the series being
removed. M3-14B is responsible for naming it before the owner confirms.

`end_series` returns the number of occurrences it cancelled and how many of
those were diverged, so M3-14B can state the consequence before the control
rather than after the fact.

### The materializer

`public.materialize_rolling_plan_series(p_expected_plan_revision, p_idempotency_key)`,
`security definer`, `set search_path = ''`, taking its owner from `auth.uid()`
alone and accepting no owner argument. Follow M3-13's
`apply_saved_session_change` as its shape and ADR-010's bounded lock waits.

It derives the window from `profiles.timezone_name` — never from the request —
and for every active series overlapping that window it writes the missing
occurrences. A rule date is skipped when:

- an occurrence already exists for that `(series_id, occurrence_date)`;
- the date is before owner-local today;
- the date falls outside the series segment's effective range; or
- the date already holds ten active sessions.

What remains is written as `add` entries in **one** change set with
`provenance = 'series_expansion'`, distinct from any owner provenance.

Two properties are load-bearing and must be asserted, not assumed:

1. **It returns `unchanged` and does not advance the revision when nothing is
   missing.** This is what stops a Plan visit from bumping the revision, and
   what makes two simultaneous materializations benign — one writes, the other
   finds nothing to do.
2. **It never touches an occurrence with `has_diverged` set**, and never
   recreates one the owner cancelled.

It returns the dates it skipped for the cap so M3-14B can name them.

### Server module

Extend the existing `src/server/rolling-plan/` module and its repository rather
than adding a parallel one. The in-memory and Postgres adapters both run the
shared contract, as they already do for M3-10's operations. Extend
`src/server/saved-sessions/session-copy.ts` for the saved-entry-to-template copy
rather than writing a second copy path.

### Constraints

- Dates are owner-local calendar dates. Storing them as `date` keeps the
  arithmetic correct across daylight-saving transitions by construction; do not
  introduce a timestamp anywhere in the rule.
- Locks, the owner-local past boundary, and the ten-per-date cap are enforced
  inside the database functions, not only in a caller.
- No UI, no route, no Server Action, no activation switch. M3-14B owns all of
  that.

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
8. **`end_series` leaves no active occurrence of the ended segment on or after
   the effective date**, including a diverged one, while every occurrence
   before it and every completed one is byte-identical afterwards. It cancels
   rather than deletes, and returns the affected and diverged counts.
9. The founder migration is applied and verified in timestamp order, with the
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
3. **Ending a series cancels its already-materialized future occurrences,
   including diverged ones.** Raised by the product owner on 19 August 2026,
   who asked whether an owner can remove a recurring session and everything
   after it from the session itself. They can, and under ADR-017 the rows must
   be cancelled explicitly — the contract did not say so before this
   amendment.
4. **The ticket is split**, on the lead's recommendation: this foundation, then
   [M3-14B](M3-14B-RECURRING-SERIES-SURFACE.md) for the surface. The scope
   carries a two-table migration, a session-table alteration, a constraint
   replacement, three new change operations, and a new privileged function —
   more than M3-13, whose brief already ran 73 lines against a 40-line target.
5. **No cap on active series per owner**, consistent with M3-13's deliberately
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

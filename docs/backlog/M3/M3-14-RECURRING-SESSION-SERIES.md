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
  to add `add_series`, `edit_series`, `end_series`, and `delete`, and its
  `target_check` is replaced to admit a `delete` entry with a null `session_id`
  and a `local_date`. Occurrence-level changes otherwise reuse the existing
  `add`, `edit`, `move`, `set_lock`, and `cancel`; add no operation a composed
  change set already expresses.

### Series operations

`apply_rolling_plan_change_set` gains `add_series`, `edit_series`, and
`end_series`, keeping its existing contract exactly: one transaction, one
grouped before/after change set, one revision advance, one winner and one honest
stale loser. A this-and-future change closes the current segment's `end_date`
and creates a successor effective from the split date, in one change set.

Whole-series editing is refused once the first occurrence has passed.

**`end_series` ends the series forward and deletes every already-materialized
occurrence on or after the effective date, in the same change set**, except for
the three exclusions below. This is a correctness requirement created by
ADR-017, not a convenience: under projection an ended series simply stops
producing dates, but under materialization those occurrences are real rows and
would otherwise stay on the Plan after the owner removed the series that
produced them.

| Occurrence | Outcome |
| --- | --- |
| Locked | **Kept and active.** A lock excludes it from bulk removal. |
| Completed | Untouched, with its planned snapshot. |
| Before the effective date | Never in scope. |
| Everything else, edited or not | **Deleted.** |

Deletion rather than cancellation is a product-owner decision of 19 August 2026,
recorded with its consequences in ADR-017. An occurrence the owner had
individually edited is deleted with the rest.

### Recording a deletion

Each deletion writes a change entry with `change_kind = 'delete'`, `session_id`
null, `local_date` set, and `before_state` carrying the full session and its
activities.

**The null `session_id` is load-bearing.**
`rolling_plan_change_entries_session_fkey` is `on delete cascade`, so an entry
that still referenced the session would be destroyed with it. M3-12 already made
`session_id` nullable and added
`rolling_plan_change_entries_target_check`; this ticket replaces that check to
admit a `delete` entry alongside `set_recovery_day`, and adds `delete` to the
kind check. Do not drop or weaken the cascade — ADR-017 records why that
alternative was rejected.

Accept that the deleted session's **earlier** entries cascade away with it. The
`delete` entry preserves what the session was at removal, not how it got there.
That is ADR-017's stated cost and must not be worked around by relaxing the
foreign key.

`end_series` returns the number of occurrences it deleted, how many of those had
diverged, and how many locked ones it kept, so M3-14B can state the consequence
before the control rather than after the fact.

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

# M3-14: Recurring session series

**Status:** proposed — contract drafted 19 August 2026 against
[ADR-017](../../decisions/ADR-017-RECURRENCE-MATERIALIZATION.md). Tier 1
dispatch is **not** approved and requires a separate product-owner decision,
together with the open questions recorded below.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — temporal schema, history, authorization, RLS, and concurrency.

**Depends on:** M3-13 accepted (19 August 2026, merged as `5e765fe`) and
ADR-017 approved.

**Blocks:** M3-15 and every later F-005 replacement slice.

## Outcome

Let an owner create open-ended or bounded recurring session series, and change
one occurrence or a series from a date forward, without ever rewriting past or
completed training.

## Contract

### Representation

Per ADR-017, an occurrence inside the Plan's fourteen-day owner-local window is
a real `rolling_plan_sessions` row. The series is the rule and the template; the
window is materialized ahead by an owner-derived function. Everything below
follows from that, and ADR-017 records what the choice gives up.

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
   what makes two tabs materializing at once benign — one writes, the other
   finds nothing to do.
2. **It never touches an occurrence with `has_diverged` set**, and never
   recreates one the owner cancelled.

It returns the dates it skipped for the cap so the caller can name them.

### Where materialization runs

From a Server Action only. It must never run during render:
`get_rolling_plan_slice` is `stable`, a page read must stay a read, and a
mutating GET would fire on prefetch. Two call sites:

- alongside any owner Plan change; and
- once per Plan visit, invoked from the client when the render detects the
  window is not fully covered.

### Behavior

- Create a series from the Plan, or from a saved-library entry copied by value
  with no continuing dependency. `src/server/saved-sessions/session-copy.ts` is
  the existing seam; extend it rather than writing a second copy path.
- Review the first occurrences before saving.
- **Only this session** edits that occurrence's row and marks it diverged.
- **This and future sessions** closes the current segment's `end_date` and
  creates a successor effective from the split date. Earlier occurrences,
  diverged occurrences, and completed training are untouched.
- Whole-series editing only before the first occurrence has passed.
- Cancelling a series ends it forward; it never removes past occurrences.
- Locks, the owner-local past boundary, and the ten-per-date cap are enforced
  server-side exactly as M3-12 enforces them, inside the function and not only
  in the UI.
- **A cap collision skips that date** — decided by the product owner on
  19 August 2026. The series is still created, and the owner is told which
  dates were skipped and why. A series running for months does not fail because
  one day is full.
- Dates are owner-local calendar dates. Storing them as `date` keeps the
  arithmetic correct across daylight-saving transitions by construction; do not
  introduce a timestamp anywhere in the rule.

### Acceptance criteria

1. An owner can create a daily-interval and a weekly-weekday series, bounded and
   open-ended, review the first occurrences, and see them on the Plan at 390px.
2. Changing one occurrence changes exactly that occurrence; the series and every
   other occurrence are byte-identical afterwards.
3. This-and-future creates a successor segment; occurrences before the split
   date keep their original meaning and completed occurrences keep their planned
   snapshot.
4. A date at the ten-session cap yields no occurrence, the series is still
   created, and the skipped dates are named to the owner.
5. Re-running materialization changes nothing and does not advance the revision.
6. Two simultaneous materializations produce one writer and no duplicate
   occurrence, proven by a concurrency harness like M3-13's.
7. pgTAP proves the privilege and policy matrix, owner immutability, cross-owner
   denial, direct-write denial, and that a diverged or cancelled occurrence is
   never revisited.
8. The 390px flow covers create, change one occurrence, this-and-future, and
   cancel, against `build` + `start` on its own port and config.

## Why this shape

M3-13 proved the pattern this ticket repeats: an owner-derived `security
definer` write, select-only client grants, an optimistic revision, and a
value-based copy seam. The series template is the saved-session template with a
rule attached, so the copy path already exists and must be extended rather than
duplicated.

The materializer is deliberately a separate function rather than a branch inside
`apply_rolling_plan_change_set`. A change set carries one provenance, and mixing
machine-written occurrences into an owner's change set would make the log unable
to answer who caused what — the one thing ADR-017 consequence 1 already asks it
to keep answering.

## Decisions taken on 19 August 2026

1. **Occurrences are materialized rows, not projections.** The product owner
   chose this against the lead's recommendation and against ADR-016 and F-005 as
   written, with the four costs stated first. ADR-017 records the objection, the
   rejected alternatives, and the consequences; F-005 carries the matching
   amendment. Nothing here reopens it.
2. **A cap collision skips the date and reports it**, rather than refusing the
   series, raising the cap, or exempting recurrence from it.

## Open questions for dispatch approval

These need answers before a builder starts, and none should be defaulted.

1. **Should this be one ticket or two?** It carries a two-table migration, a
   session-table alteration, a change-kind constraint replacement, a new
   privileged function, a new call site rule, and a three-way edit-scope
   surface. AGENTS.md treats a scope that cannot be summarized in a 40-line
   brief as a signal to split. The natural seam is Tier 1 schema plus
   materializer, then the surface — but M3-13's precedent is that the product
   owner prefers one ticket, and a split would leave the first half with no
   visible way to create a series.
2. **Is there a cap on active series per owner?** M3-13's library is
   deliberately unbounded, but a series is heavier: ADR-017 consequence 2 means
   an open-ended daily series is roughly 365 session rows per year. No bound is
   invented here.
3. **What does the owner see while the window is being topped up?** The Plan
   renders what exists, then a client-invoked action extends it. That is a brief
   visible gap on the first visit after the window rolls, and it is the fifth
   copy of the transition glue M3-12's limitation 8 already records as owed
   consolidation.

## Known follow-ups, deliberately out of scope

- **A background top-up cannot report skipped dates to anyone.** The owner sees
  them at creation; a later cap collision during a routine top-up is silent
  unless a surface is built to show it.
- **M3-15 must top up before reading.** Today, Progress, and AI context each
  read the Plan and will read an incomplete one otherwise — ADR-017
  consequence 3. That work belongs to M3-15, and this ticket must not pretend
  to close it.
- **Nothing reclaims occurrence rows.** ADR-017 consequence 2 is accepted and
  unaddressed; a retention or archival decision is a separate product question.
- Activities still cannot be created or edited anywhere (M3-13 limitation 1), so
  a series template's activities are demonstrated through a fixture rather than
  by clicking.

## Scope preserved from the approved decomposition

- Daily/every-N-days intervals from 1–365 and weekly/every-N-weeks intervals
  from 1–52 on selected weekdays; no monthly, yearly, ordinal, or arbitrary
  RRULE behavior.
- Owner-local calendar-date expansion across daylight-saving boundaries, with a
  start date, optional end date, and explicit **No end date**.
- Bounded expansion with no infinite row creation or unbounded query.
- **Only this session** exceptions and effective-dated **This and future
  sessions** successors; whole-series editing only before the first occurrence.
- Past and completed occurrences immutable, planned snapshots retained, locks
  and the daily session cap enforced, and atomic history/revision behavior.
- Create a series from reviewed fields or the current same-owner saved-session
  value without creating a continuing library dependency.
- Owner/anonymous/cross-owner, concurrency, timezone/DST, query-bound, and
  `390x844` create/edit/cancel tests.

## Non-goals

- No calendar import/export, reminders, background materialization, arbitrary
  recurrence language, or AI mutation of a series.
- No replacement logging/Progress/AI consumers, AI proposal application,
  regeneration, or destructive reset.

## Approval boundary

The F-005 decomposition was approved on 14 August 2026. This contract records
the dispatch-ready scope against ADR-017. Tier 1 dispatch, the `## Agent brief`
written against it, and the three open questions above remain a separate
product-owner decision.

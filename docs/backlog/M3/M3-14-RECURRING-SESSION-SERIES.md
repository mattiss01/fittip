# M3-14: Recurring session series

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 1 — temporal schema, history, authorization, RLS, and concurrency

**Depends on:** M3-13 accepted.

**Blocks:** M3-15 and every later F-005 replacement slice.

## Outcome

Let an owner create open-ended or bounded recurring session series while every
consumer expands only the requested date slice. Occurrence and future-series
changes preserve past and completed training.

## Scope to preserve when this ticket is drafted for approval

- Daily/every-N-days intervals from 1–365 and weekly/every-N-weeks intervals
  from 1–52 on selected weekdays; no monthly, yearly, ordinal, or arbitrary
  RRULE behavior.
- Owner-local calendar-date expansion across daylight-saving boundaries, with
  a start date, optional end date, and explicit **No end date**.
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

This shell records the approved F-005 decomposition only. After M3-13 is
accepted, the exact schema, expansion, edit-scope, and UI contract needs its own
Agent brief and separate product-owner approval before Tier 1 implementation.

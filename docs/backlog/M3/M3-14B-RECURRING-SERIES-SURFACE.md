# M3-14B: Recurring series surface

**Status:** in development — Tier 2 dispatch approved by the product owner on
20 August 2026 against the corrected contract and Agent brief below.

**Triage:** ready-for-agent

**Milestone:** M3

**Priority:** P1

**Tier:** 2 — user-visible behavior on the schema and authorization boundary
M3-14 establishes. **Re-tier to 1 immediately** if the work turns out to need
any schema, grant, policy, or privileged-function change; that is a stop-and-
re-dispatch, not a judgement call.

**Depends on:** M3-14 accepted, merged, and its founder migration verified.

**Blocks:** M3-15 and every later F-005 replacement slice.

## Agent brief

**Outcome.** Let an owner create, review, change, and end recurring session
series from the Plan at 390px, and show honestly when the fourteen-day window
is being extended. Tier 2.

**Hard constraints**

- Compose only M3-14's accepted `add_series`, `edit_series`, `end_series`, and
  `materialize_rolling_plan_series` operations plus existing owner-scoped
  reads. No schema, grant, policy, migration, or privileged-function change;
  stop and re-dispatch as Tier 1 if one becomes necessary.
- Repeat from a planned session and from a saved-library entry enters one
  review-before-save flow for bounded or open-ended daily and weekly rules.
- Keep series reads and all mutations server-side. Authenticate every Server
  Action, pass only minimal serializable data to client components, and never
  import a repository or `@/server/**` from a `"use client"` file.
- Before a future-series removal, state the permanent consequences without
  forecast counts. After success, report the exact deleted, diverged-deleted,
  and locked-kept counts returned by `end_series`; compute no second estimate.
- Withhold **This and all future sessions** when a locked survivor's occurrence
  date is after its segment end date. Do not branch on SQLSTATE or error text.
  **Only this session** remains available.
- Validate in the Server Action that no surface operation can place an
  occurrence outside its segment's start/end range.
- Materialize from a Server Action only: alongside owner Plan changes and once
  per Plan visit when rendered data shows incomplete coverage. Never mutate
  during render or GET/prefetch. Announce the non-blocking pending state and
  its recovery accessibly.
- Preserve M3-12's existing Plan behavior, serious-coach tone, keyboard focus,
  reduced motion, private/no-store responses, and honest empty, loading,
  invalid, stale, expired-session, missing-time-zone, and offline states.
- Record the fifth transition-glue copy and do not consolidate it in this
  ticket. Activities remain fixture-backed because no activity editor exists.

**Non-goals.** No replacement Today, logging, Progress, or AI consumers; no AI
series mutation, reminders, background work, arbitrary recurrence language,
history/undo surface, or broad refactor.

**Acceptance criteria.** All eight criteria below, with criterion 5 using
consequence-before-action and authoritative counts only after success. CI must
run the dedicated `390x844` production flow with a pinned config/test match.

**Expected to change.** `src/app/home/plan/**`, the existing rolling-plan
domain/repository seam, the saved-library reuse surface where needed, a new
M3-14B Playwright spec/config, focused tests, and
`docs/validation/M3/M3-14B-VALIDATION.md`. No migration or generated types.

**Skills** from `.agents/skills/<name>/SKILL.md`: `frontend-design`,
`vercel-react-best-practices`, `mobile-e2e`, and `validation-record`.

Read only this section unless you hit an ambiguity it does not resolve.

## Outcome

Let an owner create, review, change, and end recurring session series from the
Plan at 390px, and see honestly what the fourteen-day window is doing while it
catches up.

## Contract

Everything here composes M3-14's accepted operations —`add_series`,
`edit_series`, `end_series`, and `materialize_rolling_plan_series`. Add no
database operation a composed change set already expresses.

### Creating a series

- **Repeat** on a planned session, and creation from a saved-library entry,
  both landing in the same review step.
- Choose every N days (1–365) or every N weeks (1–52) on selected weekdays; a
  start date; and an end date or explicitly **No end date**.
- **Review the first occurrences before saving.** F-005 requires this, and it is
  the only point at which the owner sees what the rule actually means before it
  writes anything.
- On save, the surface reports which dates were skipped for the ten-session cap
  and why. A series is still created when some dates are skipped.

### Changing or removing an occurrence

Opening one occurrence offers **both** a change scope and a remove scope —
product-owner decision, 19 August 2026, on the reasoning that the occurrence is
where the owner is looking, so it is where the choice belongs. Each scope is
**Only this session** or **This and all future sessions**, and each states what
it will do before it is applied, matching the consequence-before-action
convention the Plan and the library already use.
- **Only this session** edits that occurrence and marks it diverged, so the
  materializer never revisits it.
- **This and future sessions** closes the current segment and creates its
  successor. Earlier occurrences, diverged occurrences, and completed training
  are visibly untouched.
- Whole-series editing is offered only before the first occurrence has passed,
  and the surface says so rather than failing at submit.
- An occurrence is visibly identifiable as recurring, and a diverged one as
  changed.

**Removing this and all future sessions** calls M3-14's `end_series`, which
ends the series from that date and **deletes** every already-materialized
occurrence on or after it, except locked ones, which stay. Before the control,
the surface states those permanent consequences without forecast counts. After
the transaction succeeds, it reports the exact deleted, diverged-deleted, and
locked-kept counts from the `end_series` receipt. Do not compute a second
estimate in either the client or the Server Action that could race the write.

**A locked survivor cannot itself be removed this way.** Because `end_series`
keeps locked occurrences alive while moving the segment's end date behind them,
a locked occurrence outlives its own series' end date. Offering
"this and all future sessions" on one produces an effective date past that end
date, which M3-14's clamp turns into a change that changes nothing, and
`apply_rolling_plan_change_set` refuses it. Withhold that scope on an occurrence
dated past its series' `end_date`; do not submit the known no-op and do not
branch on SQLSTATE or error text. Removing that single session is unaffected —
a lock constrains bulk operations, not deliberate individual ones. Recorded as
M3-14 limitation 18.

The copy must be honest that this is permanent: the sessions are removed from
the Plan, not cancelled, and there is no undo. Say plainly that nothing before
that date changes, that completed training is untouched, and that locked
sessions are kept. Do not soften it into "cancelled" — ADR-017 chose deletion
deliberately, and the copy convention here is to state the consequence before
the control rather than to make it sound smaller than it is.

### Keeping the window current

Materialization runs from a Server Action only. It must never run during
render: `get_rolling_plan_slice` is `stable`, a page read must stay a read, and
a mutating GET would fire on prefetch. Two call sites:

- alongside any owner Plan change; and
- once per Plan visit, invoked from the client when the render detects the
  window is not fully covered.

**The pending state is honest**, decided by the product owner on 19 August 2026:
the Plan renders what exists immediately, and the uncovered dates carry a
visible "extending your recurring sessions" state that resolves when the action
returns. It does not block the first render, and it does not let occurrences
appear silently.

This is the fifth copy of the transition glue M3-12's limitation 8 records as
owed consolidation. Do not widen that debt further than one more copy, and say
plainly in the validation record that it was added.

### Acceptance criteria

1. An owner can create a daily-interval and a weekly-weekday series, bounded and
   open-ended, review the first occurrences before saving, and see them on the
   Plan at `390x844`.
2. Skipped cap dates are named to the owner at creation.
3. **Only this session** changes exactly one occurrence; the Plan shows every
   other occurrence unchanged.
4. **This and future sessions** changes the future only; earlier occurrences are
   visibly as they were.
5. Removing **this and all future sessions** from an occurrence removes every
   occurrence of that series on or after the chosen date, **keeps every locked
   one**, changes nothing before it, and touches no completed training. The
   confirmation says the removal is permanent and names every consequence
   before the owner confirms; after success, the result names the authoritative
   removed, edited, and locked-kept counts returned by the transaction.
6. The pending top-up state appears, is announced to assistive technology, and
   resolves; no occurrence appears without explanation.
7. Empty, loading, invalid, stale-conflict, expired-session, missing-time-zone,
   and offline-safe states each have copy and a real recovery.
8. The `390x844` flow covers create, only-this, this-and-future, and end,
   against `build` + `start` on its own port and config, with its own pinned
   `testMatch`.

## Project skills

`frontend-design` for the review step, the three-way edit scope, and the pending
state; `vercel-react-best-practices` for the Server Actions, the server/client
boundary, and the client-invoked top-up. Both are project copies under
`.agents/skills/`.

## Known follow-ups, deliberately out of scope

- A background top-up cannot report skipped dates to anyone. This surface shows
  them at creation only.
- **A removal cannot be reviewed or undone from anywhere in the product.** The
  `delete` change entry preserves what each session was, but there is no visible
  plan-history surface, so the owner cannot reach it. ADR-017 consequence 2.
- Nothing bounds series count or reclaims occurrence rows — M3-14 decision 4 and
  ADR-017 consequence 2.
- **This surface must not place an occurrence outside its series' date range.**
  M3-14 validates only that the owner owns the `seriesId`, so nothing in the
  database stops it, and such a row survives a later series removal. M3-14
  limitation 17.
- M3-15 owns topping up before Today, Progress, and AI context read the Plan.
- Activities still cannot be created or edited anywhere, so a template's
  activities are demonstrated through a fixture rather than by clicking.

## Non-goals

- No schema, grant, policy, or privileged-function change. If one is needed,
  stop and re-dispatch as Tier 1.
- No calendar import/export, reminders, background materialization, arbitrary
  recurrence language, or AI mutation of a series.
- No replacement logging/Progress/AI consumers, AI proposal application,
  regeneration, or destructive reset.

## Approval boundary

Created by the 19 August 2026 split of M3-14, which the product owner approved
on the lead's recommendation. The product owner approved the corrected Tier 2
contract and dispatch on 20 August 2026 after M3-14 was accepted. The correction
keeps consequence copy before a future-series removal, moves authoritative
counts to the successful result, and withholds the known locked-survivor no-op.

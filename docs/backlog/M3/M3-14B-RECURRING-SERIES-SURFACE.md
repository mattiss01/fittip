# M3-14B: Recurring series surface

**Status:** proposed — created 19 August 2026 when
[M3-14](M3-14-RECURRING-SESSION-SERIES.md) was split. Dispatch is **not**
approved and requires a separate product-owner decision after M3-14 is accepted.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P1

**Tier:** 2 — user-visible behavior on the schema and authorization boundary
M3-14 establishes. **Re-tier to 1 immediately** if the work turns out to need
any schema, grant, policy, or privileged-function change; that is a stop-and-
re-dispatch, not a judgement call.

**Depends on:** M3-14 accepted, merged, and its founder migration verified.

**Blocks:** M3-15 and every later F-005 replacement slice.

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

### Changing an occurrence

- Opening one occurrence offers **Only this session** and **This and future
  sessions**, and states what each will do before it is applied, matching the
  consequence-before-action convention the Plan and the library already use.
- **Only this session** edits that occurrence and marks it diverged, so the
  materializer never revisits it.
- **This and future sessions** closes the current segment and creates its
  successor. Earlier occurrences, diverged occurrences, and completed training
  are visibly untouched.
- Whole-series editing is offered only before the first occurrence has passed,
  and the surface says so rather than failing at submit.
- An occurrence is visibly identifiable as recurring, and a diverged one as
  changed.

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
5. Ending a series removes no past occurrence.
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
- Nothing bounds series count or reclaims occurrence rows — M3-14 decision 4 and
  ADR-017 consequence 2.
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
on the lead's recommendation. Dispatch, the tier at dispatch, and the
`## Agent brief` written against it remain a separate product-owner decision,
and cannot be taken before M3-14 is accepted.

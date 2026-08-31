# M3-15B: Today and logging

**Status:** accepted — the product owner accepted on 31 August 2026 against
reviewed commit `88b3d84`, its green CI run
[33370107698](https://github.com/mattiss01/fittip/actions/runs/33370107698) and
its Preview, after three rounds and two independent reviews. Merged as
`fa063e2`; no founder migration was required, because no schema changed. Two
changes the product owner asked for at acceptance are filed as
[M3-23](M3-23-COMPLETION-WRITE-FOLLOW-UPS.md) items 2 and 3. See
[the validation record](../../validation/M3/M3-15B-VALIDATION.md).

The product owner approved the agent brief and Tier 2 dispatch on 30 August
2026. Round 3 was requested by the product owner on 31 August 2026 from their
Preview pass, and dispatched by the lead as within the same Tier 2 scope. Split
out of
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

**Added on 31 August 2026, from the product owner's Preview pass.** Unplanned
training must be nameable, and a skipped session must not ask for numbers that
cannot exist. Both are in the two hard constraints marked **(31 Aug)** below.

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
- **(31 Aug) An unplanned log carries a title and a sport, both required.**
  Write them as one `CompletionActivity` at `position: 0` on the create
  payload, `measurementMode: "custom"` with no measurement, no
  `personalActivityId`. The create path already validates and inserts the
  activity list, so **no migration and no tier change**; free text, trimmed,
  within the existing 120 and 80 character limits. Collect them only when there
  is no planned session, and never send the key on a planned create. Today
  sources the unplanned title from the first completion activity
  (`src/app/home/today/page.tsx:180` reads the planned snapshot today, which is
  null here), keeping the existing fallback for logs already written without
  one. **An edit cannot change them** — the write function refuses an
  `activities` key by design — so render them as text, not as inputs that would
  discard what the owner typed, say so in one line, and record the limitation
  for the M3-15A follow-up.
- **(31 Aug) A skipped outcome hides Duration, Effort, and How it felt**, which
  are unanswerable about training that did not happen. Same conditional the
  form already applies to the `replaced` field, on the existing `outcome`
  state. **Keep the note and all four signals** — an owner may skip precisely
  because of pain, and AGENTS.md makes conservative handling of those four an
  invariant. Editing a completed log to skipped stores null for all three,
  because the write function assigns them unconditionally and an unmounted
  field sends nothing. That is correct: assert it, and warn before the save.
- Owner, anonymous, and cross-owner checks on every read and write. Bound every
  query by the selected date.

**Non-goals.** No Progress, roadmap, or AI context. No completion delete — a
mistaken log is edited to `skipped`. No completion schema change. No new date
rule: whatever the write function already permits is unchanged. No general
activity editor, no multi-activity list, and no actual-measurement capture: the
unplanned title and sport above are one activity written at create time, not the
beginning of an editor. No personal-activity record is created or linked by
logging — `personalActivityId` stays absent, so nothing here adds an exercise
library.

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
7. **(31 Aug)** An unplanned log is given a title and a sport, and Today shows
   that title rather than "Unplanned training". Reopening it for an edit shows
   both without offering to change them. An unplanned log written before this
   change still reads correctly.
8. **(31 Aug)** Choosing Skipped removes Duration, Effort, and How it felt, and
   leaves the note and the four signals in place. Editing a completed log with
   all three set to Skipped stores null for all three and keeps the signals.

**Expected to change:** `src/app/home/today/page.tsx`,
`src/app/home/log/page.tsx`, a new `src/app/home/log/actions.ts`, new Today and
Log components with their CSS module, `src/app/home/plan/series-action-state.ts`,
`src/app/home/plan/series-actions.ts`,
`src/architecture/m3-11-legacy-reset.test.ts`, a new `e2e/m3-15b-*.spec.ts` with
its pinned config, `.github/workflows/ci.yml`, and this ticket's validation
record. `src/components/home/training-maintenance.tsx` stays — Progress, roadmap,
and proposal still use it. The 31 August additions touch
`src/app/home/log/log-form.tsx`, `src/app/home/log/actions.ts`,
`src/app/home/log/page.tsx`, `src/app/home/today/page.tsx`, the log CSS module,
and the ticket's e2e spec. They touch no file under `supabase/`; if one needs
touching, stop and report rather than proceeding.

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
- **31 August 2026 — unplanned training is nameable; a skip stops asking for
  numbers.** From the product owner's Preview pass: "when I log an unplanned
  training I cannot give it any Title or Sport. This should be possible. When I
  log a session as skipped, the fields Duration, effort and felt should be cut
  out." The lead verified before dispatching that the create path already
  accepts an activity carrying `name` and `sport`, so the ticket stays Tier 2.
  The lead decided both fields are **required** rather than optional: optional
  fields reproduce the nameless card the owner is objecting to, and a mixed
  data shape would land on M3-15C to disentangle.
- **31 August 2026 — the brief exceeds its own length rule.** AGENTS.md aims at
  40 lines and treats 60 as a limit; this brief now runs past 110. The rule says
  that is a signal to split the ticket. The lead did not split it, because these
  are corrections to unaccepted work on the same surface and the same seam:
  a separate ticket would have to be sequenced behind an M3-15B the product
  owner has declined to accept, which is a worse outcome than a long brief.
  Recorded rather than silently tolerated. The underlying cause is that M3-15B
  was already over the limit at dispatch on 30 August, which the lead should
  have caught then.

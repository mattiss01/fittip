# M3-15B validation: today and logging

**Ticket:** [M3-15B](../../backlog/M3/M3-15B-TODAY-AND-LOGGING.md)
**Status:** testable — round 1 rejected; **round 2 independently approved on
30 August 2026**; awaiting product-owner acceptance.
**Tier:** 2
**Branch:** `ticket/m3-15b-today-and-logging`
**Base:** `8d01bb2b6c6d948a3c519ae1be32c5e13a76e3b4`
**Implementation review target:**
`388b57f` — the last source commit. The record commit that follows it changes
no application file (the evidence-commit exception in `AGENTS.md`).
**Review range:**
`git diff 8d01bb2b6c6d948a3c519ae1be32c5e13a76e3b4..388b57f`
**Superseded target:** `8be18fe` — **rejected in round 1** on four blocking
findings. The correction range is
`git diff 8be18fe..388b57f`.

Implementation commits, in order:

| Commit | Purpose |
| --- | --- |
| `77a7863` | `completedKept` on the end_series receipt view and in its copy. |
| `bb77008` | The plan-manager fixture that carries the new count. |
| `f687ad7` | Today reopened as one owner-local day, plus the shared completion vocabulary. |
| `4bfc9fa` | The completion write action and the log form. |
| `ebec31f` | The `/home/log` route, its stylesheet, and the rest of the architecture invariant move. |
| `0bab28a` | Prettier wrap of one link in the log form. |
| `3ec9c43` | Unit tests for the write action and the three form entries. |
| `0f7d72e` | The pinned 390px flow and its config. |
| `d35856c` | The additive CI step on port 3024. |
| `8be18fe` | The first validation record. **Rejected in round 1.** |
| `40f9348` | **Round 1, blocking 1 and 2.** Two browser assertions that could never pass. |
| `df33206` | **Round 1, blocking 4.** An unfilled day was still drawn as an empty one. |
| `418d33a` | **Round 1, blocking 3.** The established safety notice on the four health signals. |
| `1ac4fb9` | **Round 1, also-fix.** Error-boundary copy, receipt focus, and one plan-window definition. |
| `929f254` | **Round 1, record finding.** The architecture invariant tightened to an import allowlist. |
| `388b57f` | **Round 1, record finding.** Two comments stop calling a caller-supplied bound an access control. |

The middle commits are deliberately small. `4bfc9fa` in particular commits the
action and the form before their stylesheet and route exist, so the build is
briefly broken at that commit and whole again at `ebec31f`; a transport failure
mid-ticket is the reason that trade was taken.

## Round 1 review: rejected, and what changed

Four blocking findings against `8be18fe`, all confirmed against the code before
they reached the builder. None of them was disputed.

1. **`e2e/auth.spec.ts:54` was a regression this ticket caused.** It asserted
   the retired `TrainingMaintenance` heading on `/home/today` after signup.
   Reopening that route made it unpassable. The identical correction had been
   made in `e2e/m3-11-maintenance.spec.ts` and missed here. Fixed in `40f9348`.
2. **This ticket's own flow contained a never-passing assertion.** The
   cancelled-card check scoped `Cancelled` with `exact: true` to the `<li>`,
   where the only cancelled text is the meta line
   `{sport} · Cancelled, kept on the record`; the bare label is a sibling
   *outside* the card. The flow therefore aborted at step three of about ten,
   which means acceptance criteria 1 to 4 had **no browser evidence at all**
   and criterion 6 was unmet — the spec had never once executed past plan
   arrangement. Reading the remainder against the real markup on the assumption
   that nothing after that line had ever run found two more defects, both also
   fixed in `40f9348`:
   - the Plan's rail stamp reads `Recovery`, not `Recovery day`. An empty
     recovery day renders both `Clear recovery day` and `Recovery day. Nothing
     is planned here.`, and Playwright's default case-insensitive substring
     match takes both, so the old assertion was a two-element strict-mode
     violation rather than a false pass. It now asserts the flipped control
     directly. (Corrected by the lead after round 2 finding 15; the original
     wording here named only the control label.)
   - `Completed` is a substring of `Partly completed`, so the outcome radios
     were being disambiguated by DOM order. They are anchored with
     `/^Completed/` and `/^Skipped/`.
3. **The four health signals shipped without the established stop-and-seek-help
   copy.** The fieldset covered "non-diagnostic" but not "conservative".
   `AGENTS.md` makes conservative pain, illness, injury, and severe-fatigue
   handling a product invariant, and this is the first surface in the reset app
   that collects all four, so the requirement binds whether or not the brief
   restated it. M1-03's approved wording, shipped by M2-02 as `SAFETY_NOTICE`,
   is reused verbatim in `418d33a`.
4. **An unfilled day was still drawn as an empty one.** The notice and the
   empty-day paragraph were independent, so a date past `today + 13` rendered
   "unfilled rather than empty" and then "Nothing is planned on this day." A
   day whose top-up failed did the same. Fixed in `df33206`, with the absence
   assertion in both page tests that would have caught it.

Two record findings, both accepted as accurate:

- The record claimed `m3-11-legacy-reset.test.ts` asserts that writes go only
  through `createCompletionLog()` and plan reads only through
  `createRollingPlan()`. It did not: it asserted one positive substring and a
  negative list, so any of the five modules could have imported an arbitrary
  additional `@/server/**` persistence module and still passed — and two of
  them had just moved out of `maintenancePages`, whose predicate forbade
  `@/server/**` outright. Rather than soften the wording, `929f254` tightens
  the test to a named import allowlist, verified to fail when an entry is
  removed. The claim is now true.
- The record presented `assertSessionOnDay`'s day bound as a security control.
  It is bounded by `formData.get("plannedDate")`, which the caller supplies, so
  it confines nothing the caller also chooses. Ownership is sound by other
  means. `388b57f` corrects both source comments, and the table below now
  describes the bound as what it is.

Four cheap correctness items were raised alongside and all four are fixed in
`1ac4fb9` and `418d33a`: both error boundaries claimed "Nothing was logged or
changed", which a lost Server Action reply makes false; the `submission`
docblock promised a watchdog nothing reads; the receipt replaced the form and
dropped focus to the document body; and Today kept a second copy of the plan
horizon instead of reusing `plan-window.ts`.

One finding is reported rather than fixed, at the reviewer's own direction —
see known limitation 8.

## Delivered behavior

**Today shows one owner-local day.** `/home/today` reads the plan content on a
single date and the completions written for it. The date is a `date` search
parameter, so the view is addressable and the browser's back button steps
through the days actually visited. An absent, malformed, or impossible date
(`2026-02-30`) falls back to owner-local today, never to a server-local date.
An owner with no confirmed time zone is told to confirm it on the Plan rather
than being shown a guessed day.

The day carries every kind of plan content: one-off sessions, recurring
occurrences marked `Recurring`, locked sessions marked `Locked`, cancelled
sessions marked `Cancelled, kept on the record`, and the Recovery day label. A
day with nothing on it says `Nothing is planned on this day.`, in the past
tense for a past day.

**The plan window is topped up, and says when it could not be.** The read goes
through `readPlanWindowToppedUp`, which ADR-017 consequence 3 requires of every
consumer that is not the Plan. This ticket is that function's first caller,
closing M3-15A limitation 7. When the top-up cannot run the surface says the
day may be missing occurrences a series would produce and is not necessarily
empty. A date past `today + 13` is labelled unfilled rather than empty. In
both cases the "Nothing is planned on this day." sentence is **suppressed**:
that sentence is a claim about the plan, and it holds only when the window it
belongs to was actually filled, so printing it under either notice would
contradict the notice directly.

**Logging writes a completion.** `/home/log` opens in one of three ways: for a
planned session named by a day-bounded link from Today, for unplanned training
on a day, or for a completion that already exists. One form serves all three.
It records the outcome, the date the training happened on, duration, perceived
effort, how it felt, a note, the description that `replaced` requires, and the
four conservative signals — pain, illness, injury, severe fatigue.

**The four signals carry the established safety notice.** The same fieldset
that collects them carries M1-03's approved wording, shipped by M2-02 on the
memory surface: stop training and speak to a qualified health professional if a
symptom is severe, sudden or getting worse; FitTip stores what you write and
neither assesses symptoms nor gives medical advice. It sits inside the fieldset
rather than beneath the form, so it cannot be scrolled away from what it
qualifies. Nothing about the plan changes because a signal is ticked, and the
surface says so.

**Skip is a completion status.** It is one of the four outcomes a planned
session may have, written through the same completion path as any other. It
never reaches `apply_rolling_plan_change_set`, and the planned session stays on
the plan, uncancelled, after a skip.

**A mistaken log is corrected, including to skipped.** `Edit log` reopens the
record against the revision the owner read. No completion is deleted; M3-15A
limitation 2 stands.

**The end_series receipt reports a completed survivor.** `SeriesEffectView`
carries `completedKept` and the `end_series` copy reports it beside the removed
and locked-kept counts. This closes M3-15A limitation 3, and the count stops
being zero the moment an owner logs training against a recurring occurrence.

**Today reads; Log writes.** Today renders no form and dispatches no Server
Action; every write on it is a link. The log surface makes exactly one write,
through `createCompletionLog()`.

## Mobile demo path

At 390px on the Vercel Preview, signed in as the owner:

1. Open `/home/plan`. Confirm the time zone if asked. Create three sessions on
   today — say `Tempo run`, `Easy spin`, `Core circuit` — and one on tomorrow.
   Lock `Core circuit`. Cancel one session. Mark the day after tomorrow as a
   Recovery day. Optionally create a daily recurring session starting today.
2. Open `/home/today`. The day shows every session, with `Locked`,
   `Cancelled, kept on the record`, and `Recurring` marks where they apply.
3. Tap **Next day** twice. The Recovery day appears with `Recovery day` and
   `Nothing is planned on this day.` Tap **Back to today**.
4. Tap **Previous day** once. Yesterday says `Nothing was planned on this day.`
   Use the browser back button twice and confirm it walks back through the days
   you visited.
5. Edit the address to `/home/today?date=` plus a date fourteen or more days
   ahead. The day says it is unfilled rather than empty and names the last date
   FitTip fills ahead — and does **not** also say nothing is planned.
6. Back on today, tap **Log this session** on `Tempo run`. Read the safety
   notice under the four signals. Choose **Completed**, enter 42 minutes,
   effort 7, `Good`, a note, and tick `I felt pain`. Tap **Save log**. The
   receipt takes focus; then tap **Back to that day**. The card is stamped
   `Completed`, shows `42 min`, and says `You reported: Pain.` The
   `Log this session` link is gone.
7. Tap **Log this session** on `Easy spin`, choose **Skipped**, save, and
   return. The card is stamped `Skipped` and is still a planned session — it is
   not marked cancelled.
8. Tap **Log unplanned training**, enter 30 minutes and a note, save, and
   return. It appears under **Also logged**, stamped `Unplanned`.
9. Tap **Edit log** on `Tempo run`, choose **Skipped**, save. The receipt says
   `Log updated.` and the card is stamped `Skipped`.
10. Back on `/home/plan`, if you created a recurring session, log it as
    completed from Today, then open that occurrence's **Cancel** disclosure and
    tap **Remove this and all future sessions**. The receipt reports
    `1 completed kept`.

Check throughout that nothing scrolls sideways, that every control is reachable
by keyboard with a visible focus ring, and that the copy reads as a serious
coach's record rather than a scoreboard.

## Changed files

```
 .github/workflows/ci.yml                    |  10 +
 docs/validation/M3/M3-15B-VALIDATION.md     | 436 +++++++++++++++++++++++++++
 e2e/auth.spec.ts                            |   6 +-
 e2e/m3-11-maintenance.spec.ts               |  10 +-
 e2e/m3-15b-today-and-logging.spec.ts        | 439 ++++++++++++++++++++++++++++
 e2e/m3-15b.playwright.config.ts             |  21 ++
 src/app/home/log/actions.test.ts            | 269 +++++++++++++++++
 src/app/home/log/actions.ts                 | 237 +++++++++++++++
 src/app/home/log/error.tsx                  |  21 ++
 src/app/home/log/loading.tsx                |  13 +
 src/app/home/log/log-action-state.ts        | 152 ++++++++++
 src/app/home/log/log-form.tsx               | 287 ++++++++++++++++++
 src/app/home/log/log.module.css             | 338 +++++++++++++++++++++
 src/app/home/log/page.test.tsx              | 307 +++++++++++++++++++
 src/app/home/log/page.tsx                   | 332 ++++++++++++++++++++-
 src/app/home/plan/plan-manager.test.tsx     |   9 +-
 src/app/home/plan/plan-window.ts            |  13 +-
 src/app/home/plan/series-action-state.ts    |   7 +
 src/app/home/plan/series-actions.test.ts    |   9 +-
 src/app/home/plan/series-actions.ts         |   2 +-
 src/app/home/today/error.tsx                |  21 ++
 src/app/home/today/loading.tsx              |  13 +
 src/app/home/today/page.test.tsx            | 257 ++++++++++++++++
 src/app/home/today/page.tsx                 | 231 ++++++++++++++-
 src/app/home/today/today-day.tsx            | 355 ++++++++++++++++++++++
 src/app/home/today/today.module.css         | 338 +++++++++++++++++++++
 src/architecture/m3-11-legacy-reset.test.ts |  49 +++-
 27 files changed, 4159 insertions(+), 23 deletions(-)
```

Nothing was deleted or renamed. Both route modules that were four-line
`TrainingMaintenance` stubs — `src/app/home/today/page.tsx` and
`src/app/home/log/page.tsx` — were rewritten in place, which is why they show
as modified rather than added.
`src/components/home/training-maintenance.tsx` is untouched: Progress, the
roadmap, and the proposal route still use it.

Files whose purpose is not evident from the path and diff:

- `src/app/home/log/log-action-state.ts` — the completion vocabulary both
  surfaces speak, not only the action-state types. It holds the outcome labels
  and hints, the feeling labels, the signal field names, the short stamps Today
  prints, and `COMPLETION_SAFETY_NOTICE`. Today imports it, which is why a file
  in the log folder is loaded by the Today component.
- `src/app/home/today/today-day.tsx` — the presentational half of Today. It is
  a synchronous server component taking plain props, which is what lets
  `page.tsx` be rendered whole in a unit test; it reaches no repository and no
  Supabase client of its own.
- `src/app/home/today/page.tsx` — does all of its own fetching rather than
  delegating to a nested async component, deliberately: an async child cannot
  be rendered by the jsdom test harness, so the page would otherwise have been
  untestable at this level.
- `src/app/home/plan/plan-window.ts` — gains `planWindowFor(timezoneName)`,
  factored out of `readPlanWindow` for a caller that has already read the
  stored zone. `readPlanWindow` now delegates to it, so there is exactly one
  definition of owner-local today and of how far ahead the plan is filled.
  Behavior on the Plan is unchanged.
- `src/architecture/m3-11-legacy-reset.test.ts` — the deliberate invariant
  move, plus a new assertion. `log/actions.ts` leaves `legacyModules`, both
  routes leave `maintenancePages`, all three new modules join
  `rollingPlanSurface`, and that bucket is now held to a named allowlist of
  `@/server/**` imports rather than to a single positive substring.
- `e2e/auth.spec.ts` and `e2e/m3-11-maintenance.spec.ts` — consequential, not
  incidental: both asserted maintenance copy on routes this ticket reopened, so
  both would fail as written.
- `src/app/home/plan/series-actions.ts` — a one-line copy change. The rest of
  the file is untouched.

## Data, migration, API, privacy and security effects

**No migration, and no schema change of any kind.** No SQL file was added or
edited, no grant changed, no privileged function changed, no completion schema
changed. This ticket is the first consumer of a seam M3-15A already accepted
and shipped. The database and the RLS boundary at the review target are
byte-identical to those at `8d01bb2`.

**No new persistence path.** Writes go only through `createCompletionLog()`
(`src/server/repositories/completion-log-repository.ts`), which reaches
`apply_completion_change`. Plan reads go only through `createRollingPlan()`.
`src/architecture/m3-11-legacy-reset.test.ts` now enforces this positively as
well as negatively: every `@/server/**` specifier in each of the five modules
of the reopened surface must appear in a named allowlist, so an additional
persistence module cannot be introduced silently. Removing one allowlist entry
and re-running fails, so the assertion is not vacuous.

Per read and write:

| Path | Owner | Anonymous | Cross-owner |
| --- | --- | --- | --- |
| Today: plan slice for one date | `createRollingPlan()` derives the user from the session cookie; the repository repeats the `user_id` predicate and RLS is the backstop. | `RollingPlanAuthenticationError` → redirect to `/`; the route is also behind `src/proxy.ts`. | The slice is owner-scoped in both the query and the policy; another owner's session id is simply absent from the result. |
| Today: completions for one date | `CompletionLog.list()` → `PostgresCompletionLogAdapter.list()`, which resolves the verified user itself, filters `user_id`, and bounds `actual_local_date` to the single day. | `CompletionAuthenticationError` → redirect to `/`. | Same `user_id` predicate plus RLS. |
| Log: one completion by id | `CompletionLog.get()` resolves the verified user and filters `user_id` and `id`. A row that is not the owner's returns `null`, and the surface says the log is not there rather than that it belongs to someone else. | `CompletionAuthenticationError` → redirect to `/`. | Indistinguishable from "not found", so the route leaks no existence signal. |
| Log: planned session lookup | `getPlanSlice(date, date)`. The slice is owner-scoped in the query and in RLS; that, not the date, is the boundary. | Redirect to `/`. | Owner-scoped; a foreign id is not in the slice and the surface says the session is not on this day. |
| Log: the write | `logCompletionAction` re-derives the owner through the repository; the RPC is owner-derived and captures the planned snapshot itself. | The action returns the `session` state and writes nothing. | The RPC refuses a plan session that is not the caller's. |

**The day bound on the planned-session lookup is not an access control.**
`assertSessionOnDay` bounds by `plannedDate`, which the caller supplies in the
form, so it confines nothing the caller does not already choose. It is a
pre-check that buys copy: a session moved or deleted between opening the form
and saving is reported as exactly that, instead of surfacing as the generic
validation message a foreign-key violation produces. Ownership on that path is
enforced by RLS, by the owner-scoped slice, and by the write function
re-deriving the owner.

**No snapshot is ever composed by a caller.** The create sends the planned link
and an empty activity list; the write function captures the snapshot from the
plan row. The edit sends facts only — no planned link, no snapshot, no
activities — which is what makes the planned link immutable. A test pins that
an edit's payload contains neither key.

**Privacy.** No new data leaves the server beyond what the two surfaces render.
`toSessionView` and `toCompletionView` project only the fields drawn. No AI
provider is called, no analytics added, no third-party request made. The four
health signals are stored exactly as the owner ticked them and are never
interpreted; the surface says so, and carries the approved safety notice beside
them.

**Spend and secrets.** None. No secret, hosted project, or paid resource was
added to CI. The new CI step reuses the existing disposable local stack on a
new port.

**Search parameters are treated as untrusted input.** The date parameter is
format-checked and round-tripped before use; the two identifiers are matched
against a UUID pattern before any lookup, so a malformed value is never sent to
the database. All three fall back to a safe default rather than erroring.

## Tests added or changed

`src/app/home/today/page.test.tsx` — new, 10 tests.

| Test | What it would catch |
| --- | --- |
| reads owner-local today through the ADR-017 top-up when no date is given | Today reading the plan directly, skipping the top-up ADR-017 consequence 3 requires — the exact defect M3-15A limitation 7 left open. |
| falls back to owner-local today when the date parameter is unusable | An impossible date such as `2026-02-30` reaching the query, or an error page where a day should be. |
| bounds both reads by the requested day and offers the way back | A read widening beyond the selected day, or a paged-away owner stranded with no route back to today. |
| says the window is short rather than drawing an empty day | `toppedUp: false` being swallowed, **and** the empty-day sentence reappearing beneath the notice that contradicts it. |
| says a date past the materialization window is unfilled, not empty | The same pair for a day past `today + 13`. |
| still says a filled day is empty when it truly is | The gating above being over-applied, so a genuinely empty day says nothing at all. |
| stamps a logged session and links its edit instead of a second log | A logged session still offering `Log this session`, inviting a duplicate the write function refuses. |
| offers the log link on a planned session that has none | The log entry point disappearing, leaving a planned session unloggable. |
| keeps a completion no card on this day carries | A completion silently dropped because its planned session is not on the day it was logged. |
| refuses to guess a day for an owner with no stored zone | A server-local day being shown to an owner whose zone is unknown. |

`src/app/home/log/actions.test.ts` — new, 11 tests.

| Test | What it would catch |
| --- | --- |
| writes a planned completion through the completion seam only | A write reaching persistence any way other than `createCompletionLog()`, or a field mangled between the form and the seam. |
| writes skip as a completion status and never as a plan change | Skip implemented as a plan operation — the ticket's sharpest constraint. It asserts `applyChangeSet` is never called. |
| refuses a planned create whose session is not on the named day | The pre-check being dropped, so a stale form produces a raw database failure instead of an explanation. |
| writes unplanned training with no planned session and no plan read | An unplanned log acquiring a planned link, or a pointless plan read on a path with no session. |
| edits a mistaken log to skipped against the revision it was read at | An edit losing its optimistic revision, letting one tab silently overwrite another. |
| never sends a planned snapshot or an activity list on an edit | A caller composing a snapshot, which would let the record lie about what it was measured against. |
| reports a conflict, a missing time zone, a validation failure, and an ended session in the owner's own words (4 cases) | An error surfacing as a stack trace or a wrong instruction, and a failed write being followed by a revalidation that implies success. |
| refuses an operation it does not offer | A third operation name being accepted and reaching the seam. |

`src/app/home/log/page.test.tsx` — new, 11 tests.

| Test | What it would catch |
| --- | --- |
| opens a planned session bounded by the day its link named | The lookup widening past the single day, or the hidden day field going missing from the form. |
| offers skip as one outcome among the four a planned session may have | Skip disappearing from the form, or `unplanned` being offered for a session with a plan link — a combination the write function refuses. |
| says so when the named session is not on that day | A moved or deleted session producing a crash or an empty form instead of an honest state. |
| logs unplanned training without reading the plan at all | An unplanned log requiring plan content it has no business reading. |
| reopens an existing log against the revision it was read at | An edit form losing the completion id or the revision, turning a correction into a conflict or a second record. |
| says so when the log behind the link is not there | A missing or foreign completion producing an error page rather than a truthful state — and, because the two are indistinguishable, an existence leak. |
| ignores a malformed identifier rather than looking it up | An unvalidated identifier reaching the database. |
| refuses to anchor a day for an owner with no stored zone | A form that writes a date against a zone nobody confirmed. |
| carries the established safety notice wherever a signal is reported | The conservative-handling invariant regressing, or the notice drifting out of the fieldset it qualifies. |
| asks what was done instead only once replaced is chosen | The `replaced` description going missing, which the domain refuses, or being demanded when it does not apply. |
| replaces the form with a receipt that leads back to the day | A saved write leaving a stale form on screen whose next submit would carry a spent revision. |

`e2e/m3-15b-today-and-logging.spec.ts` — new, 1 flow at 390x844 on port 3024.
It arranges a day carrying one-off, recurring, locked, cancelled, and Recovery
day content; asserts the private, no-store headers; pages forward twice, back
to today, and back one day; sees the unfilled-day notice past the window and
asserts the empty sentence is absent; reads the safety notice on the form;
logs a planned session and checks the stamp, the duration, and the reported
signal; skips another and checks the plan was not touched; logs unplanned
training; corrects the first log to skipped; and finishes on the Plan asserting
the `end_series` receipt reports `1 completed kept`. It creates a disposable
confirmed account and deletes it in a `finally` block.

**This flow has now executed end to end, once.** Round 1 established that it
aborted at step three, and the builder does not run browser flows, so its first
genuine execution was CI's on the round-2 tip: run
[33329615702](https://github.com/mattiss01/fittip/actions/runs/33329615702),
browser job green. Criteria 1 to 4 are proven in a browser as of that run.
(This paragraph previously said the flow had never run; corrected by the lead
when the green run existed, per the evidence-commit exception.)

Changed tests:

| File | Change | What it would catch |
| --- | --- | --- |
| `src/architecture/m3-11-legacy-reset.test.ts` | Three modules move into `rollingPlanSurface`, and that bucket gains a named `@/server/**` import allowlist. | Any module of the reopened surface reaching persistence outside the rolling-plan and completion seams, including by adding a new server module the old substring check would have ignored. |
| `src/app/home/plan/series-actions.test.ts` | The end_series fixture carries `completedKept: 1`; the message assertion requires `1 completed kept`. | The completed survivor silently dropping out of the receipt copy again. |
| `src/app/home/plan/plan-manager.test.tsx` | The same count in the surface's own receipt fixture. | Type-level drift between the action result and what the surface renders. |
| `e2e/auth.spec.ts` | Asserts Today's own heading instead of the retired stub's. | Nothing new; without it the authentication flow fails outright. |
| `e2e/m3-11-maintenance.spec.ts` | Drops the two routes that are no longer stubs. | Nothing new; without it the suite asserts maintenance copy on live routes. |

## Results

Round 2 (the current target, `388b57f`):

- `npm.cmd run typecheck` — clean.
- `npm.cmd run build` — succeeds; both routes build as dynamic.
- `npx.cmd eslint` on every changed source, test, and e2e file — clean.
- `npx.cmd prettier --write` on every changed file — no remaining differences.
- `npm.cmd run test:run` over `src/architecture`, `src/app/home/today`,
  `src/app/home/log`, and `src/app/home/plan` — all passing (18, 10, 22, and 58
  respectively).
- The import allowlist was verified to fail when an entry is removed, so it is
  not passing vacuously.

**Continuous integration is green for the reviewed work.** Run
[33329615702](https://github.com/mattiss01/fittip/actions/runs/33329615702),
`head_sha` `7457272f179f96695a9dc436efa2185f694d3355`, conclusion `success`,
all three jobs — `static`, `database`, and the 390px `browser` flows. That tip
commit differs from the source target `388b57f` only by this record, so the run
is the automated-test evidence for `388b57f` as well. The builder could not
record this itself, since it does not push; the lead added it after the run
existed.

Any run that exists for the rejected target `8be18fe` is red, and predictably
so: `e2e/auth.spec.ts` asserted a heading that route no longer renders, and
this ticket's own flow aborted at its third step. Both are defects this ticket
introduced, both are fixed above, and neither qualifies for an `AGENTS.md`
exception — `master` at the base commit is green
([33326707615](https://github.com/mattiss01/fittip/actions/runs/33326707615)).
That failed history stays in this record.

The builder did not run the full Vitest suite, the local Supabase stack, the
pgTAP suite, or any Playwright flow to produce evidence. `AGENTS.md` assigns
that to continuous integration.

## Known limitations

1. **No completion can be deleted.** M3-15A limitation 2 stands: the write
   function offers `create` and `edit` only. A log that should not exist is
   edited to `skipped`, which is what the ticket's non-goals specify. An owner
   who logged unplanned training that never happened has no way to remove the
   record at all — editing it to `skipped` is available but reads oddly for
   training that was never planned.
2. **No actual measurement and no activity capture.** Every create sends
   `activities: []`. M3-15A limitation 4 stands.
3. **No start time.** `actualStartedAt` is accepted by the domain and stored by
   the schema; the form offers no field for it, so it is always absent.
4. **No new date rule, deliberately.** Backward paging is unbounded and the
   `date` parameter is only checked for being a well-formed, real ISO date —
   there is no range clamp. A date in 1970 or 2170 opens as an empty day.
   Inventing a cutoff would smuggle a product decision into a Tier 2 ticket;
   M3-15A limitation 5 is still the open question.
5. **A lost session does not return the owner to the day they were on.**
   `safeAuthReturn` allows `/home/today` with no query and `/home/log` with
   exactly one parameter, so neither `/home/today?date=…` nor the two-parameter
   `/home/log?plannedSession=…&date=…` survives re-authentication; both fall
   back to `/home/today`. Widening that allowlist is an auth-surface change
   this ticket did not make.
6. **Today's top-up is a whole-window side effect.** `readPlanWindowToppedUp`
   is called with a single-day range, but the materialization it triggers fills
   the plan's own fourteen-day window. Opening a day far in the future
   therefore extends the plan around today, not around the day being viewed —
   which is why such a day is labelled unfilled.
7. **The log page does not top up.** It reads the planned session with a plain
   `getPlanSlice`. Nothing is reachable-but-unreadable, because Today only
   links to sessions its own topped-up read returned, but the asymmetry is
   deliberate rather than incidental.
8. **A second log against one session is refused with unhelpful copy, and a
   late log lives on the day it happened.** A completion whose planned session
   sits on another date appears under **Also logged** on the day it was logged,
   titled from its snapshot and labelled with the day it was planned for. It
   does not appear on the planned session's own day, where the card still
   offers `Log this session` — and that second attempt is refused by the unique
   index as `22023`, which the adapter maps to `CompletionValidationError`,
   which this surface renders as "Check the outcome, the date, and the
   numbers." All three of those are correct, so the owner is told to fix
   nothing that is wrong. **This cannot be fixed inside `src/app/home/log`**:
   `22023` carries no distinguishing detail by the time it reaches the action,
   and a surface pre-check cannot find a completion written on a different day
   because `CompletionLog.list` is bounded by `actual_local_date`, not by the
   planned session. Distinguishing it needs either a dedicated error code from
   `apply_completion_change` or a by-session read on the adapter — both M3-15A
   territory. Reported to the lead rather than worked around here. It is the
   least satisfying edge in the ticket.
9. **No stall or recovery machinery on the log form.** The Plan surface carries
   `transition-watchdog` handling for lost Server Action renders; the log form
   has a pending label, a receipt that takes focus, and nothing else. If a
   response is lost the owner sees a stuck `Saving…` and must reload; both
   error boundaries now tell them to check before writing again rather than
   claiming nothing was written. The `submission` counter that such a watchdog
   would key on exists and is documented as currently unread.
10. **An edit cannot cross the planned/unplanned boundary.** The write function
    refuses it and the form does not offer it.
11. **`edit_series` still does not report its completed count.** The receipt
    carries `completedKept` for both series operations; only the `end_series`
    copy reports it, because that is the copy the brief named.
12. **The safety notice is copied, not imported.** The memory original lives
    inside a client component module, so importing it would pull that surface
    into this bundle. Two identical strings can now drift. Extracting one
    shared constant would touch an accepted M2-02 surface and is left for a
    ticket that means to.
13. **No hosted or database evidence in this record.** No migration was made,
    so there is nothing to apply to the founder project, but the founder smoke
    pass over the two reopened routes is still the product owner's to perform
    on the Preview.

## Judgment calls the brief did not settle

1. **Skip is an outcome in the form, not a button on the card.** The product
   owner decided on 30 August that "Today lists and links; the log form does
   not open inline on the card". A one-tap Skip control on a Today card would
   have made Today a write surface with its own Server Action and pending
   state, contradicting that decision and the ticket's own "Today reads; Log
   writes" framing. If the product owner wants one-tap skipping, it is a small
   follow-up, not a rework.
2. **The existing visual language was extended rather than replaced.** Both
   surfaces reuse the FitTip ledger the Plan established — cream stock, deep
   green ink, hard edges, offset shadow, Courier stamps. The one new signature
   is the tilted, outlined **outcome stamp** struck across a card once training
   has been logged against it: a day of planning is a page of intentions, and
   the stamp is the only thing on it that is a fact. Nothing scores, ranks, or
   streaks.
3. **The safety notice reuses M1-03's exact wording rather than new copy**, and
   sits inside the signals fieldset rather than at the foot of the form. See
   limitation 12 for what copying costs.
4. **The log link carries two parameters.** `plannedSession` plus `date`, so
   the plan lookup names one day rather than a window. The cost is limitation 5.
5. **The action re-reads the day before a planned create.** One extra
   owner-scoped query, bought for the error copy, not for security.
6. **A completion the day's cards do not carry is listed rather than dropped.**
   See limitation 8 for what that costs.
7. **`e2e/auth.spec.ts` and `e2e/m3-11-maintenance.spec.ts` were edited
   although the brief listed neither.** Both asserted maintenance copy on
   routes this ticket reopened. Dropping exactly those assertions is the
   minimum consequential change; missing the first of them was blocking
   finding 1.

## Round 2 review: approved

The independent reviewer approved `388b57f`, built and deployed as branch tip
`7457272`, on 30 August 2026. It verified each round-1 finding against the diff
rather than against the builder's claim, enumerated every `@/server/**`
specifier across all five `rollingPlanSurface` modules to confirm the new
import allowlist is neither vacuous nor carrying a dead entry, and confirmed
the run's `head_sha` equals the branch ref rather than trusting the run title.

It answered the four questions the lead put to it:

1. **The flow's assertions now prove the criteria rather than merely passing**,
   with two soft spots recorded as findings 13 and 14 below. Criterion 2 is the
   strongest: the skip step asserts the `Skipped` stamp *and* `toHaveCount(0)`
   on `Cancelled, kept on the record` for the same card, which observes the
   "skip is not a plan operation" invariant in a browser instead of inferring
   it. Criterion 3 is split deliberately — a browser cannot force
   `toppedUp: false`, so that half is unit-only.
2. **The allowlist bites**, and the two pages that moved off the strict
   `maintenancePages` predicate are not worse off: they went from an open ban
   to a named closed set, which is the correct replacement.
3. **The copied safety notice is acceptable to ship.** Importing the original
   would make a `"use client"` module a dependency of this bundle, and
   extracting it would be a drive-by change to an accepted M2-02 surface.
4. **Limitation 8's diagnosis is right** and the fix belongs against M3-15A.

Non-blocking findings it left open, none of which gate acceptance:

- **13.** The `Unplanned` stamp is asserted only by a substring of the title
  beside it, so the record's demo step 8 claim is currently unasserted. Third
  instance of this spec's recurring defect class.
- **14.** The only horizontal-overflow assertion runs on `/home/plan`, a
  surface this ticket did not change. Neither Today nor the log form is checked
  for sideways scroll, despite Today carrying the app's one rotated element.
- **16.** The allowlist is direct-import only. `today/page.tsx` now reaches two
  server modules transitively through `../plan/plan-window`; no escape exists
  today, but a relative `../../../server/…` specifier would not match the
  `@/server/` regex.
- **18.** The receipt is both `role="status"` and a programmatic focus target,
  which some screen readers announce twice, and its `outline-offset` styles a
  ring that will not render.

Findings 15 and 17 were record corrections addressed to the lead and are
applied above, at the round-1 recovery-day bullet and in `## Results`.

## Independent reviewer focus

The diff is the source of truth; this record is for navigation. Worth the
reviewer's judgment rather than CI's:

1. **`skipped` never becomes a plan operation.** Read
   `src/app/home/log/actions.ts` end to end and confirm there is no path from
   any status to `applyChangeSet`. The only rolling-plan call in the file is
   the read in `assertSessionOnDay`.
2. **The round 1 corrections are complete rather than local.** In particular,
   whether any other spec in `e2e/` still asserts retired maintenance copy, and
   whether any assertion in the M3-15B flow still cannot match the markup — the
   flow has still never run end to end.
3. **The import allowlist is the right shape**, and that no module of the
   reopened surface reaches a server module outside it.
4. **Ownership on every new read and write**, against the table above, and that
   the day bound is now described accurately as a pre-check.
5. **The snapshot is never composed by a caller**, on both the create and the
   edit path.
6. **`toppedUp: false` and the beyond-window state are honest** — that neither
   can be mistaken for an empty day, and that the empty sentence is suppressed
   in exactly those two cases and no others.
7. **The completions/plan matching in `renderDay`** — that no completion
   returned by the day's read can be dropped from the render, and that
   limitation 8 accurately describes what the code does.
8. **Copy and consent tone on the four health signals**, against the F-005
   conservative, non-diagnostic requirement.

The 390px visual pass, the hosted Preview interaction, and acceptance remain
the product owner's.

# M3-15C validation: progress

**Ticket:** [M3-15C](../../backlog/M3/M3-15C-PROGRESS.md)
**Status:** testable — round 1 of independent review rejected `fc7ef06` on two
blocking findings and three in-scope text corrections, all corrected in
`aee6da1`. Re-review, a green continuous-integration run for the corrected
SHA, the Vercel Preview, and product-owner acceptance are all pending.
**Tier:** 2
**Branch:** `ticket/m3-15c-progress`
**Base:** `745c2b5994467976361edf089d10e3edab7b15bf`
**Implementation review target:**
`aee6da1e285acf60b1382b4887f21a4d2e04070a` — the last source commit. The
record commit that follows it changes no application file (the evidence-commit
exception in `AGENTS.md`).
**Review range:**
`git diff 745c2b5994467976361edf089d10e3edab7b15bf..aee6da1e285acf60b1382b4887f21a4d2e04070a`
**Superseded target:** `fc7ef06930baf74d9b35ff31062ab3de926e5754` — **rejected
in round 1.** The correction range is
`git diff fc7ef06930baf74d9b35ff31062ab3de926e5754..aee6da1e285acf60b1382b4887f21a4d2e04070a`.

Implementation commits, in order:

| Commit | Purpose |
| --- | --- |
| `5e58f3389544a8672824c9f49647398625a32f5f` | Both Progress routes, their components, styles, boundary states, and the architecture invariant move. |
| `a172ce8efd569c1c3af42a44246c4dd28a0a81dd` | Unit tests for the month bound, the target formatter, and both routes. |
| `9153c819abdb652051a3303778c7d1e9e443c401` | The pinned 390px flow and its config on port 3025. |
| `1444808a3cd9bcd8c2c688ebf49aaa0989dd8f1b` | The additive CI step, committed separately as a tooling change. |
| `fc7ef06930baf74d9b35ff31062ab3de926e5754` | The M3-11 maintenance flow no longer asserts a stub on the reopened route. **Rejected in round 1.** |
| `d07d0df1e87ec1d8a6425b059f99020bb166e7aa` | The first validation record. It is the commit CI actually ran. |
| `aee6da1e285acf60b1382b4887f21a4d2e04070a` | **Round 1, blocking 1 and all three also-fixes.** |

## Round 1 review: rejected, and what changed

Two blocking findings against `fc7ef06`, and three corrections to text this
ticket itself introduced. None was disputed. The application code was found
sound; every finding was in the ticket's own new test and record text.

1. **The new browser flow failed, and the cause was a no-op assertion.** CI run
   [33395347590](https://github.com/mattiss01/fittip/actions/runs/33395347590)
   for `d07d0df` is red, and only the `M3-15C progress` step failed; every
   other browser flow passed, including this ticket's edit to
   `e2e/m3-11-maintenance.spec.ts`.

   The flow clicked `Use Europe/Berlin` and then waited on the heading
   `Plan ahead.`, which `src/app/home/plan/page.tsx:44` renders
   **unconditionally**, above the `timezoneName === null` fork. It was
   therefore already on screen when the click was dispatched, so the wait
   resolved instantly, never waited for `confirmPlanTimezoneAction` to commit
   and revalidate, and the following `page.goto("/home/progress")` aborted the
   in-flight action. The failure snapshot confirms it: Progress rendered its
   no-zone state, which is the correct behavior for an owner whose zone was
   never stored, so `[data-progress-empty="never"]` never existed. The
   implementation was right; the flow asserted a state unreachable from where
   it had left the account.

   Corrected in `aee6da1` by waiting on `[data-plan-date]`, which cannot exist
   until the zone is stored, plus the absence of the zone card's own heading.
   No timeout and no retry was used.

   `e2e/m3-15b-today-and-logging.spec.ts` and `e2e/m3-12-plan.spec.ts` carry
   the identical weak assertion and pass only because their next step waits on
   plan-window content. The lead is filing that as a follow-up; it is
   deliberately **not** changed here.

2. **This record cited continuous-integration evidence that does not exist.**
   It named `fc7ef06` as the review target and treated its run as the
   evidence. There is no run for `fc7ef06`: the branch has exactly one run,
   33395347590, for `d07d0df`, and it failed. That is corrected throughout this
   record, and known limitation 1 below now records that the risk it predicted
   materialized rather than leaving the prediction standing.

3. **An invariant comment claimed more than the invariant enforced.** The new
   comment in `src/architecture/m3-11-legacy-reset.test.ts` said neither
   Progress route could acquire a plan read "without that showing up here".
   `allowedServerModules` is shared across the whole reopened surface and
   rightly carries `@/server/completions/plan-window-top-up` and both
   rolling-plan modules for the Plan and Today, so either Progress route could
   have imported the top-up and still passed. The claim was made true rather
   than softened: a new `completionOnlySurface` list asserts the two Progress
   sources match neither `plan-window-top-up` nor `rolling-plan`.

   Related, and fixed in the same commit: `page.test.tsx` asserted that
   `readPlanWindowToppedUp` was never called while mocking a module the page
   does not import, so it could only ever report that an uncalled function was
   not called. The mock and that test are removed, with a comment naming the
   invariant test that now carries the claim.

4. **`accountMonth()` could have put an unchecked claim on the screen.** It
   fell back to the current month when the profile carried no usable creation
   date, which would have rendered "You created your FitTip account this
   month" without anything having established that. It now returns `null` and
   the ordinary empty-month sentence is used instead, which is true whatever
   the account's age. Unreachable today, since `Profile.createdAt` is always
   present; closed anyway, and held by a test.

5. **One action had two names.** The month link is "Previous month"; the
   empty-month body said "Step back a month". The body now names the control.

## Delivered behavior

`/home/progress` shows one owner-local calendar month of the owner's
completions, most recent first, grouped under the day each was logged for. The
month is a `month=YYYY-MM` search parameter, so the view is addressable and the
back button steps through the months actually visited; an absent or unusable
parameter falls back to the owner-local current month. Links step to the
previous and next month, and a month other than the current one offers the way
back to it.

Each entry shows its outcome in the same words the log form wrote it with, the
sport, the planned date when the log was written against a session planned for
a different day, the duration, effort and feeling the owner recorded, the note,
a replacement description, and any of the four reported health signals.
Training that was never planned is shown by the title and sport the owner
typed, never by a placeholder.

`/home/progress/[id]` shows one completion on the recorded sheet beside the
planned snapshot the completion stored when it was written, drawn as a carbon
copy. The planned side carries the plan's title, sport, planned date, expected
duration, intent, note, its locked, recurring and cancelled marks, and each
planned activity with the target the plan set for it. Editing the plan
afterwards does not change any of it. A completion with no planned session says
so instead.

Progress reads. There is no Server Action, no form, and no write path anywhere
in the ticket, and it makes no plan read at all.

## Mobile demo path

At `390x844`, signed in as an owner whose time zone is confirmed:

1. `npm.cmd run build` then `npm.cmd run start -- -p 3025`.
2. Open `/home/progress` on a new account: the first-run state reads "Your
   record starts here."
3. Plan a session on `/home/plan` for today, then log it from `/home/today`
   with a duration, an effort, a feeling, a note, and the pain signal.
4. Log unplanned training from the same day with its own title and sport.
5. Open Progress from the bottom navigation: both entries appear under today's
   day mark, each with its outcome stamp and what was recorded.
6. Open the planned entry: the recorded sheet and the carbon copy sit beside
   each other.
7. Rename that session on `/home/plan` and reopen the same record URL: the
   carbon copy still carries the old title.
8. Follow Previous month: "Nothing was logged in <month>."
9. Open `/home/progress/not-a-uuid` and `/home/progress/<a random UUID>`: both
   answer with the same words and the same status.

The equivalent automated walk is
`npx.cmd playwright test --config=e2e/m3-15c.playwright.config.ts` on port
3025.

## Changed files

```
 .github/workflows/ci.yml                         |  10 +
 docs/validation/M3/M3-15C-VALIDATION.md          | 345 ++++++++++++++++
 docs/validation/README.md                        |   8 +
 e2e/m3-11-maintenance.spec.ts                    |  18 +-
 e2e/m3-15c-progress.spec.ts                      | 410 +++++++++++++++++++
 e2e/m3-15c.playwright.config.ts                  |  23 ++
 src/app/home/progress/[id]/page.tsx              | 152 ++++++++
 src/app/home/progress/completion-detail.test.tsx | 204 ++++++++++
 src/app/home/progress/completion-record.tsx      | 153 ++++++++
 src/app/home/progress/error.tsx                  |  26 ++
 src/app/home/progress/loading.tsx                |  13 +
 src/app/home/progress/month.test.ts              |  70 ++++
 src/app/home/progress/month.ts                   |  72 ++++
 src/app/home/progress/page.test.tsx              | 268 +++++++++++++
 src/app/home/progress/page.tsx                   | 192 ++++++++-
 src/app/home/progress/planned-target.test.ts     |  65 +++
 src/app/home/progress/planned-target.ts          | 102 +++++
 src/app/home/progress/progress-month.tsx         | 232 +++++++++++
 src/app/home/progress/progress-record.tsx        | 102 +++++
 src/app/home/progress/progress.module.css        | 477 +++++++++++++++++++++++
 src/architecture/m3-11-legacy-reset.test.ts      |  36 +-
 21 files changed, 2962 insertions(+), 16 deletions(-)
```

`git diff --stat 745c2b5994467976361edf089d10e3edab7b15bf..aee6da1e285acf60b1382b4887f21a4d2e04070a`.
The two `docs/validation/**` counts are this record and its index as they
stood at `aee6da1`; the commit that adds this round's text grows them and
changes no application file.

Nothing was deleted or renamed. Files whose purpose is not evident from the
path and diff:

- `src/app/home/progress/month.ts` — the calendar-month bound itself:
  parsing `month=YYYY-MM`, refusing anything that is not one month, turning a
  month into the inclusive date pair `CompletionLog.list` takes, and stepping
  months in UTC so a daylight-saving change cannot move one.
- `src/app/home/progress/planned-target.ts` — turns one stored
  `TrainingMeasurement` from a planned snapshot into the sentence the carbon
  copy prints. It imports the measurement type with `import type`, which is
  erased, so it does not pull the `server-only` module the type lives in.
- `src/app/home/progress/progress-record.tsx` — the completion view type and
  the recorded-facts block shared by the month list and the single-record page,
  so one record cannot say one thing in the list and another on its own page.
- `src/app/home/progress/completion-detail.test.tsx` — the tests for
  `src/app/home/progress/[id]/page.tsx`. It is named for the route rather than
  co-located as `[id]/page.test.tsx` so that no test-collection glob has to
  cope with the brackets in the directory name.
- `e2e/m3-11-maintenance.spec.ts` — `/home/progress` is dropped from that
  flow's stub route list, which is the same correction M3-15B made when it
  reopened Today and logging. Without it, that flow's "One plan is taking
  shape." assertion could no longer pass and this ticket would have caused a
  regression in another ticket's evidence.
- `src/architecture/m3-11-legacy-reset.test.ts` — the deliberate invariant
  change the brief asked for: `progress/page.tsx` leaves `maintenancePages`,
  both Progress routes join `rollingPlanSurface`, and `allowedServerModules`
  is unchanged because both routes reach only modules already on it. Round 1
  added a second list, `completionOnlySurface`, and an assertion that the two
  Progress sources match neither `plan-window-top-up` nor `rolling-plan` —
  the exclusion the shared allowlist cannot express.
- `src/app/home/progress/page.test.tsx` — round 1 removed a mock of
  `@/server/completions/plan-window-top-up`, a module this page does not
  import, along with the test that asserted the mock was never called. It
  could only ever report that an uncalled function was not called. The
  invariant test above carries that claim now.

## Data, migration, API, privacy, and security effects

- **No migration, no schema change, no new grant, no RPC change.** No file
  under `supabase/` is touched, and `src/lib/supabase/database.types.ts` is
  unchanged. No dependency was added or bumped.
- **No new server module and no new read path.** Both routes go through
  `createCompletionLog()` and its existing `list(start, end)` and `get(id)`.
  The month route additionally reads the profile for the owner's stored zone,
  as Today does.
- **Authorization.** Both repository reads derive the owner id from the
  authenticated session inside the adapter, repeat the `user_id` predicate
  beside RLS, and never accept an owner id from a caller. An anonymous or
  non-owner request raises `CompletionAuthenticationError` or
  `ProfileAuthenticationError` and is redirected to `/` or `/auth/denied`
  before anything renders. Nothing in this ticket can widen that: no code here
  constructs a client, and no query is built outside the adapter.
- **Every query is bounded by the selected month.** The list read is
  `[month-01, month-last]`; the detail read is one id.
- **A missing record and one owned by somebody else are the same answer.**
  `get()` is owner-scoped and returns `null` in both cases, so both render the
  same section, with the same status and the same words, after the same single
  read. An id that is not a UUID is refused before any read and renders that
  same state.
- **Nothing is written to the browser.** No `localStorage`, no cookie, no
  client component beyond the `error.tsx` boundary Next requires.
- **The service-role key** is used only by the Playwright flow to create and
  delete one disposable confirmed account, and the flow deletes it in a
  `finally` block.
- `next.config.ts` already sends `private, no-cache, no-store` for
  `/home/:path*`, which covers both new routes; the browser flow asserts it.

## Tests and final results

The continuous-integration run for the reviewed SHA is the automated-test
evidence.

| SHA | Run | Conclusion |
| --- | --- | --- |
| `d07d0df1e87ec1d8a6425b059f99020bb166e7aa` | [33395347590](https://github.com/mattiss01/fittip/actions/runs/33395347590) | **failure** — the `M3-15C progress` browser step, and only that step. Every other job and browser flow passed. See round 1, finding 1. |
| `fc7ef06930baf74d9b35ff31062ab3de926e5754` | none | The branch has never had a run for this SHA. The earlier version of this record wrongly treated it as the evidence; that was round 1, finding 2. |
| `aee6da1e285acf60b1382b4887f21a4d2e04070a` | pending | The lead records the run URL and its conclusion here after pushing. A red or absent run for this SHA is a delivery blocker. |

**This flow has never passed anywhere.** The round 1 correction is reasoned
from the failure snapshot and from the plan surface's actual render order, not
from a green run, and no local execution is possible here. The CI run for
`aee6da1` is its second execution and its first chance to pass.

Tests added or changed:

- `src/app/home/progress/month.test.ts` — the month bound, including a leap
  February, both year boundaries, and the refusal of anything that is not one
  calendar month.
- `src/app/home/progress/planned-target.test.ts` — every measurement mode, and
  the partly filled targets that must not be completed by guessing.
- `src/app/home/progress/page.test.tsx` — the current-month fallback, the
  bounded read, month paging, the two empty states, the no-zone state, day
  grouping, unplanned naming, and the refusal to claim an account age nothing
  established.
- `src/app/home/progress/completion-detail.test.tsx` — the recorded sheet and
  the carbon copy, the snapshot's own title and date, the unplanned case, the
  refusal of a non-UUID before any read, and the identical answer for a missing
  and an unowned record.
- `src/architecture/m3-11-legacy-reset.test.ts` — `completionOnlySurface`,
  which asserts that neither Progress route can reach a plan module.
- `e2e/m3-15c-progress.spec.ts` — the 390px flow described in the demo path.
- `e2e/m3-11-maintenance.spec.ts` — corrected as described above.

What was run locally while implementing and correcting, and what it reported.
This is not the handoff evidence; the CI run for the reviewed SHA is.

| Command or check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Clean. |
| `npm.cmd run lint` | Clean. |
| `npm.cmd run test:run` | 76 files passed, 2 skipped; 893 tests passed, 2 skipped, after the round 1 corrections. |
| `npm.cmd run build` | Succeeded at `fc7ef06`; `/home/progress` and `/home/progress/[id]` both build as dynamic routes. Not re-run after the round 1 corrections, which touch no route boundary; typecheck and the suite were. |
| `npx.cmd prettier --write <changed files>` | No formatting differences remained. |
| `git diff --check` | Clean on every commit. |
| `npx.cmd playwright test --config=e2e/m3-15c.playwright.config.ts --list` | Collects exactly one spec, confirming the pinned `testMatch`. |
| The M3-15C browser flow, executed locally | **Not run**, at either SHA. It needs Docker and a local Supabase stack; per `CLAUDE.md` the browser matrix is CI's job, not the builder's. See known limitation 1. |

## Project skills applied

`vercel-react-best-practices`, rules actually checked:

- `server-serialization` — only plain view types cross out of the two page
  modules. `Completion` and `CompletionPlannedSnapshot` never reach a
  component.
- `async-cheap-condition-before-await` — the detail route tests the UUID
  before awaiting any read, and the month route derives the month from the
  already-read profile rather than reading again.
- `server-parallel-fetching` / `async-parallel` — the month route's two awaits
  are genuinely dependent: the month cannot be chosen before the owner's zone
  is known. No parallelizable pair was left sequential, and no waterfall was
  added. The detail route makes one read.
- `server-no-shared-module-state` — the only module-level values are frozen
  `Intl` formatters and regular expressions.
- `bundle-barrel-imports` / `bundle-analyzable-paths` — direct, statically
  analyzable imports; no barrel file, no dynamic specifier.
- `rendering-conditional-render` — every conditional is a ternary, never `&&`,
  so an empty list can never render a stray `0`.
- `js-early-exit` — `describeTarget` returns on the first matching shape.
- The re-render rules do not apply: the ticket adds no client component beyond
  the `error.tsx` boundary Next requires, and that has no state.

`frontend-design`, applied and recorded in the stylesheet header:

- The existing FitTip ledger direction is kept rather than replaced — cream
  stock, deep green ink, hard edges, offset shadow, Courier stamps — and
  Today's outcome stamp is reused unchanged so one outcome never looks like two
  different facts.
- Two signatures, both encoding something true. The month is a bound logbook:
  one continuous rule with each day's number set in the gutter beside it, which
  is what a dated record is. One completion is a carbon copy beside the top
  sheet: the planned side is drawn on washed stock in carbon ink with a dashed
  perforated edge, because a stored planned snapshot *is* a duplicate taken at
  the time and cannot change afterwards.
- Copy: active voice, sentence case, no apology in the failure state, and each
  empty state is an invitation to act rather than a mood. No figure on the
  surface is computed.
- Quality floor: 390px first, `2.75rem` minimum touch targets on every link,
  a visible 3px focus ring, a reduced-motion path, and a visually hidden day
  heading so the grouping is navigable without printing the date twice.

## Known limitations

1. **The browser flow has still never passed, and the risk this limitation
   predicted materialized.** Written without ever being executed, it failed on
   its first CI run for exactly the reason recorded here — a wait that could
   not wait, in the arrangement step. The correction in `aee6da1` is reasoned
   from the failure snapshot and from the plan surface's actual render order,
   and it too has never been executed: the browser matrix needs Docker and a
   local Supabase stack, and `CLAUDE.md` puts that with CI rather than the
   builder. **Treat the flow as unproven until a run for `aee6da1` is green.**
   Everything after the arrangement step has still never run once, so a
   further defect further down the flow would be a second finding of the same
   kind rather than a surprise. The assertions there were re-read against the
   real markup, and the two most brittle were narrowed before the first
   commit, but reading is not running.
2. **"An owner who has logged nothing ever" is not literally knowable, and the
   brief did not say how to know it.** Every read is bounded by the selected
   month, so no read can prove that no completion exists in any month. The
   first-run state therefore fires when the current month is empty *and* the
   owner's account was created in that same month *and* that creation month is
   actually known — round 1 closed a fallback that would have guessed it. Its
   wording claims only that: "You created your FitTip account this month, and
   nothing is logged in it yet." It never claims nothing exists anywhere. An
   owner who back-dates a log to a month before their account existed still sees
   that sentence in their first month, and the back-dated record is still
   visible in its own month by paging to it. Widening this would need either an
   unbounded read or a new adapter method, and both are outside this ticket.
3. **`src/lib/auth/safe-return.ts` was deliberately not touched.** Its
   allowlist still carries `^/home/progress/(?:plan|completion)-<uuid>$`, the
   legacy detail shape, and does not match the new `/home/progress/<uuid>`; it
   also rejects `/home/progress?month=YYYY-MM` because it allows no search
   string on a simple destination. Both cases fail closed — the owner is
   returned to `/home/today` rather than to the record or month they were
   reading — so this is a small loss of return fidelity, not a security
   weakness. It is a redirect allowlist, which is a security control the brief
   did not put in scope, so it is reported rather than changed.
4. **No completion the current app can write carries planned activities.** The
   Plan surface has no activity editor yet, so a planned snapshot's activity
   list is empty in practice and the carbon copy's activity block will not
   render. `describeTarget` is therefore covered by unit tests across all five
   measurement modes and not by the browser flow.
5. **No actual per-activity measurement is shown**, per the brief's non-goal.
   The schema has carried `actual_measurement` since M3-15A but nothing
   captures it, so there would be nothing to draw.
6. **Progress offers no link into `/home/log`.** Every write stays on the log
   form, reached from Today, and adding a correction affordance to a read-only
   surface was outside the brief. An owner who wants to correct a record still
   does it from Today, as before.
7. **`actualStartedAt` is not displayed.** The log form does not collect it, so
   showing it would print an empty row on every record.
8. **Timing equality between a missing and an unowned record is asserted by
   construction, not measured.** Both take the same single owner-scoped read
   and the same render path; no test measures wall-clock time, and no honest
   browser assertion could.
9. **The `format:check` script still fails repository-wide on this checkout**
   for the CRLF reason recorded in `CLAUDE.md`. Every file this ticket touches
   was run through `prettier --write` and produced no diff.
10. **The baseline in `CLAUDE.md` ("39 test files / 229 tests") is stale** —
    the suite is now 78 files and 895 tests. That predates this ticket and was
    left alone.

## Independent reviewer checklist

Review the exact commit
`aee6da1e285acf60b1382b4887f21a4d2e04070a` on `ticket/m3-15c-progress`, over
`git diff 745c2b5994467976361edf089d10e3edab7b15bf..aee6da1e285acf60b1382b4887f21a4d2e04070a`.
Round 1 rejected `fc7ef06`, so no earlier commit or preview stands. The
correction range alone is
`git diff fc7ef06930baf74d9b35ff31062ab3de926e5754..aee6da1e285acf60b1382b4887f21a4d2e04070a`.
Confirm the continuous-integration run for `aee6da1` is green and that its
Vercel Preview reached `READY`. Do not re-run lint, typecheck, the unit suite,
the build, or the browser flow; CI covers all of them.

What needs judgment CI cannot supply:

1. **Authorization.** Confirm neither route can be reached anonymously or
   cross-owner, that no owner id is ever taken from a caller, and that the
   redirect-on-auth-error handling in both pages matches Today's.
2. **The read bound.** Confirm every query is bounded by the selected month or
   by one id, that `readRequestedMonth` cannot admit a month that produces an
   invalid date, and that no unbounded read was introduced anywhere.
3. **No plan read.** Confirm neither route imports or calls
   `readPlanWindowToppedUp`, `createRollingPlan`, or any plan seam, so viewing
   history cannot materialize future occurrences. Round 1 replaced an inert
   mock with `completionOnlySurface` in the architecture test; confirm that
   assertion is the real guard and that no comment anywhere still claims more
   than a test enforces.
4. **The snapshot is the completion's own copy.** Confirm the planned side is
   read only from `completion.plannedSnapshot` and never through to a live
   plan row, and that the browser flow's rename step actually proves it.
5. **Honest states.** Confirm the empty month, the first-run month, the
   no-zone state, the not-found state, and `error.tsx` each say a different,
   true thing, that none of them is a zero or a fabricated figure, and that
   known limitation 2 above is an accurate description of what the first-run
   sentence claims.
6. **Indistinguishability.** Confirm a missing record and an unowned one
   cannot be told apart from the response, and say so if you find any
   difference in status, copy, headers, or code path.
7. **The invariant change.** Confirm the edit to
   `src/architecture/m3-11-legacy-reset.test.ts` tightens rather than relaxes:
   both routes moved from a list that forbade `@/server/**` outright to one
   that allows only an explicit module list, and no module was added to that
   list.
8. **The round 1 corrections themselves.** Confirm the new wait in
   `e2e/m3-15c-progress.spec.ts` cannot resolve before the zone is stored and
   uses no timeout or retry; that `accountMonth` returning `null` reaches the
   ordinary empty-month sentence rather than any other branch; and that the
   empty-month body now names the control it points at. Known limitation 1 is
   the honest state of the flow — the rest of it has still never executed.
9. **Scope.** Confirm nothing outside the brief changed. In particular confirm
   the `e2e/m3-11-maintenance.spec.ts` edit is the minimum needed to stop it
   asserting a stub on a route this ticket reopened, and that the CI step is
   purely additive with no existing step reordered or weakened.
10. **Product invariants.** Confirm nothing on the surface totals, counts,
    ranks, streaks, or charts, that no write path or Server Action exists
    anywhere in the diff, and that the four health signals are rendered as
    facts the owner reported rather than as a judgment.
